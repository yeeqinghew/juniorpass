const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  sanitizeWebhookAuditData,
} = require("../services/paymentWebhookAudit.service");

test("valid webhook audit data keeps only the operational fields", () => {
  const result = sanitizeWebhookAuditData(
    {
      reference_number: "REF-123",
      payment_request_id: "HITPAY-456",
      status: "completed",
      amount: "94.00",
      hmac: "must-never-be-stored",
      customer_email: "private@example.com",
    },
    true,
  );

  assert.deepEqual(result, {
    referenceNumber: "REF-123",
    hitpayPaymentId: "HITPAY-456",
    paymentStatus: "COMPLETED",
    amount: 94,
  });
  assert.equal("hmac" in result, false);
  assert.equal("customer_email" in result, false);
});

test("untrusted webhook identifiers are discarded when the signature is invalid", () => {
  const result = sanitizeWebhookAuditData(
    {
      reference_number: "forged-reference",
      payment_request_id: "forged-payment",
      amount: "999999",
    },
    false,
  );

  assert.deepEqual(result, {
    referenceNumber: null,
    hitpayPaymentId: null,
    paymentStatus: null,
    amount: null,
  });
});

test("webhook history schema excludes raw payloads and signatures", () => {
  const migration = fs.readFileSync(
    path.join(__dirname, "../migrations/add_payment_webhook_events.sql"),
    "utf8",
  );

  assert.match(migration, /CREATE TABLE IF NOT EXISTS payment_webhook_events/);
  assert.doesNotMatch(migration, /raw_payload|request_body|\bhmac\b/i);
});

test("admin payment workspace is restricted to the admin role", () => {
  const route = fs.readFileSync(
    path.join(__dirname, "../routes/adminPayments.js"),
    "utf8",
  );

  assert.match(
    route,
    /require\("\.\.\/middleware\/authorization"\)\.forRole\([\s\S]*AUTH_ROLES\.ADMIN/,
  );
  assert.match(route, /router\.get\("\/", authorization/);
});
