const crypto = require("crypto");

const DEFAULT_FRONTEND_URL = "https://www.juniorpass.sg";

const withoutTrailingSlash = (url) => url.replace(/\/+$/, "");

const isLocalOrigin = (origin) => {
  try {
    const url = new URL(origin);
    return (
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1")
    );
  } catch {
    return false;
  }
};

const getResetPasswordBaseUrl = (req, env = process.env) => {
  const configuredUrl = (env.FRONTEND_URL || env.CLIENT_URL || "").trim();
  if (configuredUrl) return withoutTrailingSlash(configuredUrl);

  const requestOrigin = req?.get?.("origin");
  const allowedOrigins = (env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
    return withoutTrailingSlash(requestOrigin);
  }

  const isDeployed = env.NODE_ENV === "production" || env.NODE_ENV === "staging";
  if (!isDeployed && requestOrigin && isLocalOrigin(requestOrigin)) {
    return withoutTrailingSlash(requestOrigin);
  }

  return DEFAULT_FRONTEND_URL;
};

const createResetToken = () => crypto.randomBytes(32).toString("hex");

const hashResetToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

const buildResetPasswordUrl = (req, token, env = process.env) =>
  `${getResetPasswordBaseUrl(req, env)}/reset-password?token=${encodeURIComponent(token)}`;

const resolvePasswordResetTable = async (pool) => {
  const result = await pool.query(`
    SELECT CASE
      WHEN to_regclass('public.password_resets') IS NOT NULL
        THEN 'password_resets'
      WHEN to_regclass('public.passwordresets') IS NOT NULL
        THEN 'passwordresets'
      ELSE NULL
    END AS table_name
  `);
  const tableName = result.rows[0]?.table_name;

  if (!['password_resets', 'passwordresets'].includes(tableName)) {
    throw new Error("Password reset table is missing");
  }

  return tableName;
};

module.exports = {
  buildResetPasswordUrl,
  createResetToken,
  getResetPasswordBaseUrl,
  hashResetToken,
  resolvePasswordResetTable,
};
