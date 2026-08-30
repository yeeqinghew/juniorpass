const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const express = require("express");

const {
  AUTH_RATE_LIMIT_POLICIES,
  createAuthRateLimiter,
} = require("../middleware/authRateLimiters");

function request(port, pathname) {
  return new Promise((resolve, reject) => {
    const req = http.get(
      { hostname: "127.0.0.1", port, path: pathname },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          resolve({ status: res.statusCode, headers: res.headers, body });
        });
      },
    );
    req.on("error", reject);
  });
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

test("rate limiter returns a consistent JSON 429 response", async (t) => {
  const app = express();
  app.set("trust proxy", 1);
  app.get(
    "/limited",
    createAuthRateLimiter({
      windowMs: 60 * 1000,
      max: 2,
      skipSuccessfulRequests: false,
      message: "Test limit reached",
    }),
    (req, res) => res.status(401).json({ message: "Invalid credential" }),
  );

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const { port } = server.address();
  assert.equal((await request(port, "/limited")).status, 401);
  assert.equal((await request(port, "/limited")).status, 401);

  const blocked = await request(port, "/limited");
  assert.equal(blocked.status, 429);
  assert.deepEqual(JSON.parse(blocked.body), { message: "Test limit reached" });
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
