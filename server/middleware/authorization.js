const jwt = require("jsonwebtoken");
require("dotenv").config();
const client = require("../utils/redisClient");
const { AUTH_ROLES } = require("../constants/auth");
const { getAuthCookieToken } = require("../utils/authCookies");

const ALL_AUTH_ROLES = Object.values(AUTH_ROLES);
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function getBearerToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") return null;
  return parts[1];
}

function getAllowedOrigins() {
  return (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function isCookieRequestOriginAllowed(req) {
  if (SAFE_METHODS.has(req.method)) return true;

  const origin = req.headers.origin;
  // Non-browser clients do not normally send Origin and cannot perform CSRF.
  if (!origin) return true;

  try {
    const originUrl = new URL(origin);
    if (originUrl.host === req.headers.host) return true;
  } catch {
    return false;
  }

  const allowedOrigins = getAllowedOrigins();
  if (allowedOrigins.includes(origin)) return true;

  if (!["production", "staging"].includes(process.env.NODE_ENV)) {
    return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  }

  return false;
}

function orderAllowedRoles(req, allowedRoles) {
  const requestedRole = req.headers["x-auth-role"];
  if (!requestedRole || !allowedRoles.includes(requestedRole)) {
    return allowedRoles;
  }
  return [
    requestedRole,
    ...allowedRoles.filter((role) => role !== requestedRole),
  ];
}

function createAuthorization(allowedRoles = ALL_AUTH_ROLES) {
  return async (req, res, next) => {
    const orderedRoles = orderAllowedRoles(req, allowedRoles);
    let jwtToken = null;
    let tokenRole = null;
    let authSource = null;

    for (const role of orderedRoles) {
      const cookieToken = getAuthCookieToken(req, role);
      if (cookieToken) {
        jwtToken = cookieToken;
        tokenRole = role;
        authSource = "cookie";
        break;
      }
    }

    if (!jwtToken) {
      const bearerToken = getBearerToken(req);
      jwtToken =
        process.env.ALLOW_LEGACY_BEARER_AUTH === "true" ? bearerToken : null;
      authSource = jwtToken ? "bearer" : null;
    }

    if (!jwtToken) {
      return res.status(401).json({ error: "Authentication required" });
    }

    if (authSource === "cookie" && !isCookieRequestOriginAllowed(req)) {
      return res.status(403).json({ error: "Request origin is not allowed" });
    }

    try {
      const isBlacklisted = await client.get(`blacklist:${jwtToken}`);
      if (isBlacklisted) {
        return res.status(401).json({ error: "Session has been logged out" });
      }
    } catch (error) {
      // Preserve the existing fail-open Redis behaviour so a Redis outage does
      // not take down every authenticated request.
      console.error("Blacklist check failed:", error.message);
    }

    try {
      const jwtSecret = process.env.JWT_SECRET;
      const payload = jwt.verify(jwtToken, jwtSecret);
      const payloadRole = payload.role;

      if (authSource === "cookie" && payloadRole !== tokenRole) {
        return res.status(401).json({ error: "Invalid session role" });
      }

      if (payloadRole && !allowedRoles.includes(payloadRole)) {
        return res
          .status(403)
          .json({ error: "Forbidden for this account type" });
      }

      // Bearer tokens are accepted only when the temporary rollout flag is
      // enabled. Newly issued cookie tokens always have a role.
      req.user = payload.user;
      req.authRole = payloadRole || "legacy";
      req.authToken = jwtToken;
      req.authSource = authSource;
      return next();
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        return res.status(401).json({ error: "Session expired" });
      }
      if (error instanceof jwt.JsonWebTokenError) {
        return res.status(401).json({ error: "Invalid session" });
      }
      console.error("Authorization error:", error.message);
      return res.status(500).json({ error: "Unable to verify session" });
    }
  };
}

const authorization = createAuthorization();
authorization.forRole = (role) => createAuthorization([role]);
authorization.forRoles = (...roles) => createAuthorization(roles);

module.exports = authorization;
