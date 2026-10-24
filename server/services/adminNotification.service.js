const { getNextSettlementDate } = require("./partnerPayout.service");

const ADMIN_NOTIFICATION_TYPES = Object.freeze({
  FAILED_PAYMENT: "payment_failed",
  BOOKING_DISPUTE: "booking_dispute",
  PARTNER_APPLICATION: "partner_application",
  SETTLEMENT_DEADLINE: "settlement_deadline",
  SYSTEM_FAILURE: "system_failure",
});

async function insertOperationalNotifications(db, adminId, sourceSql, params = []) {
  await db.query(
    `INSERT INTO notifications (
       recipient_type, recipient_id, type, title, message, data
     )
     ${sourceSql}
     ON CONFLICT (recipient_type, recipient_id, (data->>'event_key'))
       WHERE data ? 'event_key'
     DO NOTHING`,
    [adminId, ...params],
  );
}

async function syncAdminOperationalNotifications(db, adminId) {
  await Promise.all([
    insertOperationalNotifications(
      db,
      adminId,
      `SELECT 'admin', $1, '${ADMIN_NOTIFICATION_TYPES.FAILED_PAYMENT}',
              'Payment failed',
              CONCAT(u.name, '''s ', pr.credits, '-credit top-up failed.'),
              jsonb_build_object(
                'event_key', CONCAT('payment_failed:', pr.request_id),
                'request_id', pr.request_id,
                'reference_number', pr.reference_number,
                'route', '/payments'
              )
       FROM payment_requests pr
       JOIN users u ON u.user_id = pr.user_id
       WHERE pr.status = 'FAILED'
         AND pr.created_at >= NOW() - INTERVAL '90 days'`,
    ),
    insertOperationalNotifications(
      db,
      adminId,
      `SELECT 'admin', $1, '${ADMIN_NOTIFICATION_TYPES.PARTNER_APPLICATION}',
              'Partner application waiting',
              CONCAT(pf.company_name, ' is waiting for a response.'),
              jsonb_build_object(
                'event_key', CONCAT('partner_application:', pf.id),
                'partner_form_id', pf.id,
                'route', '/partner-enquiries'
              )
       FROM partnerForms pf
       WHERE pf.responded = FALSE`,
    ),
    insertOperationalNotifications(
      db,
      adminId,
      `SELECT 'admin', $1, '${ADMIN_NOTIFICATION_TYPES.SYSTEM_FAILURE}',
              'Payment webhook needs attention',
              CONCAT('HitPay callback ', pwe.webhook_event_id,
                     ' ended as ', LOWER(pwe.processing_status), '.'),
              jsonb_build_object(
                'event_key', CONCAT('webhook_failure:', pwe.webhook_event_id),
                'webhook_event_id', pwe.webhook_event_id,
                'error_code', pwe.error_code,
                'route', '/payments'
              )
       FROM payment_webhook_events pwe
       WHERE pwe.processing_status IN ('FAILED', 'REJECTED')
         AND pwe.received_at >= NOW() - INTERVAL '30 days'`,
    ),
  ]);

  const deadline = getNextSettlementDate();
  const millisecondsUntilDeadline = deadline.getTime() - Date.now();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  if (millisecondsUntilDeadline < 0 || millisecondsUntilDeadline > sevenDays) {
    return;
  }

  const deadlineKey = deadline.toISOString().slice(0, 10);
  await insertOperationalNotifications(
    db,
    adminId,
    `SELECT 'admin', $1, '${ADMIN_NOTIFICATION_TYPES.SETTLEMENT_DEADLINE}',
            'Partner settlement is due soon',
            CONCAT(COUNT(DISTINCT pe.partner_id),
                   ' partner accounts have available earnings to settle by ',
                   TO_CHAR($2::date, 'DD Mon YYYY'), '.'),
            jsonb_build_object(
              'event_key', CONCAT('settlement_deadline:', $3::text),
              'settlement_date', $3::text,
              'partner_count', COUNT(DISTINCT pe.partner_id),
              'route', '/payouts'
            )
     FROM partner_earnings pe
     WHERE pe.status = 'AVAILABLE'
     HAVING COUNT(*) > 0`,
    [deadline, deadlineKey],
  );
}

module.exports = {
  ADMIN_NOTIFICATION_TYPES,
  syncAdminOperationalNotifications,
};
