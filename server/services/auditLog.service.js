const { randomUUID } = require("node:crypto");

const ACTOR_TYPES = new Set(["admin", "partner", "user", "system"]);
const BLOCKED_KEYS = /password|token|secret|hmac|authorization|cookie|allerg|medical|waiver/i;

const sanitizeValue = (value, depth = 0) => {
  if (value === undefined || value === null) return value ?? null;
  if (depth > 5) return "[truncated]";
  if (Array.isArray(value)) {
    return value.slice(0, 100).map((item) => sanitizeValue(item, depth + 1));
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== "object") {
    return typeof value === "string" ? value.slice(0, 2000) : value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !BLOCKED_KEYS.test(key))
      .map(([key, item]) => [key, sanitizeValue(item, depth + 1)]),
  );
};

const cleanText = (value, maxLength) => String(value || "").trim().slice(0, maxLength);

async function recordAuditEvent(db, event) {
  const actorType = cleanText(event.actorType, 20).toLowerCase();
  const action = cleanText(event.action, 100).toUpperCase();
  const entityType = cleanText(event.entityType, 50).toLowerCase();
  const entityId = cleanText(event.entityId, 255);
  if (!ACTOR_TYPES.has(actorType) || !action || !entityType || !entityId) {
    throw new Error("Invalid audit event");
  }

  const result = await db.query(
    `INSERT INTO audit_events (
       actor_type, actor_id, action, entity_type, entity_id,
       before_state, after_state, metadata, request_id
     ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9)
     RETURNING audit_id, created_at`,
    [
      actorType,
      event.actorId || null,
      action,
      entityType,
      entityId,
      event.before === undefined ? null : JSON.stringify(sanitizeValue(event.before)),
      event.after === undefined ? null : JSON.stringify(sanitizeValue(event.after)),
      JSON.stringify(sanitizeValue(event.metadata || {})),
      cleanText(event.requestId || randomUUID(), 100),
    ],
  );
  return result.rows[0];
}

const requestAuditId = (req) =>
  cleanText(req?.headers?.["x-request-id"] || randomUUID(), 100);

module.exports = {
  recordAuditEvent,
  requestAuditId,
  sanitizeValue,
};
