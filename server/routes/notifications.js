const express = require("express");
const router = express.Router();
const pool = require("../db");
const { AUTH_ROLES } = require("../constants/auth");
const authorization = require("../middleware/authorization");
const userOrPartnerAuthorization = authorization.forRoles(
  AUTH_ROLES.USER,
  AUTH_ROLES.PARTNER,
);

const validateNotificationRole = (req, res, type) => {
  if (!type || ![AUTH_ROLES.USER, AUTH_ROLES.PARTNER].includes(type)) {
    res.status(400).json({
      error: "Invalid or missing type. Use 'user' or 'partner'.",
    });
    return false;
  }
  if (type !== req.authRole) {
    res.status(403).json({ error: "Notification role mismatch" });
    return false;
  }
  return true;
};

const parsePositiveInteger = (value, fallback, maximum) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
};

router.get("/unread-count", userOrPartnerAuthorization, async (req, res) => {
  const type = req.query.type;
  if (!validateNotificationRole(req, res, type)) return;

  try {
    const result = await pool.query(
      `SELECT COUNT(*)::integer AS unread_count
       FROM notifications
       WHERE recipient_type = $1 AND recipient_id = $2 AND is_read = false`,
      [type, req.user],
    );
    res.json({ unread_count: result.rows[0].unread_count });
  } catch (error) {
    console.error("ERROR in GET /notifications/unread-count", error.message);
    res.status(500).json({ error: "Unable to load notification count" });
  }
});

router.patch("/read-all", userOrPartnerAuthorization, async (req, res) => {
  const type = req.body.type;
  if (!validateNotificationRole(req, res, type)) return;

  try {
    const result = await pool.query(
      `UPDATE notifications
       SET is_read = true
       WHERE recipient_type = $1 AND recipient_id = $2 AND is_read = false`,
      [type, req.user],
    );
    res.json({ updated_count: result.rowCount });
  } catch (error) {
    console.error("ERROR in PATCH /notifications/read-all", error.message);
    res.status(500).json({ error: "Unable to mark notifications as read" });
  }
});

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
  const page = parsePositiveInteger(req.query.page, 1, 100000);
  const limit = parsePositiveInteger(req.query.limit, 10, 50);
  const unreadOnly = req.query.unread === "true";
  const offset = (page - 1) * limit;

  if (!validateNotificationRole(req, res, type)) return;

  try {
    const list = await pool.query(
      `
      SELECT notification_id, recipient_type, recipient_id, type, title, message, data, is_read, created_at
      FROM notifications
      WHERE recipient_type = $1 AND recipient_id = $2
        AND ($3::boolean = false OR is_read = false)
      ORDER BY created_at DESC
      LIMIT $4 OFFSET $5
      `,
      [type, recipient_id, unreadOnly, limit, offset],
    );

    const count = await pool.query(
      `
      SELECT COUNT(*)::integer AS all_total,
             COUNT(*) FILTER (WHERE is_read = false)::integer AS unread_total
      FROM notifications
      WHERE recipient_type = $1 AND recipient_id = $2
      `,
      [type, recipient_id],
    );

    const allTotal = count.rows[0].all_total;
    const unreadTotal = count.rows[0].unread_total;

    return res.status(200).json({
      page,
      limit,
      total: unreadOnly ? unreadTotal : allTotal,
      all_total: allTotal,
      unread_total: unreadTotal,
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

  if (!validateNotificationRole(req, res, type)) return;

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
