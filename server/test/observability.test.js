const assert = require("node:assert/strict");
const test = require("node:test");
const { redactString, sanitize } = require("../utils/logger");
const { checkReadiness } = require("../utils/readiness");

test("structured logging redacts secrets and personal data recursively", () => {
  const result = sanitize({
    email: "parent@example.com",
    authorization: "Bearer abc.def.ghi",
    child: {
      date_of_birth: "2020-01-01",
      allergies: "peanuts",
    },
    safe_reference: "pay_123",
  });

  assert.equal(result.email, "[EMAIL_REDACTED]");
  assert.equal(result.authorization, "[REDACTED]");
  assert.equal(result.child.date_of_birth, "[REDACTED]");
  assert.equal(result.child.allergies, "[REDACTED]");
  assert.equal(result.safe_reference, "pay_123");
  assert.equal(redactString("Bearer secret parent@example.com"), "Bearer [REDACTED] [EMAIL_REDACTED]");
});

test("readiness reports dependency health without exposing error details", async () => {
  const readiness = await checkReadiness({
    db: { query: async () => ({ rows: [{ "?column?": 1 }] }) },
    redis: { ping: async () => { throw new Error("redis://secret-host"); } },
    timeoutMs: 50,
  });

  assert.deepEqual(readiness, {
    ready: false,
    dependencies: { database: "up", redis: "down" },
  });
});
