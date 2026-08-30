const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const { AUTH_ROLES } = require("../constants/auth");
const authorization = require("../middleware/authorization");
const { issueAuthSession } = require("../utils/authSession");
const redisClient = require("../utils/redisClient");

// These tests exercise authentication decisions without requiring a live Redis
// instance. Revocation behaviour is covered separately from cookie transport.
redisClient.disconnect();
redisClient.get = async () => null;

async function withEnvironment(values, callback) {
  const previous = {};
  for (const [key, value] of Object.entries(values)) {
    previous[key] = process.env[key];
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }

  try {
    return await callback();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test("issued sessions never expose the JWT in the response body", async () => {
  await withEnvironment(
    {
      JWT_SECRET: "cookie-only-test-secret",
      RETURN_LEGACY_AUTH_TOKEN: "true",
    },
    () => {
      const cookieCalls = [];
      const res = {
        cookie: (...args) => cookieCalls.push(args),
      };

      const body = issueAuthSession(res, "user-id", AUTH_ROLES.USER, {
        message: "Login successful",
      });

      assert.deepEqual(body, {
        message: "Login successful",
        authenticated: true,
      });
      assert.equal(Object.hasOwn(body, "token"), false);
      assert.equal(cookieCalls.length, 1);
      assert.equal(cookieCalls[0][0], "jp_user_session");
      assert.equal(cookieCalls[0][2].httpOnly, true);
    },
  );
});

test("a valid Bearer JWT is rejected even when the old flag is set", async () => {
  await withEnvironment(
    {
      JWT_SECRET: "cookie-only-test-secret",
      ALLOW_LEGACY_BEARER_AUTH: "true",
    },
    async () => {
      const token = jwt.sign(
        { user: "user-id", role: AUTH_ROLES.USER },
        process.env.JWT_SECRET,
        { expiresIn: "2h" },
      );
      const req = {
        method: "GET",
        headers: { authorization: `Bearer ${token}` },
      };
      const res = createResponse();
      let nextCalled = false;

      await authorization.forRole(AUTH_ROLES.USER)(req, res, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, false);
      assert.equal(res.statusCode, 401);
      assert.deepEqual(res.body, { error: "Authentication required" });
    },
  );
});

test("a valid role-scoped cookie authenticates the matching account role", async () => {
  await withEnvironment(
    { JWT_SECRET: "cookie-only-test-secret" },
    async () => {
      const token = jwt.sign(
        { user: "partner-id", role: AUTH_ROLES.PARTNER },
        process.env.JWT_SECRET,
        { expiresIn: "2h" },
      );
      const req = {
        method: "GET",
        headers: {
          cookie: `jp_partner_session=${token}`,
          "x-auth-role": AUTH_ROLES.PARTNER,
        },
      };
      const res = createResponse();
      let nextCalled = false;

      await authorization.forRole(AUTH_ROLES.PARTNER)(req, res, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, true);
      assert.equal(req.user, "partner-id");
      assert.equal(req.authRole, AUTH_ROLES.PARTNER);
      assert.equal(req.authToken, token);
      assert.equal(res.body, null);
    },
  );
});

test("a JWT role must exactly match its role-scoped cookie", async () => {
  await withEnvironment(
    { JWT_SECRET: "cookie-only-test-secret" },
    async () => {
      const token = jwt.sign(
        { user: "partner-id", role: AUTH_ROLES.PARTNER },
        process.env.JWT_SECRET,
        { expiresIn: "2h" },
      );
      const req = {
        method: "GET",
        headers: { cookie: `jp_user_session=${token}` },
      };
      const res = createResponse();
      let nextCalled = false;

      await authorization.forRole(AUTH_ROLES.USER)(req, res, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, false);
      assert.equal(res.statusCode, 401);
      assert.deepEqual(res.body, { error: "Invalid session role" });
    },
  );
});
