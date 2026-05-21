const express = require("express");
const router = express.Router();
const pool = require("../db");
const authorization = require("../middleware/authorization");

router.post("/", authorization, async (req, res) => {
  const { listing_id, schedule_id, start_date, end_date, child_id } = req.body;

  try {
    // Validate request body
    if (!listing_id || !start_date || !end_date) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Validate schedule_id is provided
    if (!schedule_id) {
      return res.status(400).json({
        error: "Schedule ID is required for booking",
        message: "Please select a valid timeslot",
      });
    }

    // Check if the class has already started (prevent booking past classes)
    const classStartTime = new Date(start_date);
    const now = new Date();

    if (classStartTime <= now) {
      return res.status(400).json({
        error: "Cannot book a class that has already started or ended",
        class_start_time: classStartTime.toISOString(),
        current_time: now.toISOString(),
      });
    }

    // Retrieve listing and user data
    const listing = await pool.query(
      "SELECT * FROM listings WHERE listing_id = $1",
      [listing_id],
    );
    const user_id = req.user;
    const user = await pool.query("SELECT * FROM users WHERE user_id = $1", [
      user_id,
    ]);

    if (listing.rows.length === 0) {
      return res.status(404).json({ error: "Listing not found" });
    }

    if (user.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    // Optional: validate child belongs to this parent if provided
    if (child_id) {
      const child = await pool.query(
        "SELECT child_id FROM children WHERE child_id = $1 AND parent_id = $2",
        [child_id, user_id],
      );
      if (child.rowCount === 0) {
        return res
          .status(400)
          .json({ error: "Invalid child_id for this parent" });
      }
    }

    // Get schedule capacity and credit first
    const schedule = await pool.query(
      "SELECT slots, credit FROM schedules WHERE schedule_id = $1",
      [schedule_id],
    );

    if (schedule.rows.length === 0) {
      return res.status(404).json({ error: "Schedule not found" });
    }

    const maxSlots = schedule.rows[0].slots || 10;
    const creditCost = schedule.rows[0].credit || listing.rows[0].credit || 1;
    const userCredits = user.rows[0].credit;

    // Check user's credit balance
    if (userCredits < creditCost) {
      return res.status(400).json({ error: "Insufficient credits" });
    }

    // Check for overlapping bookings for this user
    const overlappingBookings = await pool.query(
      `
      SELECT * FROM bookings 
      WHERE user_id = $1 AND (
        (start_date <= $2 AND end_date >= $2) OR
        (start_date <= $3 AND end_date >= $3) OR
        (start_date >= $2 AND end_date <= $3)
      )
    `,
      [user_id, start_date, end_date],
    );

    if (overlappingBookings.rows.length > 0) {
      return res
        .status(400)
        .json({ error: "You already have a booking at this time" });
    }

    const existingBookings = await pool.query(
      `SELECT COUNT(*) as count 
       FROM bookings 
       WHERE schedule_id = $1 
       AND DATE(start_date) = DATE($2::timestamp)`,
      [schedule_id, start_date],
    );

    const bookedCount = parseInt(existingBookings.rows[0].count);
    if (bookedCount >= maxSlots) {
      return res.status(400).json({
        error: "This timeslot is fully booked",
        booked_count: bookedCount,
        max_slots: maxSlots,
      });
    }

    // Perform booking within transaction
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Deduct credits from user balance
      await client.query(
        "UPDATE users SET credit = credit - $1 WHERE user_id = $2",
        [creditCost, user_id],
      );

      // Credit partner balance
      await client.query(
        "UPDATE partners SET credit = credit + $1 WHERE partner_id = $2",
        [creditCost, listing.rows[0].partner_id],
      );

      // Create booking record
      const newBooking = await client.query(
        `
        INSERT INTO bookings (listing_id, schedule_id, user_id, start_date, end_date)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `,
        [listing_id, schedule_id, user_id, start_date, end_date],
      );

      // Record parent's debit transaction if child context is provided
      if (child_id) {
        await client.query(
          `INSERT INTO transactions (parent_id, child_id, listing_id, used_credit, transaction_type)
           VALUES ($1, $2, $3, $4, $5)`,
          [user_id, child_id, listing_id, creditCost, "DEBIT"],
        );
      }

      await client.query("COMMIT");

      // Insert partner notification for new booking
      try {
        await pool.query(
          `INSERT INTO notifications (recipient_type, recipient_id, type, title, message, data)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            "partner",
            listing.rows[0].partner_id,
            "booking",
            "New booking: " + listing.rows[0].listing_title,
            "A new booking has been made.",
            JSON.stringify({
              user_id,
              listing_id,
              start_date,
              end_date,
              credit: creditCost,
            }),
          ],
        );
      } catch (notifyErr) {
        console.error(
          "Failed to insert booking notification:",
          notifyErr.message,
        );
      }

      // Insert user notification for new booking
      try {
        await pool.query(
          `INSERT INTO notifications (recipient_type, recipient_id, type, title, message, data)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            "user",
            user_id,
            "booking",
            "Booking confirmed",
            "Your class has been booked.",
            JSON.stringify({
              listing_id,
              start_date,
              end_date,
              credit: creditCost,
            }),
          ],
        );
      } catch (notifyErr) {
        console.error(
          "Failed to insert user booking notification:",
          notifyErr.message,
        );
      }

      res.status(201).json({
        message: "Booking created successfully",
        booking: newBooking.rows[0],
        updated_credit: userCredits - creditCost,
      });
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

// GET availability for a specific schedule timeslot
router.get("/availability/:scheduleId", async (req, res) => {
  try {
    const { scheduleId } = req.params;
    const { start_date, end_date } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).json({ error: "Missing start_date or end_date" });
    }

    // Get schedule with slots capacity
    const schedule = await pool.query(
      `SELECT s.schedule_id, s.slots, s.day, s.timeslot, s.frequency,
              l.listing_id, l.listing_title
       FROM schedules s
       JOIN listingOutlets lo ON s.listing_outlet_id = lo.listing_outlet_id
       JOIN listings l ON lo.listing_id = l.listing_id
       WHERE s.schedule_id = $1`,
      [scheduleId],
    );

    if (schedule.rows.length === 0) {
      return res.status(404).json({ error: "Schedule not found" });
    }

    const maxSlots = schedule.rows[0].slots || 10;

    // Count existing bookings for this schedule and date (using DATE comparison for consistency)
    const bookings = await pool.query(
      `SELECT COUNT(*) as count 
       FROM bookings 
       WHERE schedule_id = $1 
       AND DATE(start_date) = DATE($2::timestamp)`,
      [scheduleId, start_date],
    );

    const bookedCount = parseInt(bookings.rows[0].count);
    const availableSpots = maxSlots - bookedCount;
    const isFull = bookedCount >= maxSlots;

    res.json({
      success: true,
      schedule_id: scheduleId,
      listing_id: schedule.rows[0].listing_id,
      listing_title: schedule.rows[0].listing_title,
      day: schedule.rows[0].day,
      timeslot: schedule.rows[0].timeslot,
      frequency: schedule.rows[0].frequency,
      start_date,
      end_date,
      max_slots: maxSlots,
      booked_count: bookedCount,
      available_spots: availableSpots,
      is_full: isFull,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

// GET all bookings for a user
router.get("/user", authorization, async (req, res) => {
  try {
    const user_id = req.user;
    const bookings = await pool.query(
      `
      SELECT 
        b.*,
        l.listing_title,
        l.description as listing_description,
        l.images,
        p.partner_name,
        p.picture as partner_picture,
        (
          SELECT child_id 
          FROM transactions 
          WHERE parent_id = b.user_id 
            AND listing_id = b.listing_id 
            AND transaction_type = 'DEBIT'
            AND created_at >= b.created_at
          ORDER BY created_at ASC
          LIMIT 1
        ) as child_id
      FROM bookings b
      JOIN listings l ON b.listing_id = l.listing_id
      JOIN partners p ON l.partner_id = p.partner_id
      WHERE b.user_id = $1
      ORDER BY b.start_date DESC
    `,
      [user_id],
    );

    res.json({
      success: true,
      bookings: bookings.rows,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

// GET all bookings for a partner
router.get("/partner/:partnerId", authorization, async (req, res) => {
  try {
    const { partnerId } = req.params;

    const bookings = await pool.query(
      `
      SELECT 
        b.*,
        l.listing_title,
        u.name as user_name,
        u.email as user_email,
        u.contact_number as user_contact
      FROM bookings b
      JOIN listings l ON b.listing_id = l.listing_id
      JOIN users u ON b.user_id = u.user_id
      WHERE l.partner_id = $1
      ORDER BY b.start_date DESC
    `,
      [partnerId],
    );

    res.json({
      success: true,
      bookings: bookings.rows,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

// DELETE/Cancel a booking
router.delete("/:bookingId", authorization, async (req, res) => {
  const { bookingId } = req.params;
  const user_id = req.user;

  try {
    // Get booking details with listing information and child_id
    const booking = await pool.query(
      `
      SELECT 
        b.booking_id,
        b.listing_id,
        b.user_id,
        b.start_date,
        b.end_date,
        b.created_at,
        l.credit,
        l.partner_id,
        l.listing_title,
        (SELECT child_id FROM transactions WHERE parent_id = b.user_id AND listing_id = b.listing_id AND transaction_type = 'DEBIT' ORDER BY created_at DESC LIMIT 1) as child_id
      FROM bookings b
      JOIN listings l ON b.listing_id = l.listing_id
      WHERE b.booking_id = $1 AND b.user_id = $2
    `,
      [bookingId, user_id],
    );

    if (booking.rows.length === 0) {
      return res
        .status(404)
        .json({ error: "Booking not found or unauthorized" });
    }

    const bookingData = booking.rows[0];

    // Check if cancellation is within 24 hours of class start
    const classStartTime = new Date(bookingData.start_date);
    const now = new Date();
    const hoursUntilClass = (classStartTime - now) / (1000 * 60 * 60);

    if (hoursUntilClass < 24) {
      return res.status(400).json({
        error:
          "Cancellations must be made at least 24 hours before the class starts",
        hours_until_class: Math.round(hoursUntilClass * 10) / 10,
      });
    }

    const creditRefund = bookingData.credit;

    // Perform cancellation within transaction
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Refund credits to user
      await client.query(
        "UPDATE users SET credit = credit + $1 WHERE user_id = $2",
        [creditRefund, user_id],
      );

      // Deduct from partner balance
      await client.query(
        "UPDATE partners SET credit = credit - $1 WHERE partner_id = $2",
        [creditRefund, bookingData.partner_id],
      );

      // Record refund transaction if child_id exists
      if (bookingData.child_id) {
        await client.query(
          `INSERT INTO transactions (parent_id, child_id, listing_id, used_credit, transaction_type)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            user_id,
            bookingData.child_id,
            bookingData.listing_id,
            creditRefund,
            "CREDIT",
          ],
        );
      }

      // Delete booking
      await client.query("DELETE FROM bookings WHERE booking_id = $1", [
        bookingId,
      ]);

      await client.query("COMMIT");

      // Notify partner about cancellation
      try {
        await pool.query(
          `INSERT INTO notifications (recipient_type, recipient_id, type, title, message, data)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            "partner",
            bookingData.partner_id,
            "cancellation",
            "Booking cancelled: " + bookingData.listing_title,
            "A booking has been cancelled.",
            JSON.stringify({
              user_id,
              booking_id: bookingId,
              credit: creditRefund,
            }),
          ],
        );
      } catch (notifyErr) {
        console.error(
          "Failed to insert cancellation notification:",
          notifyErr.message,
        );
      }

      // Notify user about cancellation confirmation
      try {
        await pool.query(
          `INSERT INTO notifications (recipient_type, recipient_id, type, title, message, data)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            "user",
            user_id,
            "cancellation",
            "Booking cancelled",
            "Your booking has been cancelled and credits refunded.",
            JSON.stringify({ booking_id: bookingId, credit: creditRefund }),
          ],
        );
      } catch (notifyErr) {
        console.error(
          "Failed to insert user cancellation notification:",
          notifyErr.message,
        );
      }

      res.json({
        success: true,
        message: "Booking cancelled successfully",
        refunded_credit: creditRefund,
      });
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * Get all bookings for a specific listing (for partners to see registered students)
 * Returns booking details with parent and child information
 */
router.get("/listing/:listing_id", authorization, async (req, res) => {
  const { listing_id } = req.params;

  try {
    // First verify the partner owns this listing
    const listingCheck = await pool.query(
      "SELECT partner_id FROM listings WHERE listing_id = $1",
      [listing_id],
    );

    if (listingCheck.rowCount === 0) {
      return res.status(404).json({ error: "Listing not found" });
    }

    // Get bookings with user and child details
    const bookings = await pool.query(
      `SELECT 
        b.booking_id,
        b.start_date,
        b.end_date,
        b.created_at as booking_date,
        u.name as parent_name,
        u.email,
        u.phone_number as phone,
        c.name as child_name,
        c.date_of_birth as child_dob,
        c.gender as child_gender,
        s.day as schedule_day,
        s.timeslot as schedule_time,
        s.frequency
      FROM bookings b
      JOIN users u ON u.user_id = b.user_id
      LEFT JOIN children c ON c.child_id = (
        SELECT child_id FROM transactions 
        WHERE listing_id = b.listing_id AND parent_id = b.user_id 
        LIMIT 1
      )
      LEFT JOIN schedules s ON s.schedule_id = b.schedule_id
      WHERE b.listing_id = $1
      ORDER BY b.created_at DESC`,
      [listing_id],
    );

    return res.status(200).json(bookings.rows);
  } catch (error) {
    console.error(
      `ERROR in /bookings/listing/${listing_id} GET`,
      error.message,
    );
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
