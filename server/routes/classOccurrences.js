const express = require("express");
const router = express.Router();
const pool = require("../db");
const { AUTH_ROLES } = require("../constants/auth");
const authorization = require("../middleware/authorization").forRole(
  AUTH_ROLES.PARTNER,
);

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

// PATCH - Cancel a class occurrence
router.patch("/:occurrenceId/cancel", authorization, async (req, res) => {
  const { occurrenceId } = req.params;
  const { reason } = req.body;
  const partner_id = req.user;

  try {
    console.log(`🚫 Cancelling occurrence ${occurrenceId}`);

    // Verify partner owns this occurrence
    const verifyResult = await pool.query(
      `SELECT co.*, b.booking_id, b.user_id, l.listing_title
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

    // Update occurrence to cancelled
    await pool.query(
       `UPDATE class_occurrences
       SET status = 'cancelled',
           cancellation_reason = $1,
           cancelled_by = $2,
           updated_at = NOW()
       WHERE occurrence_id = $3`,
      [reason || "Cancelled by partner", AUTH_ROLES.PARTNER, occurrenceId]
    );

    console.log(`✅ Class occurrence cancelled: ${occurrenceId}`);

    // Notify parent about cancellation
    try {
      await pool.query(
        `INSERT INTO notifications (recipient_type, recipient_id, type, title, message, data)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          AUTH_ROLES.USER,
          occurrence.user_id,
          "class_cancelled",
          `Class Cancelled: ${occurrence.listing_title}`,
          `A class scheduled for ${new Date(occurrence.scheduled_date).toLocaleDateString()} has been cancelled. ${reason || ""}`,
          JSON.stringify({
            occurrence_id: occurrenceId,
            booking_id: occurrence.booking_id,
            scheduled_date: occurrence.scheduled_date,
            reason,
          }),
        ]
      );
    } catch (notifyErr) {
      console.error("Failed to insert cancellation notification:", notifyErr.message);
    }

    res.json({
      success: true,
      message: "Class cancelled successfully",
    });
  } catch (error) {
    console.error("❌ Error cancelling class:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// PATCH - Reschedule a class occurrence
router.patch("/:occurrenceId/reschedule", authorization, async (req, res) => {
  const { occurrenceId } = req.params;
  const { new_date, new_end_date } = req.body;
  const partner_id = req.user;

  try {
    console.log(`📅 Rescheduling occurrence ${occurrenceId} to ${new_date}`);

    if (!new_date || !new_end_date) {
      return res.status(400).json({ error: "new_date and new_end_date are required" });
    }

    // Verify partner owns this occurrence
    const verifyResult = await pool.query(
      `SELECT co.*, b.booking_id, b.user_id, l.listing_title
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

    // Update occurrence with new date
    await pool.query(
      `UPDATE class_occurrences
       SET scheduled_date = $1,
           scheduled_end_date = $2,
           status = 'rescheduled',
           rescheduled_to = $1,
           updated_at = NOW()
       WHERE occurrence_id = $3`,
      [new_date, new_end_date, occurrenceId]
    );

    console.log(`✅ Class rescheduled to ${new_date}`);

    // Notify parent about reschedule
    try {
      await pool.query(
        `INSERT INTO notifications (recipient_type, recipient_id, type, title, message, data)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          AUTH_ROLES.USER,
          occurrence.user_id,
          "class_rescheduled",
          `Class Rescheduled: ${occurrence.listing_title}`,
          `A class originally scheduled for ${new Date(occurrence.scheduled_date).toLocaleDateString()} has been rescheduled to ${new Date(new_date).toLocaleDateString()}.`,
          JSON.stringify({
            occurrence_id: occurrenceId,
            booking_id: occurrence.booking_id,
            old_date: occurrence.scheduled_date,
            new_date,
          }),
        ]
      );
    } catch (notifyErr) {
      console.error("Failed to insert reschedule notification:", notifyErr.message);
    }

    res.json({
      success: true,
      message: "Class rescheduled successfully",
      new_date,
    });
  } catch (error) {
    console.error("❌ Error rescheduling class:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// POST - Add makeup/compensation class
router.post("/:occurrenceId/makeup", authorization, async (req, res) => {
  const { occurrenceId } = req.params;
  const { makeup_date, makeup_end_date } = req.body;
  const partner_id = req.user;

  try {
    console.log(`🎁 Adding makeup class for occurrence ${occurrenceId}`);

    if (!makeup_date || !makeup_end_date) {
      return res.status(400).json({ error: "makeup_date and makeup_end_date are required" });
    }

    // Verify partner owns this occurrence and it's cancelled
    const verifyResult = await pool.query(
      `SELECT co.*, b.booking_id, b.classes_total, b.user_id, l.listing_title
       FROM class_occurrences co
       JOIN bookings b ON co.booking_id = b.booking_id
       JOIN listings l ON b.listing_id = l.listing_id
       WHERE co.occurrence_id = $1 AND l.partner_id = $2 AND co.status = 'cancelled'`,
      [occurrenceId, partner_id]
    );

    if (verifyResult.rowCount === 0) {
      return res.status(404).json({
        error: "Cancelled occurrence not found or unauthorized",
      });
    }

    const occurrence = verifyResult.rows[0];
    const booking_id = occurrence.booking_id;
    const classes_total = occurrence.classes_total;

    // Create a new makeup class occurrence
    const newOccurrence = await pool.query(
      `INSERT INTO class_occurrences (
        booking_id, scheduled_date, scheduled_end_date,
        occurrence_number, status
      )
      VALUES ($1, $2, $3, $4, 'scheduled')
      RETURNING *`,
      [booking_id, makeup_date, makeup_end_date, classes_total + 1]
    );

    // Increment classes_total in booking
    await pool.query(
      `UPDATE bookings
       SET classes_total = classes_total + 1, updated_at = NOW()
       WHERE booking_id = $1`,
      [booking_id]
    );

    console.log(`✅ Makeup class added for ${new Date(makeup_date).toLocaleDateString()}`);

    // Notify parent about makeup class
    try {
      await pool.query(
        `INSERT INTO notifications (recipient_type, recipient_id, type, title, message, data)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          AUTH_ROLES.USER,
          occurrence.user_id,
          "makeup_class",
          `Makeup Class Scheduled: ${occurrence.listing_title}`,
          `A makeup class has been scheduled for ${new Date(makeup_date).toLocaleDateString()} to compensate for a cancelled class.`,
          JSON.stringify({
            occurrence_id: newOccurrence.rows[0].occurrence_id,
            booking_id,
            makeup_date,
            original_occurrence_id: occurrenceId,
          }),
        ]
      );
    } catch (notifyErr) {
      console.error("Failed to insert makeup class notification:", notifyErr.message);
    }

    res.json({
      success: true,
      message: "Makeup class added successfully",
      occurrence: newOccurrence.rows[0],
    });
  } catch (error) {
    console.error("❌ Error adding makeup class:", error);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
