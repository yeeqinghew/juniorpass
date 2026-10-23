const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { syncPartnerEarnings } = require("../services/partnerPayout.service");

test("earnings synchronization is occurrence-idempotent and preserves locked rows", async () => {
  const queries = [];
  const db = {
    async query(sql, parameters) {
      queries.push({ sql, parameters });
      return { rows: [], rowCount: 0 };
    },
  };

  await syncPartnerEarnings(db, "5e704335-50fd-4606-9098-78d702579e7f");

  assert.equal(queries.length, 2);
  assert.match(queries[0].sql, /ON CONFLICT \(occurrence_id\).*DO UPDATE/s);
  assert.match(queries[0].sql, /IN_PAYOUT.*SETTLED/s);
  assert.match(queries[0].sql, /partner_credited_credits/);
  assert.match(queries[0].sql, /opening\.source = 'OPENING_BALANCE'/);
  assert.deepEqual(queries[0].parameters, ["5e704335-50fd-4606-9098-78d702579e7f"]);
  assert.match(queries[1].sql, /payout_id IS NULL/);
});

test("payout routes lock drafts and settle wallet, ledger and notification together", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../routes/payouts.js"),
    "utf8",
  );

  assert.match(source, /pg_advisory_xact_lock/);
  assert.match(source, /ORDER BY pe\.available_at FOR UPDATE/);
  assert.match(source, /UPDATE partner_earnings SET status = 'IN_PAYOUT'/);
  assert.match(source, /UPDATE partner_payouts SET status = 'PAID'/);
  assert.match(source, /UPDATE partners SET credit = GREATEST/);
  assert.match(source, /INSERT INTO notifications/);
  assert.match(source, /await client\.query\("COMMIT"\)/);
});

test("payout migration upgrades partial schemas without dropping financial data", () => {
  const migration = fs.readFileSync(
    path.join(__dirname, "../migrations/add_partner_payouts.sql"),
    "utf8",
  );

  assert.match(migration, /ADD COLUMN IF NOT EXISTS payout_id/);
  assert.match(migration, /ALTER COLUMN credit TYPE NUMERIC/);
  assert.match(migration, /WHERE status <> 'VOID'/);
  assert.doesNotMatch(migration, /DROP TABLE/);
});
