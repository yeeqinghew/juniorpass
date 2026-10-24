const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { sanitizeValue } = require("../services/auditLog.service");

test("audit sanitization removes sensitive fields recursively", () => {
  const result = sanitizeValue({
    email: "parent@example.com",
    password: "secret",
    nested: {
      authToken: "secret-token",
      balance: 120,
      allergies: "private",
    },
  });
  assert.deepEqual(result, {
    email: "parent@example.com",
    nested: { balance: 120 },
  });
});

test("audit migration enforces append-only events and useful indexes", () => {
  const migration = fs.readFileSync(
    path.join(__dirname, "../migrations/add_audit_events.sql"),
    "utf8",
  );
  assert.match(migration, /CREATE TABLE IF NOT EXISTS audit_events/);
  assert.match(migration, /BEFORE UPDATE OR DELETE ON audit_events/);
  assert.match(migration, /audit_events_entity_idx/);
  assert.match(migration, /audit_events_actor_idx/);
});

test("audit API is admin-only and supports all required areas", () => {
  const route = fs.readFileSync(
    path.join(__dirname, "../routes/auditLog.js"),
    "utf8",
  );
  for (const entityType of [
    "credit",
    "class",
    "account",
    "conversion_rate",
    "settlement",
    "promotion",
  ]) {
    assert.match(route, new RegExp(`"${entityType}"`));
  }
  assert.match(route, /authorization\.forRole\(AUTH_ROLES\.ADMIN\)/);
});

test("sensitive mutations write through the shared audit service", () => {
  const files = [
    "../routes/admins.js",
    "../routes/bookings.js",
    "../routes/listings.js",
    "../routes/payouts.js",
    "../services/paymentSettlement.service.js",
  ];
  for (const file of files) {
    const source = fs.readFileSync(path.join(__dirname, file), "utf8");
    assert.match(source, /recordAuditEvent/);
  }
});
