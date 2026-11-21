const express = require("express");
const pool = require("../db");
const { AUTH_ROLES } = require("../constants/auth");
const authorization = require("../middleware/authorization").forRole(AUTH_ROLES.ADMIN);
const adminOnly = require("../middleware/adminOnly");
const { recordAuditEvent, requestAuditId } = require("../services/auditLog.service");

const router = express.Router();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const statuses = new Set(["all", "pending", "processed", "rejected", "failed"]);
const adminAccess = [authorization, adminOnly];

router.get("/admin", ...adminAccess, async (req, res) => {
  const status = String(req.query.status || "all").toLowerCase();
  if (!statuses.has(status)) return res.status(400).json({ error: "Invalid refund status" });
  try {
    const result = await pool.query(
      `SELECT rr.*, l.listing_title, u.name AS parent_name, u.email AS parent_email,
              c.name AS child_name, requester.username AS requested_by_name,
              reviewer.username AS reviewed_by_name
       FROM refund_requests rr
       JOIN bookings b ON b.booking_id = rr.booking_id
       JOIN listings l ON l.listing_id = b.listing_id
       JOIN users u ON u.user_id = rr.parent_id
       LEFT JOIN children c ON c.child_id = b.child_id
       JOIN admins requester ON requester.admin_id = rr.requested_by
       LEFT JOIN admins reviewer ON reviewer.admin_id = rr.reviewed_by
       WHERE ($1 = 'all' OR rr.status = $1)
       ORDER BY rr.requested_at DESC`,
      [status],
    );
    return res.json({ refunds: result.rows });
  } catch (error) {
    console.error("Unable to load refunds", error.message);
    return res.status(500).json({ error: "Unable to load refunds" });
  }
});

router.post("/admin", ...adminAccess, async (req, res) => {
  const { booking_id, credits, reason, internal_notes, idempotency_key } = req.body || {};
  const amount = Number(credits);
  const customerReason = String(reason || "").trim();
  if (!UUID.test(String(booking_id)) || !UUID.test(String(idempotency_key)) || !Number.isSafeInteger(amount) || amount < 1 || customerReason.length < 3 || customerReason.length > 1000) {
    return res.status(400).json({ error: "Provide a booking, whole credit amount, reason and request key" });
  }
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const booking = await db.query(
      `SELECT b.booking_id, b.user_id, b.child_id, b.listing_id,
              COALESCE(b.charged_credits, 0)::int AS charged_credits,
              COALESCE(b.refunded_credits, 0)::int AS automatic_refund
       FROM bookings b WHERE b.booking_id = $1 FOR UPDATE`, [booking_id]);
    if (!booking.rowCount) throw new Error("Booking not found");
    const prior = await db.query(
      `SELECT COALESCE(SUM(requested_credits) FILTER (WHERE status IN ('pending','processed')), 0)::int AS reserved
       FROM refund_requests WHERE booking_id = $1`, [booking_id]);
    const available = booking.rows[0].charged_credits - booking.rows[0].automatic_refund - prior.rows[0].reserved;
    if (amount > available) return res.status(409).json({ error: "Refund exceeds the remaining booking credits" });
    const created = await db.query(
      `INSERT INTO refund_requests (booking_id,parent_id,requested_credits,reason,internal_notes,requested_by,idempotency_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [booking_id, booking.rows[0].user_id, amount, customerReason, String(internal_notes || "").trim() || null, req.user, idempotency_key]);
    await recordAuditEvent(db, { actorType: AUTH_ROLES.ADMIN, actorId: req.user, action: "REFUND_REQUESTED", entityType: "refund", entityId: created.rows[0].refund_id, after: { booking_id, credits: amount }, metadata: { reason: customerReason }, requestId: requestAuditId(req) });
    await db.query("COMMIT");
    return res.status(201).json({ refund: created.rows[0] });
  } catch (error) {
    await db.query("ROLLBACK").catch(() => {});
    return res.status(error.message === "Booking not found" ? 404 : 500).json({ error: error.message || "Unable to request refund" });
  } finally { db.release(); }
});

router.post("/admin/:refundId/:decision", ...adminAccess, async (req, res) => {
  const { refundId, decision } = req.params;
  if (!UUID.test(refundId) || !new Set(["approve", "reject"]).has(decision)) return res.status(400).json({ error: "Invalid refund decision" });
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const request = await db.query("SELECT * FROM refund_requests WHERE refund_id=$1 FOR UPDATE", [refundId]);
    const refund = request.rows[0];
    if (!refund) return res.status(404).json({ error: "Refund request not found" });
    if (refund.status !== "pending") return res.status(409).json({ error: "Refund has already been reviewed" });
    if (refund.requested_by === req.user) return res.status(403).json({ error: "A different administrator must review this refund" });
    const note = String(req.body?.review_note || "").trim();
    if (decision === "reject") {
      if (note.length < 3) return res.status(400).json({ error: "Provide a rejection reason" });
      await db.query("UPDATE refund_requests SET status='rejected', reviewed_by=$1, reviewed_at=NOW(), review_note=$2 WHERE refund_id=$3", [req.user, note, refundId]);
    } else {
      const wallet = await db.query("SELECT credit, credit_expires_at FROM users WHERE user_id=$1 FOR UPDATE", [refund.parent_id]);
      if (!wallet.rowCount) throw new Error("Parent account not found");
      const before = wallet.rows[0].credit_expires_at && new Date(wallet.rows[0].credit_expires_at) <= new Date() ? 0 : Number(wallet.rows[0].credit);
      const after = before + Number(refund.requested_credits);
      const adjustment = await db.query(
        `INSERT INTO credit_adjustments (account_type,parent_id,credit_delta,balance_before,balance_after,reason,reference,idempotency_key,created_by)
         VALUES ('parent',$1,$2,$3,$4,$5,$6,$7,$8) RETURNING adjustment_id`,
        [refund.parent_id, refund.requested_credits, before, after, refund.reason.padEnd(10, "."), `refund:${refundId}`, `refund:${refundId}`, req.user]);
      await db.query("UPDATE users SET credit=$1, credit_expires_at=COALESCE(credit_expires_at, NOW() + INTERVAL '90 days') WHERE user_id=$2", [after, refund.parent_id]);
      await db.query("INSERT INTO transactions (parent_id,child_id,listing_id,used_credit,transaction_type,credit_adjustment_id) SELECT $1,b.child_id,b.listing_id,$2,'CREDIT',$3 FROM bookings b WHERE b.booking_id=$4", [refund.parent_id, refund.requested_credits, adjustment.rows[0].adjustment_id, refund.booking_id]);
      await db.query("UPDATE refund_requests SET status='processed', reviewed_by=$1, reviewed_at=NOW(), review_note=$2, credit_adjustment_id=$3 WHERE refund_id=$4", [req.user, note || null, adjustment.rows[0].adjustment_id, refundId]);
    }
    await recordAuditEvent(db, { actorType: AUTH_ROLES.ADMIN, actorId: req.user, action: decision === "approve" ? "REFUND_APPROVED" : "REFUND_REJECTED", entityType: "refund", entityId: refundId, metadata: { review_note: note }, requestId: requestAuditId(req) });
    await db.query("COMMIT"); return res.json({ success: true });
  } catch (error) { await db.query("ROLLBACK").catch(() => {}); return res.status(500).json({ error: error.message || "Unable to review refund" });
  } finally { db.release(); }
});

module.exports = router;
