const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildResetPasswordUrl,
  createResetToken,
  getResetPasswordBaseUrl,
  hashResetToken,
  resolvePasswordResetTable,
} = require("../utils/passwordReset");

const requestFrom = (origin) => ({
  get: (header) => (header === "origin" ? origin : undefined),
});

test("creates an opaque reset token and stores only its digest", () => {
  const token = createResetToken();
  const digest = hashResetToken(token);

  assert.match(token, /^[a-f0-9]{64}$/);
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.notEqual(digest, token);
  assert.equal(hashResetToken(token), digest);
});

test("uses an explicitly configured frontend URL", () => {
  const env = {
    FRONTEND_URL: "https://staging.example.com/",
    NODE_ENV: "staging",
  };

  assert.equal(
    getResetPasswordBaseUrl(requestFrom("https://ignored.example.com"), env),
    "https://staging.example.com",
  );
});

test("uses a permitted request origin for staging", () => {
  const env = {
    ALLOWED_ORIGINS: "https://www.example.com, https://staging.example.com",
    NODE_ENV: "staging",
  };

  assert.equal(
    getResetPasswordBaseUrl(requestFrom("https://staging.example.com"), env),
    "https://staging.example.com",
  );
});

test("allows localhost links only outside deployed environments", () => {
  assert.equal(
    getResetPasswordBaseUrl(requestFrom("http://localhost:5173"), {
      NODE_ENV: "development",
    }),
    "http://localhost:5173",
  );

  assert.equal(
    getResetPasswordBaseUrl(requestFrom("http://localhost:5173"), {
      NODE_ENV: "production",
    }),
    "https://www.juniorpass.sg",
  );
});

test("URL-encodes the reset token", () => {
  const url = buildResetPasswordUrl(requestFrom("http://localhost:5173"), "a+b/c", {
    NODE_ENV: "development",
  });

  assert.equal(
    url,
    "http://localhost:5173/reset-password?token=a%2Bb%2Fc",
  );
});

test("prefers the corrected reset table while supporting legacy deployments", async () => {
  const correctedPool = {
    query: async () => ({ rows: [{ table_name: "password_resets" }] }),
  };
  const legacyPool = {
    query: async () => ({ rows: [{ table_name: "passwordresets" }] }),
  };

  assert.equal(await resolvePasswordResetTable(correctedPool), "password_resets");
  assert.equal(await resolvePasswordResetTable(legacyPool), "passwordresets");
});

test("rejects an unavailable or unexpected reset table", async () => {
  const missingPool = {
    query: async () => ({ rows: [{ table_name: null }] }),
  };

  await assert.rejects(
    resolvePasswordResetTable(missingPool),
    /Password reset table is missing/,
  );
});
