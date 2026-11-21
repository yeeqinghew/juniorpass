const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  CreditAdjustmentError,
  applyCreditAdjustment,
  normalizeCreditAdjustment,
} = require("../services/creditAdjustment.service");

const PARENT_ID = "11111111-1111-4111-8111-111111111111";
const ADMIN_ID = "22222222-2222-4222-8222-222222222222";
const ADJUSTMENT_ID = "33333333-3333-4333-8333-333333333333";

test("validates controlled credit adjustment input", () => {
  assert.deepEqual(
    normalizeCreditAdjustment({
      account_type: "parent",
      account_id: PARENT_ID,
      direction: "debit",
      credits: 12,
      reason: "Duplicate support credit correction",
      reference: "SUP-1001",
      idempotency_key: "adjustment-test-1001",
    }),
    {
      accountType: "parent",
      accountId: PARENT_ID,
      credits: 12,
      creditDelta: -12,
      direction: "debit",
      reason: "Duplicate support credit correction",
      reference: "SUP-1001",
      idempotencyKey: "adjustment-test-1001",
    },
  );

  assert.throws(
    () =>
      normalizeCreditAdjustment({
        account_type: "parent",
        account_id: PARENT_ID,
        direction: "debit",
        credits: 0,
        reason: "Too small",
        idempotency_key: "adjustment-test-1002",
      }),
    CreditAdjustmentError,
  );
});

test("applies a parent credit correction in one locked transaction", async () => {
  const queries = [];
  const client = {
    async query(sql, parameters = []) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      queries.push({ sql: normalized, parameters });
      if (normalized.startsWith("SELECT adjustment_id")) {
        return { rowCount: 0, rows: [] };
      }
      if (normalized.includes("FROM users") && normalized.includes("FOR UPDATE")) {
        return {
          rowCount: 1,
          rows: [
            {
              account_id: PARENT_ID,
              account_name: "Parent",
              email: "parent@example.com",
              stored_credit: 50,
              credit_expires_at: new Date(Date.now() + 86_400_000),
              user_type: "parent",
            },
          ],
        };
      }
      if (normalized.startsWith("INSERT INTO credit_adjustments")) {
        return {
          rowCount: 1,
          rows: [
            {
              adjustment_id: ADJUSTMENT_ID,
              account_type: "parent",
              parent_id: PARENT_ID,
              credit_delta: -10,
              balance_before: 50,
              balance_after: 40,
            },
          ],
        };
      }
      return { rowCount: 1, rows: [] };
    },
    release() {},
  };
  const pool = { async connect() { return client; } };

  const result = await applyCreditAdjustment(pool, {
    account_type: "parent",
    account_id: PARENT_ID,
    direction: "debit",
    credits: 10,
    reason: "Duplicate support credit correction",
    reference: "SUP-1001",
    idempotency_key: "adjustment-test-1003",
    admin_id: ADMIN_ID,
    request_id: "request-1",
  });

  assert.equal(result.account.credit, 40);
  assert.equal(result.alreadyApplied, false);
  assert.ok(queries.some((query) => query.sql.includes("pg_advisory_xact_lock")));
  assert.ok(queries.some((query) => query.sql.startsWith("UPDATE users")));
  assert.ok(
    !queries.some((query) => query.sql.startsWith("INSERT INTO transactions")),
  );
  assert.ok(queries.some((query) => query.sql.startsWith("INSERT INTO audit_events")));
  assert.equal(queries.at(-1).sql, "COMMIT");
});

test("applies a partner correction to both its balance and payout ledger", async () => {
  const queries = [];
  const client = {
    async query(sql, parameters = []) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      queries.push({ sql: normalized, parameters });
      if (normalized.startsWith("SELECT adjustment_id")) {
        return { rowCount: 0, rows: [] };
      }
      if (normalized.includes("FROM partners") && normalized.includes("FOR UPDATE")) {
        return {
          rowCount: 1,
          rows: [{ account_id: PARENT_ID, account_name: "Partner", email: "partner@example.com", stored_credit: 80 }],
        };
      }
      if (normalized.startsWith("INSERT INTO credit_adjustments")) {
        return {
          rowCount: 1,
          rows: [{ adjustment_id: ADJUSTMENT_ID, account_type: "partner", partner_id: PARENT_ID, credit_delta: -15, balance_before: 80, balance_after: 65 }],
        };
      }
      if (normalized.includes("platform_setting_history")) {
        return { rowCount: 1, rows: [{ setting_value: "9.50" }] };
      }
      return { rowCount: 1, rows: [] };
    },
    release() {},
  };
  const pool = { async connect() { return client; } };

  const result = await applyCreditAdjustment(pool, {
    account_type: "partner",
    account_id: PARENT_ID,
    direction: "debit",
    credits: 15,
    reason: "Approved partner balance correction",
    reference: "FIN-1001",
    idempotency_key: "adjustment-test-partner-1001",
    admin_id: ADMIN_ID,
    request_id: "request-2",
  });

  assert.equal(result.account.credit, 65);
  assert.ok(queries.some((query) => query.sql.startsWith("UPDATE partners")));
  assert.ok(
    queries.some(
      (query) =>
        query.sql.startsWith("INSERT INTO partner_earnings") &&
        query.parameters[1] === -15 &&
        query.parameters[2] === 9.5 &&
        query.parameters[3] === ADJUSTMENT_ID,
    ),
  );
  assert.equal(queries.at(-1).sql, "COMMIT");
});

test("returns an existing adjustment without changing balances again", async () => {
  const queries = [];
  const prior = {
    adjustment_id: ADJUSTMENT_ID,
    account_type: "parent",
    parent_id: PARENT_ID,
    partner_id: null,
    credit_delta: 10,
    balance_before: 50,
    balance_after: 60,
    reason: "Approved support goodwill credit",
    reference: "SUP-1002",
    created_by: ADMIN_ID,
  };
  const client = {
    async query(sql) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      queries.push(normalized);
      if (normalized.startsWith("SELECT adjustment_id")) {
        return { rowCount: 1, rows: [prior] };
      }
      return { rowCount: 1, rows: [] };
    },
    release() {},
  };

  const result = await applyCreditAdjustment({ async connect() { return client; } }, {
    account_type: "parent",
    account_id: PARENT_ID,
    direction: "credit",
    credits: 10,
    reason: "Approved support goodwill credit",
    reference: "SUP-1002",
    idempotency_key: "adjustment-test-retry-1002",
    admin_id: ADMIN_ID,
  });

  assert.equal(result.alreadyApplied, true);
  assert.equal(result.account.credit, 60);
  assert.equal(queries.filter((query) => query.startsWith("UPDATE ")).length, 0);
  assert.equal(queries.at(-1), "COMMIT");
});

test("credit adjustment migration is immutable and connects partner corrections to payouts", () => {
  const migration = fs.readFileSync(
    path.join(__dirname, "../migrations/add_credit_adjustments.sql"),
    "utf8",
  );
  assert.match(migration, /idempotency_key VARCHAR\(100\) NOT NULL UNIQUE/);
  assert.match(migration, /credit_adjustments_immutable/);
  assert.match(migration, /MANUAL_ADJUSTMENT/);
  assert.match(migration, /partner_earnings_credit_adjustment_uidx/);
  assert.match(migration, /transactions_credit_adjustment_uidx/);
});
