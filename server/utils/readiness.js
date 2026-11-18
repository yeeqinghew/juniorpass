const DEFAULT_TIMEOUT_MS = 2000;

function withTimeout(operation, timeoutMs = DEFAULT_TIMEOUT_MS) {
  let timeout;
  return Promise.race([
    operation,
    new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error("Dependency check timed out")), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timeout));
}

async function checkReadiness({ db, redis, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const [database, cache] = await Promise.allSettled([
    withTimeout(db.query("SELECT 1"), timeoutMs),
    withTimeout(redis.ping(), timeoutMs),
  ]);
  const dependencies = {
    database: database.status === "fulfilled" ? "up" : "down",
    redis: cache.status === "fulfilled" ? "up" : "down",
  };

  return {
    ready: Object.values(dependencies).every((status) => status === "up"),
    dependencies,
  };
}

module.exports = { checkReadiness, withTimeout };
