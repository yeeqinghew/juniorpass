const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  AUTH_RATE_LIMIT_POLICIES,
  createAuthRateLimiter,
} = require("../middleware/authRateLimiters");

function createResponse() {
  const headers = {};
  return {
    headers,
    statusCode: 200,
    body: null,
    writableEnded: false,
    getHeader(name) {
      return headers[name.toLowerCase()];
    },
    setHeader(name, value) {
      headers[name.toLowerCase()] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      this.writableEnded = true;
      return this;
    },
  };
}

async function runLimiter(limiter) {
  const req = {
    ip: "203.0.113.1",
    method: "POST",
    headers: {},
    app: {
      get(setting) {
        return setting === "trust proxy" ? 1 : undefined;
      },
    },
  };
  const res = createResponse();
  await new Promise((resolve, reject) => {
    const next = () => resolve();
    Promise.resolve(limiter(req, res, next))
      .then(() => {
        if (res.writableEnded) resolve();
      })
      .catch(reject);
  });
  return res;
}

test("sensitive authentication policies have dedicated limits", () => {
  assert.deepEqual(
    {
      partner: AUTH_RATE_LIMIT_POLICIES.PARTNER_LOGIN.max,
      admin: AUTH_RATE_LIMIT_POLICIES.ADMIN_LOGIN.max,
      google: AUTH_RATE_LIMIT_POLICIES.GOOGLE_LOGIN.max,
      verifyOtp: AUTH_RATE_LIMIT_POLICIES.VERIFY_OTP.max,
    },
    { partner: 5, admin: 5, google: 10, verifyOtp: 10 },
  );

  for (const policy of [
    AUTH_RATE_LIMIT_POLICIES.PARTNER_LOGIN,
    AUTH_RATE_LIMIT_POLICIES.ADMIN_LOGIN,
    AUTH_RATE_LIMIT_POLICIES.GOOGLE_LOGIN,
    AUTH_RATE_LIMIT_POLICIES.VERIFY_OTP,
  ]) {
    assert.equal(policy.windowMs, 15 * 60 * 1000);
    assert.equal(policy.skipSuccessfulRequests, true);
    assert.match(policy.message, /Too many/);
  }
});

test("rate limiter returns a consistent JSON 429 response", async () => {
  const limiter = createAuthRateLimiter({
    windowMs: 60 * 1000,
    max: 2,
    skipSuccessfulRequests: false,
    message: "Test limit reached",
  });

  assert.equal((await runLimiter(limiter)).statusCode, 200);
  assert.equal((await runLimiter(limiter)).statusCode, 200);

  const blocked = await runLimiter(limiter);
  assert.equal(blocked.statusCode, 429);
  assert.deepEqual(blocked.body, { message: "Test limit reached" });
  assert.ok(blocked.headers["ratelimit-policy"] || blocked.headers.ratelimit);
});

test("partner, admin, Google, and OTP verification routes attach their limiter", () => {
  const routesDirectory = path.join(__dirname, "..", "routes");
  const partnerRoutes = fs.readFileSync(
    path.join(routesDirectory, "partners.js"),
    "utf8",
  );
  const adminRoutes = fs.readFileSync(
    path.join(routesDirectory, "admins.js"),
    "utf8",
  );
  const userRoutes = fs.readFileSync(
    path.join(routesDirectory, "jwtAuth.js"),
    "utf8",
  );

  assert.match(
    partnerRoutes,
    /router\.post\("\/login", partnerLoginLimiter,/,
  );
  assert.match(adminRoutes, /router\.post\("\/login", adminLoginLimiter,/);
  assert.match(
    userRoutes,
    /router\.post\("\/login\/google", googleLoginLimiter,/,
  );
  assert.match(
    userRoutes,
    /router\.post\("\/verify-otp", verifyOtpLimiter,/,
  );
});
