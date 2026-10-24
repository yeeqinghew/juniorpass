const express = require("express");
const fs = require("fs");
const path = require("path");
const pool = require("../db");
const authorization = require("../middleware/authorization");
const { AUTH_ROLES } = require("../constants/auth");
const {
  getNextSettlementDate,
  syncPartnerEarnings,
} = require("../services/partnerPayout.service");
const {
  recordAuditEvent,
  requestAuditId,
} = require("../services/auditLog.service");

const router = express.Router();
const partnerAuthorization = authorization.forRole(AUTH_ROLES.PARTNER);
const adminAuthorization = authorization.forRole(AUTH_ROLES.ADMIN);
const statementAuthorization = authorization.forRoles(
  AUTH_ROLES.PARTNER,
  AUTH_ROLES.ADMIN,
);
const payoutStatementCss = fs.readFileSync(
  path.join(__dirname, "../templates/payoutStatement.css"),
  "utf8",
);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const notCoveredByOpeningBalance = `NOT (
  pe.source = 'BOOKING_OCCURRENCE'
  AND EXISTS (
    SELECT 1
    FROM partner_earnings opening
    JOIN bookings original_booking ON original_booking.booking_id = pe.booking_id
    WHERE opening.partner_id = pe.partner_id
      AND opening.source = 'OPENING_BALANCE'
      AND original_booking.created_at <= opening.created_at
  )
)`;

const formatDate = (value) => value ? new Date(value).toLocaleDateString("en-SG", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Singapore",
}) : "—";

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const escapeCsv = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;

const loadStatement = async (payoutId, recipientId, recipientRole) => {
  const ownerClause = recipientRole === AUTH_ROLES.PARTNER ? "AND pp.partner_id = $2" : "";
  const params = recipientRole === AUTH_ROLES.PARTNER ? [payoutId, recipientId] : [payoutId];
  const payout = await pool.query(
    `SELECT pp.*, p.partner_name, p.email
     FROM partner_payouts pp
     JOIN partners p ON p.partner_id = pp.partner_id
     WHERE pp.payout_id = $1 ${ownerClause}`,
    params,
  );
  if (payout.rowCount === 0) return null;
  const items = await pool.query(
    `SELECT pe.*, l.listing_title, co.scheduled_date, co.scheduled_end_date,
            b.enrolled_package_type
     FROM partner_earnings pe
     LEFT JOIN listings l ON l.listing_id = pe.listing_id
     LEFT JOIN class_occurrences co ON co.occurrence_id = pe.occurrence_id
     LEFT JOIN bookings b ON b.booking_id = pe.booking_id
     WHERE pe.payout_id = $1
     ORDER BY co.scheduled_date, l.listing_title`,
    [payoutId],
  );
  return { payout: payout.rows[0], items: items.rows };
};

router.get("/partner", partnerAuthorization, async (req, res) => {
  try {
    await syncPartnerEarnings(pool, req.user);
    const [summary, payouts, earnings] = await Promise.all([
      pool.query(
        `SELECT
           COALESCE(SUM(gross_amount) FILTER (WHERE status = 'PENDING'), 0) AS pending_amount,
           COALESCE(SUM(credits) FILTER (WHERE status = 'PENDING'), 0) AS pending_credits,
           COALESCE(SUM(gross_amount) FILTER (WHERE status = 'AVAILABLE'), 0) AS available_amount,
           COALESCE(SUM(credits) FILTER (WHERE status = 'AVAILABLE'), 0) AS available_credits,
           COALESCE(SUM(gross_amount) FILTER (WHERE status = 'IN_PAYOUT'), 0) AS processing_amount,
           COALESCE(SUM(credits) FILTER (WHERE status = 'IN_PAYOUT'), 0) AS processing_credits,
           COALESCE(SUM(gross_amount) FILTER (WHERE status = 'SETTLED'), 0) AS paid_amount,
           COALESCE(SUM(credits) FILTER (WHERE status = 'SETTLED'), 0) AS paid_credits
         FROM partner_earnings pe
         WHERE pe.partner_id = $1 AND ${notCoveredByOpeningBalance}`,
        [req.user],
      ),
      pool.query(
        `SELECT * FROM partner_payouts
         WHERE partner_id = $1 AND status <> 'VOID'
         ORDER BY created_at DESC`,
        [req.user],
      ),
      pool.query(
        `SELECT pe.*, l.listing_title, co.scheduled_date
         FROM partner_earnings pe
         LEFT JOIN listings l ON l.listing_id = pe.listing_id
         LEFT JOIN class_occurrences co ON co.occurrence_id = pe.occurrence_id
         WHERE pe.partner_id = $1 AND pe.status <> 'REVERSED'
           AND ${notCoveredByOpeningBalance}
         ORDER BY co.scheduled_date DESC LIMIT 100`,
        [req.user],
      ),
    ]);
    res.json({
      summary: summary.rows[0],
      payouts: payouts.rows,
      earnings: earnings.rows,
      next_settlement_date: getNextSettlementDate(),
    });
  } catch (error) {
    console.error("Unable to load partner payouts:", error.message);
    res.status(500).json({ error: "Unable to load partner earnings" });
  }
});

