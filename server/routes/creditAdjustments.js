const express = require("express");
const pool = require("../db");
const { AUTH_ROLES } = require("../constants/auth");
const authorization = require("../middleware/authorization").forRole(
  AUTH_ROLES.ADMIN,
);
const { requestAuditId } = require("../services/auditLog.service");
const {
  CreditAdjustmentError,
  applyCreditAdjustment,
} = require("../services/creditAdjustment.service");

const router = express.Router();
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

router.get("/admin", authorization, async (req, res) => {
  const accountType = String(req.query.account_type || "").toLowerCase();
  const accountId = String(req.query.account_id || "");
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 10, 1), 50);
  if (!new Set(["parent", "partner"]).has(accountType) || !UUID_PATTERN.test(accountId)) {
    return res.status(400).json({ error: "A valid parent or partner account is required" });
  }

  try {
    const result = await pool.query(
      `SELECT ca.adjustment_id, ca.account_type, ca.credit_delta,
              ca.balance_before, ca.balance_after, ca.reason, ca.reference,
              ca.created_at, a.username AS created_by_name
       FROM credit_adjustments ca
       JOIN admins a ON a.admin_id = ca.created_by
       WHERE ($1 = 'parent' AND ca.parent_id = $2)
          OR ($1 = 'partner' AND ca.partner_id = $2)
       ORDER BY ca.created_at DESC, ca.adjustment_id DESC
       LIMIT $3`,
      [accountType, accountId, limit],
    );
    return res.json({ adjustments: result.rows });
  } catch (error) {
    console.error("Unable to load credit adjustments", error.message);
    return res.status(500).json({ error: "Unable to load credit adjustments" });
  }
});

router.post("/admin", authorization, async (req, res) => {
  try {
    const result = await applyCreditAdjustment(pool, {
      ...req.body,
      idempotency_key: req.get("Idempotency-Key"),
      admin_id: req.user,
      request_id: requestAuditId(req),
    });
    return res.status(result.alreadyApplied ? 200 : 201).json(result);
  } catch (error) {
    if (error instanceof CreditAdjustmentError) {
      return res.status(error.status).json({ error: error.message, code: error.code });
    }
    console.error("Unable to apply credit adjustment", error.message);
    return res.status(500).json({ error: "Unable to apply credit adjustment" });
  }
});

module.exports = router;
