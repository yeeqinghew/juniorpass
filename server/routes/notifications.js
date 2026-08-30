const express = require("express");
const router = express.Router();
const pool = require("../db");
const { AUTH_ROLES } = require("../constants/auth");
const authorization = require("../middleware/authorization");
const userOrPartnerAuthorization = authorization.forRoles(
  AUTH_ROLES.USER,
  AUTH_ROLES.PARTNER,
);

/**
 * Fetch notifications for the authenticated user or partner.
 * Query params:
 *  - type: 'user' | 'partner' (required)
 *  - page: default 1
 *  - limit: default 10
 */
router.get("/", userOrPartnerAuthorization, async (req, res) => {
  const recipient_id = req.user;
  const { type } = req.query;
  const page = Math.max(parseInt(req.query.page || "1", 10), 1);
  const limit = Math.max(parseInt(req.query.limit || "10", 10), 1);
  const offset = (page - 1) * limit;

  if (!type || ![AUTH_ROLES.USER, AUTH_ROLES.PARTNER].includes(type)) {
    return res
      .status(400)
      .json({ error: "Invalid or missing type. Use 'user' or 'partner'." });
  }
  if (type !== req.authRole) {
    return res.status(403).json({ error: "Notification role mismatch" });
  }

  try {
    const list = await pool.query(
      `
      SELECT notification_id, recipient_type, recipient_id, type, title, message, data, is_read, created_at
      FROM notifications
      WHERE recipient_type = $1 AND recipient_id = $2
      ORDER BY created_at DESC
      LIMIT $3 OFFSET $4
      `,
      [type, recipient_id, limit, offset],
    );

    const count = await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM notifications
      WHERE recipient_type = $1 AND recipient_id = $2
      `,
      [type, recipient_id],
    );

    return res.status(200).json({
      page,
      limit,
      total: parseInt(count.rows[0].total, 10),
      data: list.rows,
    });
  } catch (error) {
    console.error("ERROR in GET /notifications", error.message);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Mark notification as read for the authenticated user/partner.
 * Path param:
 *  - id: notification_id UUID
 * Body:
 *  - type: 'user' | 'partner' (required to scope ownership)
 */
router.patch("/:id/read", userOrPartnerAuthorization, async (req, res) => {
  const recipient_id = req.user;
  const { id } = req.params;
  const { type } = req.body;

  if (!type || ![AUTH_ROLES.USER, AUTH_ROLES.PARTNER].includes(type)) {
    return res
      .status(400)
      .json({ error: "Invalid or missing type. Use 'user' or 'partner'." });
  }
  if (type !== req.authRole) {
    return res.status(403).json({ error: "Notification role mismatch" });
  }

  try {
    const result = await pool.query(
      `
      UPDATE notifications
      SET is_read = true
      WHERE notification_id = $1 AND recipient_type = $2 AND recipient_id = $3
      RETURNING *
      `,
      [id, type, recipient_id],
    );

    if (result.rowCount === 0) {
      return res
        .status(404)
        .json({ error: "Notification not found or not owned by requester" });
    }

    return res.status(200).json({
      message: "Notification marked as read",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("ERROR in PATCH /notifications/:id/read", error.message);
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;
