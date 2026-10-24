const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  ADMIN_NOTIFICATION_TYPES,
  syncAdminOperationalNotifications,
} = require("../services/adminNotification.service");

test("admin operational notification categories are stable", () => {
  assert.deepEqual(ADMIN_NOTIFICATION_TYPES, {
    FAILED_PAYMENT: "payment_failed",
    BOOKING_DISPUTE: "booking_dispute",
    PARTNER_APPLICATION: "partner_application",
    SETTLEMENT_DEADLINE: "settlement_deadline",
    SYSTEM_FAILURE: "system_failure",
  });
});

test("operational notification sync reads real payment, enquiry and webhook sources", async () => {
  const calls = [];
  const db = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      return { rows: [], rowCount: 0 };
    },
  };

  await syncAdminOperationalNotifications(db, "86ca3ad5-e793-4690-bd01-5128a0511961");
  const sql = calls.map((call) => call.sql).join("\n");
  assert.match(sql, /FROM payment_requests/);
  assert.match(sql, /FROM partnerForms/);
  assert.match(sql, /FROM payment_webhook_events/);
  assert.match(sql, /ON CONFLICT/);
  assert.equal(calls.every((call) => call.params[0] === "86ca3ad5-e793-4690-bd01-5128a0511961"), true);
});

test("notification event keys have a database uniqueness guard", () => {
  const migration = fs.readFileSync(
    path.join(__dirname, "../migrations/add_admin_notification_deduplication.sql"),
    "utf8",
  );
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS/);
  assert.match(migration, /data->>'event_key'/);
});

test("notification routes authorize the admin role", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../routes/notifications.js"),
    "utf8",
  );
  assert.match(source, /AUTH_ROLES\.ADMIN/);
  assert.match(source, /syncAdminOperationalNotifications/);
});
