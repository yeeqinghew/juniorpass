const crypto = require("node:crypto");
const { logger, runWithContext } = require("../utils/logger");

function requestObservability(req, res, next) {
  const requestId = crypto.randomUUID();
  const startedAt = process.hrtime.bigint();
  res.set("X-Request-ID", requestId);

  runWithContext(
    {
      request_id: requestId,
      method: req.method,
      path: req.path,
    },
    () => {
      req.requestId = requestId;
      req.log = logger;

      res.on("finish", () => {
        const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
        const level = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";
        logger[level]("http_request_completed", {
          status_code: res.statusCode,
          duration_ms: Math.round(durationMs * 100) / 100,
          auth_role: req.authRole,
          actor_id: req.user,
          user_agent: req.get("user-agent"),
        });
      });

      next();
    },
  );
}

function errorObservability(error, req, res, next) {
  logger.error("unhandled_request_error", {
    error,
    status_code: error.status || 500,
    auth_role: req.authRole,
    actor_id: req.user,
  });

  if (res.headersSent) return next(error);
  return res.status(error.status || 500).json({
    error: error.status && error.status < 500 ? error.message : "Unexpected server error",
    request_id: req.requestId,
  });
}

module.exports = { errorObservability, requestObservability };
