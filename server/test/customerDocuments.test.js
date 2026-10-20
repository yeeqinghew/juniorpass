const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildDocumentEmail,
  getBookingConfirmation,
  getPaymentReceipt,
  sendPaymentReceipt,
} = require("../services/customerDocuments.service");

const bookingRow = {
  booking_id: "11111111-1111-4111-8111-111111111111",
  user_id: "22222222-2222-4222-8222-222222222222",
  start_date: "2026-11-10T09:00:00.000Z",
  end_date: "2026-11-10T10:00:00.000Z",
  enrolled_package_type: "full-term",
  classes_total: 12,
  charged_credits: 120,
  status: "confirmed",
  policy_snapshot: {
    version: 1,
    cancellation_notice_hours: 24,
    refund_before_deadline_percent: 100,
    refund_after_deadline_percent: 0,
    makeup_allowed: true,
    makeup_notice_hours: 24,
    class_requirements: "Bring a water bottle <label>",
  },
  created_at: "2026-10-15T02:00:00.000Z",
  customer_name: "Parent <Name>",
  customer_email: "parent@example.com",
  child_name: "Jamie",
  listing_title: "Basketball beginners",
  partner_name: "Junior Sports",
  outlet_name: "North Hall",
  outlet_address: JSON.stringify({
    ADDRESS: "10 Example Road",
    POSTAL_CODE: "123456",
  }),
};

const paymentRow = {
  request_id: "33333333-3333-4333-8333-333333333333",
  user_id: bookingRow.user_id,
  amount: "94.00",
  credits: 10,
  reference_number: "44444444-4444-4444-8444-444444444444",
  hitpay_payment_id: "hitpay-123",
  status: "COMPLETED",
  settled_at: "2026-10-15T03:00:00.000Z",
  created_at: "2026-10-15T02:59:00.000Z",
  customer_name: bookingRow.customer_name,
  customer_email: bookingRow.customer_email,
};

const databaseReturning = (row) => ({
  async query(sql, values) {
    if (/^UPDATE /m.test(sql.trim())) {
      return { rowCount: 1, rows: [] };
    }
    assert.match(sql, /\(\$2::uuid IS NULL OR/);
    assert.equal(values[1], bookingRow.user_id);
    return { rowCount: 1, rows: [row] };
  },
});

test("builds an owned booking confirmation from the saved policy snapshot", async () => {
  const document = await getBookingConfirmation({
    db: databaseReturning(bookingRow),
    bookingId: bookingRow.booking_id,
    userId: bookingRow.user_id,
  });

  assert.equal(document.credits_charged, 120);
  assert.equal(document.outlet_address, "10 Example Road, 123456");
  assert.equal(document.policy.refund_before_deadline_percent, 100);
  assert.equal(
    document.policy.cancellation_deadline,
    "2026-11-09T09:00:00.000Z",
  );
});

test("builds a completed payment receipt with monetary and provider references", async () => {
  const document = await getPaymentReceipt({
    db: databaseReturning(paymentRow),
    paymentRequestId: paymentRow.request_id,
    userId: bookingRow.user_id,
  });

  assert.equal(document.amount, 94);
  assert.equal(document.credits_purchased, 10);
  assert.equal(document.payment_provider, "HitPay");
  assert.match(document.reference, /^JPR-/);
});

test("escapes stored user content in customer document emails", async () => {
  const document = await getBookingConfirmation({
    db: databaseReturning(bookingRow),
    bookingId: bookingRow.booking_id,
    userId: bookingRow.user_id,
  });
  const html = buildDocumentEmail(document, {
    FRONTEND_URL: "https://staging.juniorpass.sg",
  });

  assert.doesNotMatch(html, /Parent <Name>/);
  assert.match(html, /Parent &lt;Name&gt;/);
  assert.match(html, /water bottle &lt;label&gt;/);
  assert.match(html, /https:\/\/staging\.juniorpass\.sg\/juniorpass-logo\.png/);
});

test("automatic receipt delivery uses a deterministic idempotency key", async () => {
  const calls = [];
  await sendPaymentReceipt({
    db: databaseReturning(paymentRow),
    paymentRequestId: paymentRow.request_id,
    userId: bookingRow.user_id,
    automatic: true,
    sendEmailImpl: async (...args) => calls.push(args),
  });
  await sendPaymentReceipt({
    db: databaseReturning(paymentRow),
    paymentRequestId: paymentRow.request_id,
    userId: bookingRow.user_id,
    automatic: true,
    sendEmailImpl: async (...args) => calls.push(args),
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0][3].idempotencyKey, calls[1][3].idempotencyKey);
});

test("does not automatically redeliver a receipt already marked as sent", async () => {
  let sendCount = 0;
  const document = await sendPaymentReceipt({
    db: databaseReturning({
      ...paymentRow,
      receipt_email_sent_at: "2026-10-15T03:01:00.000Z",
    }),
    paymentRequestId: paymentRow.request_id,
    userId: bookingRow.user_id,
    automatic: true,
    sendEmailImpl: async () => {
      sendCount += 1;
    },
  });

  assert.ok(document);
  assert.equal(sendCount, 0);
});