router.get("/admin", adminAuthorization, async (_req, res) => {
  try {
    await syncPartnerEarnings(pool);
    const [partners, payouts] = await Promise.all([
      pool.query(
        `SELECT p.partner_id, p.partner_name, p.email,
                COALESCE(SUM(pe.credits) FILTER (WHERE pe.status = 'AVAILABLE'), 0) AS available_credits,
                COALESCE(SUM(pe.gross_amount) FILTER (WHERE pe.status = 'AVAILABLE'), 0) AS available_amount,
                COUNT(pe.earning_id) FILTER (WHERE pe.status = 'AVAILABLE')::integer AS available_sessions
         FROM partners p
         LEFT JOIN partner_earnings pe ON pe.partner_id = p.partner_id
           AND ${notCoveredByOpeningBalance}
         GROUP BY p.partner_id ORDER BY p.partner_name`,
      ),
      pool.query(
        `SELECT pp.*, p.partner_name, p.email,
                COUNT(pe.earning_id)::integer AS session_count
         FROM partner_payouts pp
         JOIN partners p ON p.partner_id = pp.partner_id
         LEFT JOIN partner_earnings pe ON pe.payout_id = pp.payout_id
         GROUP BY pp.payout_id, p.partner_id
         ORDER BY pp.created_at DESC`,
      ),
    ]);
    res.json({ partners: partners.rows, payouts: payouts.rows });
  } catch (error) {
    console.error("Unable to load payout workspace:", error.message);
    res.status(500).json({ error: "Unable to load payout workspace" });
  }
});

router.post("/admin", adminAuthorization, async (req, res) => {
  const { partner_id: partnerId, cutoff_date: cutoffDate, notes = "" } = req.body;
  const cutoff = /^\d{4}-\d{2}-\d{2}$/.test(String(cutoffDate || ""))
    ? new Date(`${cutoffDate}T00:00:00+08:00`)
    : new Date(Number.NaN);
  if (!UUID_PATTERN.test(String(partnerId || "")) || Number.isNaN(cutoff.getTime())) {
    return res.status(400).json({ error: "Partner and settlement cutoff are required" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`payout:${partnerId}`]);
    await syncPartnerEarnings(client, partnerId);
    const earnings = await client.query(
      `SELECT pe.* FROM partner_earnings pe
       WHERE pe.partner_id = $1 AND pe.status = 'AVAILABLE' AND pe.available_at < $2
         AND ${notCoveredByOpeningBalance}
       ORDER BY pe.available_at FOR UPDATE`,
      [partnerId, cutoff],
    );
    if (earnings.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "No available earnings before this cutoff" });
    }
    const totals = earnings.rows.reduce(
      (sum, item) => ({
        credits: sum.credits + Number(item.credits),
        amount: sum.amount + Number(item.gross_amount),
      }),
      { credits: 0, amount: 0 },
    );
    const periodStart = earnings.rows[0].available_at;
    const payout = await client.query(
      `INSERT INTO partner_payouts (
         partner_id, period_start, period_end, total_credits, gross_amount,
         net_amount, notes, generated_by
       ) VALUES ($1, $2::date, $3::date, $4, $5, $5, $6, $7)
       RETURNING *`,
      [partnerId, periodStart, cutoff, totals.credits, totals.amount.toFixed(2), notes.trim() || null, req.user],
    );
    await client.query(
      `UPDATE partner_earnings SET status = 'IN_PAYOUT', payout_id = $1, updated_at = NOW()
       WHERE earning_id = ANY($2::uuid[])`,
      [payout.rows[0].payout_id, earnings.rows.map((item) => item.earning_id)],
    );
    await recordAuditEvent(client, {
      actorType: AUTH_ROLES.ADMIN,
      actorId: req.user,
      action: "SETTLEMENT_DRAFT_CREATED",
      entityType: "settlement",
      entityId: payout.rows[0].payout_id,
      after: payout.rows[0],
      metadata: { partner_id: partnerId, earning_count: earnings.rowCount },
      requestId: requestAuditId(req),
    });
    await client.query("COMMIT");
    res.status(201).json({ payout: payout.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") {
      return res.status(409).json({ error: "A payout already exists for this partner and period" });
    }
    console.error("Unable to create payout draft:", error.message);
    res.status(500).json({ error: "Unable to create payout draft" });
  } finally {
    client.release();
  }
});

