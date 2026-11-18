const { AsyncLocalStorage } = require("node:async_hooks");

const requestContext = new AsyncLocalStorage();
const SENSITIVE_KEY = /(?:password|passcode|secret|token|authorization|cookie|otp|signature|api[-_]?key|medical|allerg|emergency|pickup|waiver|date[_-]?of[_-]?birth|dob)/i;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const MAX_DEPTH = 6;

function redactString(value) {
  return value.replace(BEARER, "Bearer [REDACTED]").replace(EMAIL, "[EMAIL_REDACTED]");
}

function sanitize(value, depth = 0, seen = new WeakSet()) {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactString(value).slice(0, 4000);
  if (["number", "boolean"].includes(typeof value)) return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function") return "[FUNCTION]";
  if (depth >= MAX_DEPTH) return "[TRUNCATED]";
  if (typeof value !== "object") return String(value);
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message || "Unexpected error"),
      code: value.code,
      stack: process.env.NODE_ENV === "production" ? undefined : redactString(value.stack || ""),
    };
  }

  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => sanitize(item, depth + 1, seen));
  }

  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 100)
      .map(([key, item]) => [
        key,
        SENSITIVE_KEY.test(key) ? "[REDACTED]" : sanitize(item, depth + 1, seen),
      ]),
  );
}

function emit(level, event, fields = {}) {
  const context = requestContext.getStore() || {};
  const entry = sanitize({
    timestamp: new Date().toISOString(),
    level,
    service: process.env.SERVICE_NAME || "junior-pass-api",
    environment: process.env.NODE_ENV || "development",
    event,
    ...context,
    ...fields,
  });
  process.stdout.write(`${JSON.stringify(entry)}\n`);
}

const logger = Object.freeze({
  debug: (event, fields) => emit("debug", event, fields),
  info: (event, fields) => emit("info", event, fields),
  warn: (event, fields) => emit("warn", event, fields),
  error: (event, fields) => emit("error", event, fields),
  fatal: (event, fields) => emit("fatal", event, fields),
});

function runWithContext(context, callback) {
  return requestContext.run(sanitize(context), callback);
}

function installConsoleBridge() {
  if (global.__juniorPassConsoleBridgeInstalled) return;
  global.__juniorPassConsoleBridgeInstalled = true;

  console.log = (...args) => logger.info("application_log", { details: args });
  console.info = (...args) => logger.info("application_log", { details: args });
  console.warn = (...args) => logger.warn("application_log", { details: args });
  console.error = (...args) => logger.error("application_error", { details: args });
}

module.exports = {
  installConsoleBridge,
  logger,
  redactString,
  runWithContext,
  sanitize,
};
