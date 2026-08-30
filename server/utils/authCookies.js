const { AUTH_ROLES } = require("../constants/auth");

/**
 * Authentication cookie names mapped to their corresponding roles.
 *
 * @type {Readonly<Record<string, string>>}
 *
 * @example
 * AUTH_COOKIE_NAMES[AUTH_ROLES.USER];
 * // "jp_user_session"
 */
const AUTH_COOKIE_NAMES = Object.freeze({
  [AUTH_ROLES.USER]: "jp_user_session",
  [AUTH_ROLES.PARTNER]: "jp_partner_session",
  [AUTH_ROLES.ADMIN]: "jp_admin_session",
});

/**
 * Maximum lifetime of an authentication cookie.
 *
 * The value is set to 2 hours and is expressed in milliseconds,
 * matching the `maxAge` format expected by Express cookies.
 *
 * @type {number}
 * @constant
 *
 * @example
 * // 7,200,000 milliseconds = 2 hours
 * AUTH_COOKIE_MAX_AGE_MS;
 */
const AUTH_COOKIE_MAX_AGE_MS = 2 * 60 * 60 * 1000;

/**
 * Parses an environment/configuration value as a boolean.
 *
 * Only the string `"true"` (case-insensitive) is interpreted as `true`.
 * Empty, null, or undefined values return the provided fallback.
 *
 * @param {*} value
 * Value to convert to a boolean.
 *
 * @param {boolean} fallback
 * Value returned when `value` is null, undefined, or empty.
 *
 * @returns {boolean}
 * Parsed boolean value.
 *
 * @example
 * parseBoolean("true", false);
 * // true
 *
 * parseBoolean("TRUE", false);
 * // true
 *
 * parseBoolean("false", true);
 * // false
 *
 * parseBoolean(undefined, true);
 * // true
 */
function parseBoolean(value, fallback) {
  if (value == null || value === "") return fallback;
  return String(value).toLowerCase() === "true";
}

/**
 * Builds the configuration options used for authentication cookies.
 *
 * The cookie security settings are determined from environment variables:
 *
 * - `NODE_ENV` determines whether the application is considered local.
 * - `AUTH_COOKIE_SECURE` can explicitly configure the `secure` flag.
 * - `AUTH_COOKIE_SAME_SITE` can configure the `SameSite` policy.
 *
 * Valid `SameSite` values are:
 * - `lax`
 * - `strict`
 * - `none`
 *
 * If no valid `SameSite` value is configured, the function defaults to
 * `none` when cookies are secure and `lax` otherwise.
 *
 * `SameSite=None` cookies must also have `Secure=true`, so the function
 * automatically enables `secure` when `sameSite` is `none`.
 *
 * @param {Object} [options={}]
 * Cookie option configuration.
 *
 * @param {boolean} [options.includeMaxAge=true]
 * Whether to include the cookie's `maxAge` property.
 * This is set to `false` when generating options for clearing a cookie.
 *
 * @returns {Object}
 * Express-compatible cookie options.
 *
 * @property {boolean} httpOnly
 * Prevents client-side JavaScript from accessing the cookie.
 *
 * @property {boolean} secure
 * Determines whether the cookie can only be sent over HTTPS.
 *
 * @property {"lax"|"strict"|"none"} sameSite
 * Controls cross-site cookie behavior.
 *
 * @property {string} path
 * Cookie path, which is `/` for the entire application.
 *
 * @property {number} [maxAge]
 * Cookie lifetime in milliseconds when `includeMaxAge` is true.
 *
 * @example
 * getCookieOptions();
 * // {
 * //   httpOnly: true,
 * //   secure: true,
 * //   sameSite: "none",
 * //   path: "/",
 * //   maxAge: 7200000
 * // }
 *
 * @example
 * getCookieOptions({ includeMaxAge: false });
 * // {
 * //   httpOnly: true,
 * //   secure: true,
 * //   sameSite: "none",
 * //   path: "/"
 * // }
 */
function getCookieOptions({ includeMaxAge = true } = {}) {
  const isLocalEnvironment = !["production", "staging"].includes(
    process.env.NODE_ENV,
  );
  let secure = parseBoolean(
    process.env.AUTH_COOKIE_SECURE,
    !isLocalEnvironment,
  );
  const configuredSameSite = process.env.AUTH_COOKIE_SAME_SITE?.toLowerCase();
  const validSameSiteValues = new Set(["lax", "strict", "none"]);
  const sameSite = validSameSiteValues.has(configuredSameSite)
    ? configuredSameSite
    : secure
      ? "none"
      : "lax";

  // Browsers reject SameSite=None cookies that are not also Secure.
  if (sameSite === "none") secure = true;

  return {
    httpOnly: true,
    secure,
    sameSite,
    path: "/",
    ...(includeMaxAge ? { maxAge: AUTH_COOKIE_MAX_AGE_MS } : {}),
  };
}

