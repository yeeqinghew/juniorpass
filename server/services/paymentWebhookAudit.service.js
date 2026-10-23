const pool = require("../db");

const cleanText = (value, maxLength = 255) => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text ? text.slice(0, maxLength) : null;
};

const cleanAmount = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
};

function sanitizeWebhookAuditData(parsed = {}, signatureValid = false) {
  if (!signatureValid) {
    return {
      referenceNumber: null,
      hitpayPaymentId: null,
      paymentStatus: null,
      amount: null,
    };
  }

  return {
    referenceNumber: cleanText(parsed.reference_number),
    hitpayPaymentId: cleanText(parsed.payment_request_id),
    paymentStatus: cleanText(parsed.status, 50)?.toUpperCase() || null,
    amount: cleanAmount(parsed.amount),
  };
}

async function recordWebhookEvent({
  parsed,
  signatureValid,
  processingStatus,
  responseCode = null,
  errorCode = null,
}) {
  const data = sanitizeWebhookAuditData(parsed, signatureValid);
  const paymentResult =
    data.referenceNumber && data.hitpayPaymentId
      ? await pool.query(
          `SELECT request_id
           FROM payment_requests
           WHERE reference_number = $1 AND hitpay_payment_id = $2
           ORDER BY created_at DESC
           LIMIT 1`,
          [data.referenceNumber, data.hitpayPaymentId],
        )
      : { rows: [] };

  const result = await pool.query(
    `INSERT INTO payment_webhook_events (
       payment_request_id,
       reference_number,
       hitpay_payment_id,
       payment_status,
       amount,
       signature_valid,
       processing_status,
       response_code,
       error_code,
       processed_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
       CASE WHEN $7 = 'RECEIVED' THEN NULL ELSE NOW() END)
     RETURNING webhook_event_id`,
    [
      paymentResult.rows[0]?.request_id || null,
      data.referenceNumber,
      data.hitpayPaymentId,
      data.paymentStatus,
      data.amount,
      signatureValid,
      processingStatus,
      responseCode,
      cleanText(errorCode, 100),
    ],
  );

  return result.rows[0].webhook_event_id;
}

async function completeWebhookEvent(
  webhookEventId,
  { processingStatus, responseCode, errorCode = null },
) {
  if (!webhookEventId) return;
  await pool.query(
    `UPDATE payment_webhook_events
     SET processing_status = $2,
         response_code = $3,
         error_code = $4,
         processed_at = NOW()
     WHERE webhook_event_id = $1`,
    [
      webhookEventId,
      processingStatus,
      responseCode,
      cleanText(errorCode, 100),
    ],
  );
}

module.exports = {
  completeWebhookEvent,
  recordWebhookEvent,
  sanitizeWebhookAuditData,
};
