const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const jwtGenerator = require("../utils/jwtGenerator");
const { AUTH_ROLES } = require("../constants/auth");
const {
  AUTH_COOKIE_MAX_AGE_MS,
  clearAuthCookie,
  getAuthCookieName,
  getCookieOptions,
  parseCookies,
  setAuthCookie,
} = require("../utils/authCookies");

function withEnvironment(values, callback) {
  const previous = {};
  for (const [key, value] of Object.entries(values)) {
    previous[key] = process.env[key];
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }

  try {
    return callback();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("authentication roles are immutable shared constants", () => {
  assert.equal(Object.isFrozen(AUTH_ROLES), true);
  assert.deepEqual(Object.values(AUTH_ROLES), ["user", "partner", "admin"]);
});

test("JWTs include the authenticated portal role", () => {
  withEnvironment({ JWT_SECRET: "test-secret" }, () => {
    const token = jwtGenerator("partner-id", AUTH_ROLES.PARTNER);
    const payload = jwt.verify(token, "test-secret");

    assert.equal(payload.user, "partner-id");
    assert.equal(payload.role, AUTH_ROLES.PARTNER);
    assert.ok(payload.exp > payload.iat);
  });
});

test("local cookie settings work without HTTPS", () => {
  withEnvironment(
    {
      NODE_ENV: "development",
      AUTH_COOKIE_SECURE: null,
      AUTH_COOKIE_SAME_SITE: null,
    },
    () => {
      assert.deepEqual(getCookieOptions(), {
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        path: "/",
        maxAge: AUTH_COOKIE_MAX_AGE_MS,
      });
    },
  );
});

test("deployed cross-site cookies are Secure and HttpOnly", () => {
  withEnvironment(
    {
      NODE_ENV: "production",
      AUTH_COOKIE_SECURE: null,
      AUTH_COOKIE_SAME_SITE: null,
    },
    () => {
      const options = getCookieOptions();
      assert.equal(options.httpOnly, true);
      assert.equal(options.secure, true);
      assert.equal(options.sameSite, "none");
    },
  );
});

test("role cookies use separate names and can be parsed and cleared", () => {
  assert.equal(getAuthCookieName(AUTH_ROLES.USER), "jp_user_session");
  assert.equal(getAuthCookieName(AUTH_ROLES.PARTNER), "jp_partner_session");
  assert.equal(getAuthCookieName(AUTH_ROLES.ADMIN), "jp_admin_session");

  assert.deepEqual(
    parseCookies({
      headers: {
        cookie: "jp_user_session=user.jwt; jp_partner_session=partner.jwt",
      },
    }),
    {
      jp_user_session: "user.jwt",
      jp_partner_session: "partner.jwt",
    },
  );

  const calls = [];
  const response = {
    cookie: (...args) => calls.push(["set", ...args]),
    clearCookie: (...args) => calls.push(["clear", ...args]),
  };
  setAuthCookie(response, AUTH_ROLES.ADMIN, "admin.jwt");
  clearAuthCookie(response, AUTH_ROLES.ADMIN);

  assert.equal(calls[0][1], "jp_admin_session");
  assert.equal(calls[0][2], "admin.jwt");
  assert.equal(calls[0][3].httpOnly, true);
  assert.equal(calls[1][1], "jp_admin_session");
  assert.equal("maxAge" in calls[1][2], false);
});