/**
 * Returns the authentication cookie name associated with a role.
 *
 * @param {string} role
 * Authentication role whose cookie name should be retrieved.
 *
 * @returns {string}
 * The cookie name associated with the specified role.
 *
 * @throws {Error}
 * Thrown when the supplied role is not supported.
 *
 * @example
 * getAuthCookieName(AUTH_ROLES.USER);
 * // "jp_user_session"
 *
 * getAuthCookieName(AUTH_ROLES.ADMIN);
 * // "jp_admin_session"
 *
 * getAuthCookieName("unknown");
 * // throws Error
 */
function getAuthCookieName(role) {
  const cookieName = AUTH_COOKIE_NAMES[role];
  if (!cookieName) throw new Error(`Unsupported authentication role: ${role}`);
  return cookieName;
}

/**
 * Parses the HTTP Cookie header from an incoming request.
 *
 * The function converts the cookie header into an object where each
 * cookie name is mapped to its decoded value.
 *
 * Cookie values are decoded using `decodeURIComponent`. If decoding
 * fails because the value contains malformed URI encoding, the raw
 * value is returned instead.
 *
 * @param {import("express").Request} req
 * Express request object containing the `Cookie` HTTP header.
 *
 * @returns {Record<string, string>}
 * Object containing parsed cookie names and values.
 *
 * @example
 * // Request header:
 * // Cookie: jp_user_session=abc123; theme=dark
 *
 * parseCookies(req);
 * // {
 * //   jp_user_session: "abc123",
 * //   theme: "dark"
 * // }
 *
 * @example
 * // No Cookie header
 * parseCookies(req);
 * // {}
 */
function parseCookies(req) {
  const cookieHeader = req.headers?.cookie;
  if (!cookieHeader) return {};

  return cookieHeader.split(";").reduce((cookies, item) => {
    const separatorIndex = item.indexOf("=");
    if (separatorIndex < 0) return cookies;

    const name = item.slice(0, separatorIndex).trim();
    const rawValue = item.slice(separatorIndex + 1).trim();
    if (!name) return cookies;

    try {
      cookies[name] = decodeURIComponent(rawValue);
    } catch {
      cookies[name] = rawValue;
    }
    return cookies;
  }, {});
}

/**
 * Retrieves the authentication token for a specific role from
 * the incoming request's cookies.
 *
 * The function determines the appropriate cookie name for the role,
 * parses the request cookies, and returns the corresponding token.
 *
 * @param {import("express").Request} req
 * Express request containing the authentication cookie.
 *
 * @param {string} role
 * Authentication role whose session token should be retrieved.
 *
 * @returns {string|null}
 * The authentication JWT if the cookie exists, otherwise `null`.
 *
 * @throws {Error}
 * Thrown when the supplied role is not supported.
 *
 * @example
 * const token = getAuthCookieToken(req, AUTH_ROLES.USER);
 *
 * if (token) {
 *   // Authenticate the user using the token.
 * }
 */
function getAuthCookieToken(req, role) {
  return parseCookies(req)[getAuthCookieName(role)] || null;
}

/**
 * Sets an authentication cookie on the HTTP response.
 *
 * The cookie name is determined by the supplied authentication role,
 * and the cookie security/options are generated automatically.
 *
 * @param {import("express").Response} res
 * Express response object used to set the cookie.
 *
 * @param {string} role
 * Authentication role associated with the session.
 *
 * @param {string} token
 * JWT authentication token to store in the cookie.
 *
 * @returns {void}
 *
 * @throws {Error}
 * Thrown when the supplied role is not supported.
 *
 * @example
 * setAuthCookie(res, AUTH_ROLES.USER, token);
 *
 * // Sets:
 * // jp_user_session=<token>
 */
function setAuthCookie(res, role, token) {
  res.cookie(getAuthCookieName(role), token, getCookieOptions());
}

/**
 * Clears an authentication cookie from the HTTP response.
 *
 * The same cookie security options used by the authentication cookie
 * are applied, except `maxAge` is omitted because the cookie is being
 * removed.
 *
 * @param {import("express").Response} res
 * Express response object used to clear the cookie.
 *
 * @param {string} role
 * Authentication role associated with the session.
 *
 * @returns {void}
 *
 * @throws {Error}
 * Thrown when the supplied role is not supported.
 *
 * @example
 * clearAuthCookie(res, AUTH_ROLES.USER);
 *
 * // Clears:
 * // jp_user_session
 */
function clearAuthCookie(res, role) {
  res.clearCookie(
    getAuthCookieName(role),
    getCookieOptions({ includeMaxAge: false }),
  );
}

module.exports = {
  AUTH_ROLES,
  AUTH_COOKIE_NAMES,
  AUTH_COOKIE_MAX_AGE_MS,
  clearAuthCookie,
  getAuthCookieName,
  getAuthCookieToken,
  getCookieOptions,
  parseCookies,
  setAuthCookie,
};
