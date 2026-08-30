const jwt = require("jsonwebtoken");
require("dotenv").config();
const client = require("../utils/redisClient");
const { AUTH_ROLES } = require("../constants/auth");
const { getAuthCookieToken } = require("../utils/authCookies");

const ALL_AUTH_ROLES = Object.values(AUTH_ROLES);
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

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

    for (const role of orderedRoles) {
      const cookieToken = getAuthCookieToken(req, role);
      if (cookieToken) {
        jwtToken = cookieToken;
        tokenRole = role;
        break;
      }
    }

    if (!jwtToken) {
      return res.status(401).json({ error: "Authentication required" });
    }

    if (!isCookieRequestOriginAllowed(req)) {
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

      if (payloadRole !== tokenRole) {
        return res.status(401).json({ error: "Invalid session role" });
      }

      if (!allowedRoles.includes(payloadRole)) {
        return res
          .status(403)
          .json({ error: "Forbidden for this account type" });
      }

      req.user = payload.user;
      req.authRole = payloadRole;
      req.authToken = jwtToken;
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
