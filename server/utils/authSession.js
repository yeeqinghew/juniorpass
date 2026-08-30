const jwt = require("jsonwebtoken");
const jwtGenerator = require("./jwtGenerator");
const redisClient = require("./redisClient");
const { clearAuthCookie, setAuthCookie } = require("./authCookies");

/**
 * Determines whether the application should return the JWT
 * in the response body for backwards compatibility.
 *
 * The behavior is controlled by the `RETURN_LEGACY_AUTH_TOKEN`
 * environment variable.
 *
 * @returns {boolean}
 * `true` if the legacy token should be included in the response,
 * otherwise `false`.
 *
 * @example
 * // RETURN_LEGACY_AUTH_TOKEN=true
 * shouldReturnLegacyToken(); // true
 *
 * // RETURN_LEGACY_AUTH_TOKEN=false
 * shouldReturnLegacyToken(); // false
 */
function shouldReturnLegacyToken() {
  return process.env.RETURN_LEGACY_AUTH_TOKEN === "true";
}

/**
 * Creates an authenticated session for a user.
 *
 * This function generates a JWT for the given subject and role,
 * stores the JWT in an authentication cookie, and returns a
 * response object containing authentication information.
 *
 * By default, the JWT is only stored in the authentication cookie.
 * If `RETURN_LEGACY_AUTH_TOKEN=true`, the JWT is also included
 * in the response body for backwards compatibility.
 *
 * @param {import("express").Response} res
 * Express response object used to set the authentication cookie.
 *
 * @param {string|number} subjectId
 * Unique identifier of the authenticated user or subject.
 *
 * @param {string} role
 * Role of the authenticated user. Used when generating the JWT
 * and determining which authentication cookie should be set.
 *
 * @param {Object} [responseBody={}]
 * Additional properties to include in the returned response object.
 *
 * @returns {Object}
 * The response body containing the supplied properties and
 * `authenticated: true`. The JWT is also included as `token`
 * when legacy token responses are enabled.
 *
 * @example
 * const { AUTH_ROLES } = require("../constants/auth");
 * const response = issueAuthSession(
 *   res,
 *   user.id,
 *   AUTH_ROLES.ADMIN,
 *   { message: "Login successful" }
 * );
 *
 * // {
 * //   message: "Login successful",
 * //   authenticated: true
 * // }
 */
function issueAuthSession(res, subjectId, role, responseBody = {}) {
  const token = jwtGenerator(subjectId, role);
  setAuthCookie(res, role, token);

  return {
    ...responseBody,
    authenticated: true,
    ...(shouldReturnLegacyToken() ? { token } : {}),
  };
}

/**
 * Revokes a JWT by adding it to the Redis blacklist.
 *
 * The token remains blacklisted for the remaining lifetime of the JWT,
 * preventing the token from being accepted after logout or revocation.
 *
 * If the JWT contains an `exp` claim, the blacklist TTL is calculated
 * from the token's expiration time. If no expiration time is available,
 * a default TTL of 2 hours is used.
 *
 * If no token is provided, the function exits without performing
 * any Redis operation.
 *
 * @param {string} token
 * JWT to revoke.
 *
 * @returns {Promise<void>}
 * Resolves when the token has been added to the Redis blacklist.
 *
 * @example
 * await revokeToken(token);
 *
 * // Redis key:
 * // blacklist:<token>
 * //
 * // Value:
 * // "1"
 */
async function revokeToken(token) {
  if (!token) return;

  const decoded = jwt.decode(token);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const ttlSeconds = decoded?.exp
    ? Math.max(decoded.exp - nowSeconds, 1)
    : 2 * 60 * 60;

  await redisClient.setex(`blacklist:${token}`, ttlSeconds, "1");
}

/**
 * Revokes the current authentication session and clears
 * the user's authentication cookie.
 *
 * The JWT associated with the current request is added to the
 * Redis blacklist. The authentication cookie is then cleared
 * regardless of whether token revocation succeeds.
 *
 * This ensures that the client-side authentication cookie is
 * removed even if an error occurs while communicating with Redis.
 *
 * @param {import("express").Request} req
 * Express request object containing the authenticated token
 * in `req.authToken`.
 *
 * @param {import("express").Response} res
 * Express response object used to clear the authentication cookie.
 *
 * @param {string} role
 * Role associated with the authentication session. Used to determine
 * which authentication cookie should be cleared.
 *
 * @returns {Promise<void>}
 * Resolves after the token revocation attempt and cookie clearing
 * have completed.
 *
 * @example
 * await revokeAuthSession(req, res, AUTH_ROLES.USER);
 *
 * // The user's JWT is blacklisted and the authentication
 * // cookie is cleared.
 */
async function revokeAuthSession(req, res, role) {
  try {
    await revokeToken(req.authToken);
  } finally {
    clearAuthCookie(res, role);
  }
}

module.exports = {
  issueAuthSession,
  revokeAuthSession,
  revokeToken,
  shouldReturnLegacyToken,
};
