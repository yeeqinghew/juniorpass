const express = require("express");
const router = express.Router();
const pool = require("../db");
const { AUTH_ROLES } = require("../constants/auth");
const authorization = require("../middleware/authorization").forRole(
  AUTH_ROLES.PARTNER,
);
const {
  changePartnerSession,
  getPartnerSessions,
} = require("../services/classSessionManagement.service");

// GET grouped class sessions for the partner workspace. A session groups every
// confirmed booking on the same schedule and occurrence time.
router.get("/partner/sessions", authorization, async (req, res) => {
  try {
    const sessions = await getPartnerSessions(pool, req.user);
    res.json({ success: true, sessions });
  } catch (error) {
    console.error("Unable to load partner sessions:", error);
    res.status(500).json({ error: "Unable to load class sessions" });
  }
});

// Apply one partner-led change to every booking in the selected class session.
router.post("/partner/sessions/:action", authorization, async (req, res) => {
  try {
    const result = await changePartnerSession({
      dbPool: pool,
      partnerId: req.user,
      action: req.params.action,
      body: req.body,
    });
    res.status(result.status).json(result.payload);
  } catch (error) {
    console.error("Unable to update partner session:", error);
    res.status(500).json({ error: "Unable to update class session" });
  }
});

// GET all class occurrences for a partner's listings
router.get("/partner", authorization, async (req, res) => {
  try {
    const partner_id = req.user;

    const occurrences = await pool.query(
      `
      SELECT
        co.*,
        b.booking_id,
        b.listing_id,
        b.enrolled_package_type,
        b.classes_total,
        l.listing_title,
        u.name as parent_name,
        u.email as parent_email,
        u.phone_number as parent_phone,
        (
          SELECT name
          FROM children
          WHERE child_id = (
            SELECT child_id
            FROM transactions
            WHERE parent_id = b.user_id
              AND listing_id = b.listing_id
              AND transaction_type = 'DEBIT'
              AND created_at >= b.created_at
            ORDER BY created_at ASC
            LIMIT 1
          )
        ) as child_name
      FROM class_occurrences co
      JOIN bookings b ON co.booking_id = b.booking_id
      JOIN listings l ON b.listing_id = l.listing_id
      JOIN users u ON b.user_id = u.user_id
      WHERE l.partner_id = $1
      ORDER BY co.scheduled_date ASC
    `,
      [partner_id],
    );

    res.json({
      success: true,
      occurrences: occurrences.rows,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

// PATCH - Mark attendance for a class occurrence
router.patch("/:occurrenceId/attendance", authorization, async (req, res) => {
  const { occurrenceId } = req.params;
  const { attended } = req.body;
  const partner_id = req.user;

  try {
    console.log(`📋 Marking attendance for occurrence ${occurrenceId}: attended=${attended}`);

    // Verify partner owns this occurrence
    const verifyResult = await pool.query(
      `SELECT co.*, b.booking_id, b.user_id, b.classes_attended, b.classes_total
       FROM class_occurrences co
       JOIN bookings b ON co.booking_id = b.booking_id
       JOIN listings l ON b.listing_id = l.listing_id
       WHERE co.occurrence_id = $1 AND l.partner_id = $2`,
      [occurrenceId, partner_id]
    );

    if (verifyResult.rowCount === 0) {
      return res.status(404).json({ error: "Occurrence not found or unauthorized" });
    }

    const occurrence = verifyResult.rows[0];
    const booking_id = occurrence.booking_id;
    const user_id = occurrence.user_id;
    let classes_attended = occurrence.classes_attended || 0;

    // Update occurrence attendance
    await pool.query(
      `UPDATE class_occurrences
       SET attended = $1,
           status = CASE WHEN $1 = true THEN 'completed' ELSE 'scheduled' END,
           updated_at = NOW()
       WHERE occurrence_id = $2`,
      [attended, occurrenceId]
    );

    // Update booking classes_attended count
    if (attended && !occurrence.attended) {
      // Marking as attended (increment)
      classes_attended += 1;
    } else if (!attended && occurrence.attended) {
      // Unmarking attendance (decrement)
      classes_attended = Math.max(0, classes_attended - 1);
    }

    await pool.query(
      `UPDATE bookings
       SET classes_attended = $1, updated_at = NOW()
       WHERE booking_id = $2`,
      [classes_attended, booking_id]
    );

    console.log(`✅ Attendance marked. Total attended: ${classes_attended}/${occurrence.classes_total}`);

    // Notify parent about attendance
    try {
      await pool.query(
        `INSERT INTO notifications (recipient_type, recipient_id, type, title, message, data)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          AUTH_ROLES.USER,
          user_id,
          "attendance",
          attended ? "Class Attended" : "Attendance Removed",
          attended
            ? "Your child attended the class."
            : "Class attendance was removed by the partner.",
          JSON.stringify({
            occurrence_id: occurrenceId,
            booking_id,
            attended,
          }),
        ]
      );
    } catch (notifyErr) {
      console.error("Failed to insert attendance notification:", notifyErr.message);
    }

    res.json({
      success: true,
      message: "Attendance updated successfully",
      classes_attended,
    });
  } catch (error) {
    console.error("❌ Error marking attendance:", error);
    res.status(500).json({ error: "Server error" });
  }
});

const changeSessionFromOccurrence = async (req, res, action, overrides = {}) => {
  try {
    const occurrenceResult = await pool.query(
      `SELECT b.schedule_id,
              TO_CHAR(co.scheduled_date, 'YYYY-MM-DD"T"HH24:MI:SS') AS scheduled_date
       FROM class_occurrences co
       JOIN bookings b ON b.booking_id = co.booking_id
       JOIN listings l ON l.listing_id = b.listing_id
       WHERE co.occurrence_id = $1 AND l.partner_id = $2`,
      [req.params.occurrenceId, req.user],
    );
    if (occurrenceResult.rowCount === 0) {
      return res.status(404).json({ error: "Class session not found" });
    }

    const occurrence = occurrenceResult.rows[0];
    const result = await changePartnerSession({
      dbPool: pool,
      partnerId: req.user,
      action,
      body: {
        schedule_id: occurrence.schedule_id,
        scheduled_date: occurrence.scheduled_date,
        reason: req.body.reason,
        ...overrides,
      },
    });
    return res.status(result.status).json(result.payload);
  } catch (error) {
    console.error(`Unable to ${action} class session:`, error);
    return res.status(500).json({ error: "Unable to update class session" });
  }
};

// Compatibility routes now preserve the shared-session invariant: an old
// occurrence-based request changes every confirmed booking in that session.
router.patch("/:occurrenceId/cancel", authorization, (req, res) =>
  changeSessionFromOccurrence(req, res, "cancel"),
);

router.patch("/:occurrenceId/reschedule", authorization, (req, res) =>
  changeSessionFromOccurrence(req, res, "reschedule", {
    new_start_date: req.body.new_date,
    new_end_date: req.body.new_end_date,
  }),
);

router.post("/:occurrenceId/makeup", authorization, (req, res) =>
  changeSessionFromOccurrence(req, res, "makeup", {
    new_start_date: req.body.makeup_date,
    new_end_date: req.body.makeup_end_date,
  }),
);

module.exports = router;