router.patch("/admin/:payoutId/paid", adminAuthorization, async (req, res) => {
  if (!UUID_PATTERN.test(req.params.payoutId)) {
    return res.status(400).json({ error: "Invalid payout ID" });
  }
  const transferReference = String(req.body.transfer_reference || "").trim();
  const paidAt = req.body.paid_at ? new Date(req.body.paid_at) : new Date();
  if (!transferReference || Number.isNaN(paidAt.getTime())) {
    return res.status(400).json({ error: "Transfer reference and payment date are required" });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const payout = await client.query(
      "SELECT * FROM partner_payouts WHERE payout_id = $1 FOR UPDATE",
      [req.params.payoutId],
    );
    if (payout.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Payout not found" });
    }
    if (payout.rows[0].status === "PAID") {
      await client.query("ROLLBACK");
      return res.json({ payout: payout.rows[0], already_paid: true });
    }
    if (payout.rows[0].status !== "DRAFT") {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Only a draft payout can be marked paid" });
    }
    const updated = await client.query(
      `UPDATE partner_payouts SET status = 'PAID', transfer_reference = $2,
         paid_at = $3, paid_by = $4, updated_at = NOW()
       WHERE payout_id = $1 RETURNING *`,
      [req.params.payoutId, transferReference, paidAt, req.user],
    );
    await client.query(
      `UPDATE partner_earnings SET status = 'SETTLED', settled_at = $2, updated_at = NOW()
       WHERE payout_id = $1 AND status = 'IN_PAYOUT'`,
      [req.params.payoutId, paidAt],
    );
    await client.query(
      `UPDATE partners SET credit = GREATEST(0, credit - $2), updated_at = NOW()
       WHERE partner_id = $1`,
      [payout.rows[0].partner_id, payout.rows[0].total_credits],
    );
    await client.query(
      `INSERT INTO notifications (recipient_type, recipient_id, type, title, message, data)
       VALUES ('partner', $1, 'payout', 'Payout sent', $2, $3::jsonb)`,
      [
        payout.rows[0].partner_id,
        `Your Junior Pass payout of SGD ${Number(payout.rows[0].net_amount).toFixed(2)} has been recorded.`,
        JSON.stringify({ payout_id: req.params.payoutId, transfer_reference: transferReference }),
      ],
    );
    await recordAuditEvent(client, {
      actorType: AUTH_ROLES.ADMIN,
      actorId: req.user,
      action: "SETTLEMENT_MARKED_PAID",
      entityType: "settlement",
      entityId: req.params.payoutId,
      before: payout.rows[0],
      after: updated.rows[0],
      metadata: { partner_id: payout.rows[0].partner_id },
      requestId: requestAuditId(req),
    });
    await client.query("COMMIT");
    res.json({ payout: updated.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") {
      return res.status(409).json({ error: "This transfer reference has already been used" });
    }
    console.error("Unable to mark payout paid:", error.message);
    res.status(500).json({ error: "Unable to mark payout paid" });
  } finally {
    client.release();
  }
});

router.patch("/admin/:payoutId/void", adminAuthorization, async (req, res) => {
  if (!UUID_PATTERN.test(req.params.payoutId)) {
    return res.status(400).json({ error: "Invalid payout ID" });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const payout = await client.query(
      "SELECT * FROM partner_payouts WHERE payout_id = $1 FOR UPDATE",
      [req.params.payoutId],
    );
    if (payout.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Payout not found" });
    }
    if (payout.rows[0].status === "VOID") {
      await client.query("ROLLBACK");
      return res.json({ payout: payout.rows[0], already_void: true });
    }
    if (payout.rows[0].status !== "DRAFT") {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Only a draft payout can be voided" });
    }
    await client.query(
      `UPDATE partner_earnings SET status = CASE WHEN available_at <= NOW() THEN 'AVAILABLE' ELSE 'PENDING' END,
         payout_id = NULL, updated_at = NOW() WHERE payout_id = $1`,
      [req.params.payoutId],
    );
    const updated = await client.query(
      "UPDATE partner_payouts SET status = 'VOID', updated_at = NOW() WHERE payout_id = $1 RETURNING *",
      [req.params.payoutId],
    );
    await recordAuditEvent(client, {
      actorType: AUTH_ROLES.ADMIN,
      actorId: req.user,
      action: "SETTLEMENT_VOIDED",
      entityType: "settlement",
      entityId: req.params.payoutId,
      before: payout.rows[0],
      after: updated.rows[0],
      metadata: { partner_id: payout.rows[0].partner_id },
      requestId: requestAuditId(req),
    });
    await client.query("COMMIT");
    res.json({ payout: updated.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Unable to void payout:", error.message);
    res.status(500).json({ error: "Unable to void payout" });
  } finally {
    client.release();
  }
});

router.get("/:payoutId/statement.csv", statementAuthorization, async (req, res, next) => {
    if (!UUID_PATTERN.test(req.params.payoutId)) {
      return res.status(400).json({ error: "Invalid payout ID" });
    }
    try {
      const statement = await loadStatement(req.params.payoutId, req.user, req.authRole);
      if (!statement) return res.status(404).json({ error: "Payout statement not found" });
      const rows = [
        ["Class", "Session date", "Package", "Credits", "Rate", "Amount (SGD)"],
        ...statement.items.map((item) => [
          item.listing_title || "Opening balance", formatDate(item.scheduled_date), item.enrolled_package_type || "—",
          item.credits, item.dollars_per_credit, item.gross_amount,
        ]),
      ];
      const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\r\n");
      res.set("Content-Type", "text/csv; charset=utf-8");
      res.set("Content-Disposition", `attachment; filename=juniorpass-payout-${req.params.payoutId}.csv`);
      res.send(`\uFEFF${csv}`);
    } catch (statementError) {
      next(statementError);
    }
});

router.get("/:payoutId/statement", statementAuthorization, async (req, res, next) => {
    if (!UUID_PATTERN.test(req.params.payoutId)) {
      return res.status(400).json({ error: "Invalid payout ID" });
    }
    try {
      const statement = await loadStatement(req.params.payoutId, req.user, req.authRole);
      if (!statement) return res.status(404).json({ error: "Payout statement not found" });
      const { payout, items } = statement;
      const rows = items.map((item) => `<tr><td>${escapeHtml(item.listing_title || "Opening balance")}</td><td>${formatDate(item.scheduled_date)}</td><td>${escapeHtml(item.enrolled_package_type || "—")}</td><td>${escapeHtml(item.credits)}</td><td>SGD ${Number(item.gross_amount).toFixed(2)}</td></tr>`).join("");
      res.set("Content-Type", "text/html; charset=utf-8");
      res.send(`<!doctype html><html><head><meta charset="utf-8"><title>Payout statement</title><style>${payoutStatementCss}</style></head><body><header><h1>Junior Pass payout statement</h1><div>${escapeHtml(payout.partner_name)}</div></header><dl><dt>Statement ID</dt><dd>${escapeHtml(payout.payout_id)}</dd><dt>Period</dt><dd>${formatDate(payout.period_start)} – ${formatDate(new Date(new Date(payout.period_end).getTime() - 86400000))}</dd><dt>Status</dt><dd>${escapeHtml(payout.status)}</dd><dt>Transfer reference</dt><dd>${escapeHtml(payout.transfer_reference || "Pending")}</dd></dl><table><thead><tr><th>Class</th><th>Session</th><th>Package</th><th>Credits</th><th>Amount</th></tr></thead><tbody>${rows}</tbody></table><p class="total">Total: SGD ${Number(payout.net_amount).toFixed(2)}</p><button onclick="window.print()">Print / Save PDF</button></body></html>`);
    } catch (statementError) {
      next(statementError);
    }
});

module.exports = router;
