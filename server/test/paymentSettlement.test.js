const test = require("node:test");
const assert = require("node:assert/strict");

const {
  PaymentSettlementError,
  settleCompletedPayment,
  reconcileReferralReward,
} = require("../services/paymentSettlement.service");

const USER_ID = "11111111-1111-4111-a111-111111111111";
const REFERRER_ID = "22222222-2222-4222-a222-222222222222";
const PAYMENT_ID = "33333333-3333-4333-a333-333333333333";

function result(rows = [], rowCount = rows.length) {
  return { rows, rowCount };
}

function scriptedPool(steps) {
  const queries = [];
  let released = false;

  const client = {
    async query(sql, params) {
      const normalized = String(sql).replace(/\s+/g, " ").trim();
      queries.push({ sql: normalized, params });
      const step = steps.shift();
      assert.ok(step, `Unexpected query: ${normalized}`);
      assert.match(normalized, step.match);
      if (step.check) step.check(params, normalized);
      if (step.error) throw step.error;
      return step.result || result();
    },
    release() {
      released = true;
    },
  };

  return {
    pool: { async connect() { return client; } },
    queries,
    assertFinished() {
      assert.equal(steps.length, 0, "Every expected query should run");
      assert.equal(released, true, "Database client should always be released");
    },
  };
}

function pendingPayment(overrides = {}) {
  return {
    request_id: PAYMENT_ID,
    user_id: USER_ID,
    amount: "188.00",
    credits: 20,
    reference_number: "reference-1",
    hitpay_payment_id: "hitpay-1",
    status: "PENDING",
    webhook_received: false,
    settled_at: null,
    created_at: new Date("2026-08-30T00:00:00.000Z"),
    ...overrides,
  };
}

test("settles payment and first-purchase referral in one locked transaction", async () => {
  const harness = scriptedPool([
    { match: /^BEGIN$/ },
    {
      match: /FROM payment_requests WHERE reference_number = \$1 FOR UPDATE$/,
      result: result([pendingPayment()]),
    },
    {
      match: /SELECT EXISTS .*has_previous_completed_payment$/,
      result: result([{ has_previous_completed_payment: false }]),
    },
    {
      match: /FROM referrals .*status = 'pending'.*FOR UPDATE$/,
      result: result([
        { id: 7, referrer_id: REFERRER_ID, referee_id: USER_ID, status: "pending" },
      ]),
    },
    {
      match: /FROM users .*ORDER BY user_id FOR UPDATE$/,
      check(params) {
        assert.deepEqual(params[0], [USER_ID, REFERRER_ID].sort());
      },
      result: result([{ user_id: USER_ID }, { user_id: REFERRER_ID }]),
    },
    { match: /UPDATE payment_requests SET status = 'COMPLETED'/ },
    {
      match: /UPDATE users SET credit = COALESCE\(credit, 0\) \+ \$1 WHERE user_id = \$2 RETURNING credit$/,
      result: result([{ credit: 120 }]),
    },
    { match: /INSERT INTO transactions .*payment_request_id/ },
    {
      match: /UPDATE referrals SET status = 'completed'/,
      result: result([{ id: 7 }]),
    },
    { match: /UPDATE users SET credit = COALESCE\(credit, 0\) \+ \$1 WHERE user_id = ANY/ },
    { match: /INSERT INTO transactions .*referral_id/ },
    { match: /INSERT INTO notifications/ },
    { match: /^COMMIT$/ },
  ]);

  const settlement = await settleCompletedPayment({
    dbPool: harness.pool,
    referenceNumber: "reference-1",
    hitpayPaymentId: "hitpay-1",
    paidAmount: "188.00",
    source: "webhook",
  });

  assert.deepEqual(settlement, {
    completed: true,
    alreadyCompleted: false,
    paymentRequestId: PAYMENT_ID,
    walletCredit: 120,
    referralRewarded: true,
  });
  assert.ok(
    harness.queries.findIndex((query) => query.sql.includes("FROM referrals")) <
      harness.queries.findIndex((query) => query.sql.includes("FROM users")),
    "Referral row must be locked before wallet rows",
  );
  harness.assertFinished();
});

test("repeated settlement is idempotent and performs no wallet writes", async () => {
  const harness = scriptedPool([
    { match: /^BEGIN$/ },
    {
      match: /FROM payment_requests WHERE reference_number = \$1 FOR UPDATE$/,
      result: result([
        pendingPayment({
          status: "COMPLETED",
          webhook_received: true,
          settled_at: new Date(),
        }),
      ]),
    },
    { match: /^COMMIT$/ },
  ]);

  const settlement = await settleCompletedPayment({
    dbPool: harness.pool,
    referenceNumber: "reference-1",
    hitpayPaymentId: "hitpay-1",
    paidAmount: "188.00",
  });

  assert.equal(settlement.alreadyCompleted, true);
  assert.equal(
    harness.queries.some((query) => query.sql.startsWith("UPDATE users")),
    false,
  );
  harness.assertFinished();
});

