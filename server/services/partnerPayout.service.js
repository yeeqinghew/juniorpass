const syncPartnerEarnings = async (db, partnerId = null) => {
  const parameters = partnerId ? [partnerId] : [];
  const partnerFilter = partnerId ? "AND l.partner_id = $1" : "";

  await db.query(
    `INSERT INTO partner_earnings (
       partner_id, booking_id, occurrence_id, listing_id, source,
       occurrence_number, credits, dollars_per_credit, gross_amount,
       status, available_at
     )
     SELECT l.partner_id, b.booking_id, co.occurrence_id, l.listing_id,
            'BOOKING_OCCURRENCE', co.occurrence_number,
            allocation.credits,
            COALESCE(rate.setting_value, b.dollars_per_credit, 9.5) AS dollars_per_credit,
            ROUND(allocation.credits *
              COALESCE(rate.setting_value, b.dollars_per_credit, 9.5), 2) AS gross_amount,
            CASE
              WHEN b.status = 'cancelled' OR co.status = 'cancelled' THEN 'REVERSED'
              WHEN co.scheduled_end_date <= NOW() THEN 'AVAILABLE'
              ELSE 'PENDING'
            END,
            CASE
              WHEN b.status <> 'cancelled' AND co.status <> 'cancelled'
                AND co.scheduled_end_date <= NOW()
              THEN co.scheduled_end_date
              ELSE NULL
            END
     FROM class_occurrences co
     JOIN bookings b ON b.booking_id = co.booking_id
     JOIN listings l ON l.listing_id = b.listing_id
     LEFT JOIN class_occurrences original
       ON original.occurrence_id = co.makeup_for_occurrence_id
     CROSS JOIN LATERAL (
       SELECT COALESCE(b.partner_credited_credits, b.charged_credits, 0)::numeric AS total_credits,
              GREATEST(COALESCE(b.classes_total, 1), 1) AS class_count,
              COALESCE(original.occurrence_number, co.occurrence_number) AS allocation_number
     ) package
     CROSS JOIN LATERAL (
       SELECT CASE
         WHEN package.allocation_number = package.class_count
         THEN package.total_credits
           - ROUND(package.total_credits / package.class_count, 4) * (package.class_count - 1)
         ELSE ROUND(package.total_credits / package.class_count, 4)
       END AS credits
     ) allocation
     LEFT JOIN LATERAL (
       SELECT psh.new_value AS setting_value
       FROM platform_setting_history psh
       WHERE psh.setting_key = 'partner_dollars_per_credit'
         AND psh.effective_from <= co.scheduled_end_date
       ORDER BY psh.effective_from DESC, psh.history_id DESC
       LIMIT 1
     ) rate ON TRUE
     WHERE COALESCE(b.partner_credited_credits, b.charged_credits, 0) > 0
       AND NOT EXISTS (
         SELECT 1
         FROM partner_earnings opening
         WHERE opening.partner_id = l.partner_id
           AND opening.source = 'OPENING_BALANCE'
           AND b.created_at <= opening.created_at
       )
       ${partnerFilter}
     ON CONFLICT (occurrence_id) WHERE occurrence_id IS NOT NULL DO UPDATE SET
       available_at = CASE
         WHEN partner_earnings.status IN ('IN_PAYOUT', 'SETTLED')
         THEN partner_earnings.available_at
         ELSE EXCLUDED.available_at
       END,
       status = CASE
         WHEN partner_earnings.status IN ('IN_PAYOUT', 'SETTLED') THEN partner_earnings.status
         ELSE EXCLUDED.status
       END,
       credits = CASE
         WHEN partner_earnings.status IN ('IN_PAYOUT', 'SETTLED') THEN partner_earnings.credits
         ELSE EXCLUDED.credits
       END,
       gross_amount = CASE
         WHEN partner_earnings.status IN ('IN_PAYOUT', 'SETTLED') THEN partner_earnings.gross_amount
         ELSE EXCLUDED.gross_amount
       END,
       listing_id = COALESCE(partner_earnings.listing_id, EXCLUDED.listing_id),
       dollars_per_credit = COALESCE(partner_earnings.dollars_per_credit, EXCLUDED.dollars_per_credit),
       updated_at = NOW()`,
    parameters,
  );

  await db.query(
    `UPDATE partner_earnings pe
     SET status = CASE
           WHEN b.status = 'cancelled' OR co.status = 'cancelled' THEN 'REVERSED'
           WHEN co.scheduled_end_date <= NOW() THEN 'AVAILABLE'
           ELSE 'PENDING'
         END,
         available_at = CASE
           WHEN b.status <> 'cancelled' AND co.status <> 'cancelled'
             AND co.scheduled_end_date <= NOW()
           THEN co.scheduled_end_date
           ELSE NULL
         END,
         updated_at = NOW()
     FROM class_occurrences co
     JOIN bookings b ON b.booking_id = co.booking_id
     WHERE pe.occurrence_id = co.occurrence_id
       AND NOT EXISTS (
         SELECT 1
         FROM partner_earnings opening
         WHERE opening.partner_id = pe.partner_id
           AND opening.source = 'OPENING_BALANCE'
           AND b.created_at <= opening.created_at
       )
       AND pe.status IN ('PENDING', 'AVAILABLE', 'REVERSED')
       AND pe.payout_id IS NULL
       ${partnerId ? "AND pe.partner_id = $1" : ""}`,
    parameters,
  );
};

const getNextSettlementDate = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
};

module.exports = { getNextSettlementDate, syncPartnerEarnings };
