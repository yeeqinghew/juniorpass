const express = require("express");
const pool = require("../db");
const authorization = require("../middleware/authorization");
const { AUTH_ROLES } = require("../constants/auth");

const router = express.Router();
const adminAuthorization = authorization.forRole(AUTH_ROLES.ADMIN);
const ENTITY_TYPES = new Set([
  "all",
  "credit",
  "class",
  "account",
  "conversion_rate",
  "settlement",
]);
const ACTOR_TYPES = new Set(["all", "admin", "partner", "user", "system"]);

const positiveInteger = (value, fallback, maximum) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0
    ? Math.min(parsed, maximum)
    : fallback;
};

router.get("/", adminAuthorization, async (req, res) => {
  const entityType = String(req.query.entity_type || "all").toLowerCase();
  const actorType = String(req.query.actor_type || "all").toLowerCase();
  if (!ENTITY_TYPES.has(entityType) || !ACTOR_TYPES.has(actorType)) {
    return res.status(400).json({ error: "Invalid audit filter" });
  }
  const page = positiveInteger(req.query.page, 1, 100000);
  const limit = positiveInteger(req.query.limit, 25, 100);
  const search = String(req.query.search || "").trim().slice(0, 100);
  const offset = (page - 1) * limit;

  try {
    const params = [
      entityType === "all" ? null : entityType,
      actorType === "all" ? null : actorType,
      search ? `%${search}%` : null,
    ];
    const where = `WHERE ($1::text IS NULL OR ae.entity_type = $1)
      AND ($2::text IS NULL OR ae.actor_type = $2)
      AND ($3::text IS NULL OR ae.action ILIKE $3 OR ae.entity_id ILIKE $3
        OR COALESCE(a.username, p.partner_name, u.name, 'System') ILIKE $3)`;
    const from = `FROM audit_events ae
      LEFT JOIN admins a ON ae.actor_type = 'admin' AND a.admin_id = ae.actor_id
      LEFT JOIN partners p ON ae.actor_type = 'partner' AND p.partner_id = ae.actor_id
      LEFT JOIN users u ON ae.actor_type = 'user' AND u.user_id = ae.actor_id`;
    const [items, count, summary] = await Promise.all([
      pool.query(
        `SELECT ae.*, COALESCE(a.username, p.partner_name, u.name, 'System') AS actor_name
         ${from} ${where}
         ORDER BY ae.created_at DESC, ae.audit_id DESC
         LIMIT $4 OFFSET $5`,
        [...params, limit, offset],
      ),
      pool.query(`SELECT COUNT(*)::int AS total ${from} ${where}`, params),
      pool.query(
        `SELECT entity_type, COUNT(*)::int AS count
         FROM audit_events GROUP BY entity_type`,
      ),
    ]);
    return res.json({
      items: items.rows,
      summary: Object.fromEntries(summary.rows.map((row) => [row.entity_type, row.count])),
      pagination: {
        page,
        limit,
        total: count.rows[0].total,
        total_pages: Math.max(1, Math.ceil(count.rows[0].total / limit)),
      },
    });
  } catch (error) {
    console.error("Unable to load audit log:", error.message);
    return res.status(500).json({ error: "Unable to load audit log" });
  }
});

module.exports = router;