test("a late webhook records receipt without replaying fallback settlement", async () => {
  const harness = scriptedPool([
    { match: /^BEGIN$/ },
    {
      match: /FROM payment_requests WHERE reference_number = \$1 FOR UPDATE$/,
      result: result([
        pendingPayment({
          status: "COMPLETED",
          webhook_received: false,
          settled_at: new Date(),
        }),
      ]),
    },
    { match: /UPDATE payment_requests SET webhook_received = true/ },
    { match: /^COMMIT$/ },
  ]);

  const settlement = await settleCompletedPayment({
    dbPool: harness.pool,
    referenceNumber: "reference-1",
    hitpayPaymentId: "hitpay-1",
    paidAmount: "188.00",
    source: "webhook",
  });

  assert.equal(settlement.alreadyCompleted, true);
  assert.equal(
    harness.queries.some((query) => query.sql.startsWith("UPDATE users")),
    false,
  );
  harness.assertFinished();
});

test("amount mismatch rolls back before any financial write", async () => {
  const harness = scriptedPool([
    { match: /^BEGIN$/ },
    {
      match: /FROM payment_requests WHERE reference_number = \$1 FOR UPDATE$/,
      result: result([pendingPayment()]),
    },
    { match: /^ROLLBACK$/ },
  ]);

  await assert.rejects(
    settleCompletedPayment({
      dbPool: harness.pool,
      referenceNumber: "reference-1",
      hitpayPaymentId: "hitpay-1",
      paidAmount: "1.00",
    }),
    (error) =>
      error instanceof PaymentSettlementError &&
      error.code === "PAYMENT_AMOUNT_MISMATCH",
  );

  assert.equal(
    harness.queries.some((query) => query.sql.startsWith("UPDATE")),
    false,
  );
  harness.assertFinished();
});

test("any referral-side failure rolls the whole payment settlement back", async () => {
  const harness = scriptedPool([
    { match: /^BEGIN$/ },
    {
      match: /FROM payment_requests WHERE reference_number = \$1 FOR UPDATE$/,
      result: result([pendingPayment()]),
    },
    {
      match: /SELECT EXISTS .*has_previous_completed_payment$/,
      result: result([{ has_previous_completed_payment: false }]),
    },
    {
      match: /FROM referrals .*FOR UPDATE$/,
      result: result([
        { id: 7, referrer_id: REFERRER_ID, referee_id: USER_ID, status: "pending" },
      ]),
    },
    {
      match: /FROM users .*FOR UPDATE$/,
      result: result([{ user_id: USER_ID }, { user_id: REFERRER_ID }]),
    },
    { match: /UPDATE payment_requests/ },
    {
      match: /UPDATE users .*RETURNING credit$/,
      result: result([{ credit: 120 }]),
    },
    { match: /INSERT INTO transactions .*payment_request_id/ },
    {
      match: /UPDATE referrals SET status = 'completed'/,
      result: result([{ id: 7 }]),
    },
    { match: /UPDATE users .*ANY/ },
    { match: /INSERT INTO transactions .*referral_id/ },
    { match: /INSERT INTO notifications/, error: new Error("notification write failed") },
    { match: /^ROLLBACK$/ },
  ]);

  await assert.rejects(
    settleCompletedPayment({
      dbPool: harness.pool,
      referenceNumber: "reference-1",
      hitpayPaymentId: "hitpay-1",
      paidAmount: "188.00",
    }),
    /notification write failed/,
  );

  assert.equal(harness.queries.at(-1).sql, "ROLLBACK");
  harness.assertFinished();
});

test("admin reconciliation requires a completed payment and is idempotent", async () => {
  const harness = scriptedPool([
    { match: /^BEGIN$/ },
    {
      match: /SELECT id, referee_id, created_at FROM referrals WHERE id = \$1$/,
      result: result([
        {
          id: 7,
          referee_id: USER_ID,
          created_at: new Date("2026-08-29T00:00:00.000Z"),
        },
      ]),
    },
    {
      match: /FROM payment_requests .*status = 'COMPLETED'.*FOR UPDATE$/,
      result: result([{ request_id: PAYMENT_ID }]),
    },
    {
      match: /FROM referrals WHERE id = \$1 FOR UPDATE$/,
      result: result([
        {
          id: 7,
          referrer_id: REFERRER_ID,
          referee_id: USER_ID,
          status: "completed",
          rewarded_payment_request_id: PAYMENT_ID,
        },
      ]),
    },
    { match: /^COMMIT$/ },
  ]);

  const reconciliation = await reconcileReferralReward({
    dbPool: harness.pool,
    referralId: 7,
  });

  assert.equal(reconciliation.alreadyCompleted, true);
  assert.equal(
    harness.queries.some((query) => query.sql.startsWith("UPDATE users")),
    false,
  );
  harness.assertFinished();
});
