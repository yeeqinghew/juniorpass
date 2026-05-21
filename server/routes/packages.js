const express = require("express");
const router = express.Router();
const pool = require("../db");
const authorization = require("../middleware/authorization");

/**
 * Helper: Calculate short-term class count (25% of full-term, rounded up)
 */
function calculateShortTermClasses(fullTermClassCount) {
  return Math.ceil(fullTermClassCount * 0.25);
}

/**
 * Helper: Validate package type combination
 * Valid:
 * ["full-term"],
 * ["full-term", "short-term"],
 * ["full-term", "short-term", "trial"],
 * ["pay-as-you-go"],
 * ["pay-as-you-go", "trial"],
 */
function isValidPackageCombination(types) {
  if (!Array.isArray(types) || types.length === 0) return false;

  // Single type
  if (types.length === 1) {
    return types[0] === "full-term" || types[0] === "pay-as-you-go";
  }

  // Two types
  if (types.length === 2) {
    return types.includes("full-term") && types.includes("short-term");
  }

  return false;
}

/**
 * Helper: Check if user can book a specific package type
 */
async function canBookPackageType(scheduleId, packageType, userId) {
  try {
    const result = await pool.query(
      `SELECT * FROM can_book_package_type($1, $2, $3, NOW())`,
      [scheduleId, packageType, userId],
    );

    return {
      canBook: result.rows[0]?.can_book || false,
      reason: result.rows[0]?.reason || "Unknown error",
    };
  } catch (error) {
    console.error("Error checking booking eligibility:", error);
    return { canBook: false, reason: "System error" };
  }
}

/**
 * GET /packages/schedule/:scheduleId/eligibility
 * Check booking eligibility for all package types
 */
router.get(
  "/schedule/:scheduleId/eligibility",
  authorization,
  async (req, res) => {
    const { scheduleId } = req.params;
    const userId = req.user;

    try {
      // Get schedule details
      const scheduleResult = await pool.query(
        `SELECT
          s.*,
          lo.outlet_id,
          o.outlet_name,
          l.listing_title
        FROM schedules s
        JOIN listingOutlets lo ON s.listing_outlet_id = lo.listing_outlet_id
        JOIN outlets o ON lo.outlet_id = o.outlet_id
        JOIN listings l ON lo.listing_id = l.listing_id
        WHERE s.schedule_id = $1`,
        [scheduleId],
      );

      if (scheduleResult.rowCount === 0) {
        return res.status(404).json({ error: "Schedule not found" });
      }

      const schedule = scheduleResult.rows[0];

      // Check eligibility for each package type
      const eligibility = {};
      for (const packageType of schedule.package_types) {
        const check = await canBookPackageType(scheduleId, packageType, userId);
        eligibility[packageType] = check;
      }

      // Calculate pricing (placeholder - adjust based on your pricing logic)
      const pricing = {};
      if (schedule.package_types.includes("pay-as-you-go")) {
        pricing["pay-as-you-go"] = {
          pricePerClass: schedule.price || 0,
          totalClasses: 1,
          totalPrice: schedule.price || 0,
        };
      }
      if (schedule.package_types.includes("full-term")) {
        const fullTermTotal =
          (schedule.price || 0) * schedule.full_term_class_count;
        pricing["full-term"] = {
          pricePerClass: schedule.price || 0,
          totalClasses: schedule.full_term_class_count,
          totalPrice: fullTermTotal,
        };
      }
      if (schedule.package_types.includes("short-term")) {
        const shortTermTotal =
          (schedule.price || 0) * schedule.short_term_class_count;
        pricing["short-term"] = {
          pricePerClass: schedule.price || 0,
          totalClasses: schedule.short_term_class_count,
          totalPrice: shortTermTotal,
        };
      }

      res.json({
        schedule: {
          schedule_id: schedule.schedule_id,
          listing_title: schedule.listing_title,
          outlet_name: schedule.outlet_name,
          day_of_week: schedule.day_of_week,
          start_time: schedule.start_time,
          end_time: schedule.end_time,
          package_types: schedule.package_types,
          is_progressive: schedule.is_progressive,
          full_term_start_date: schedule.full_term_start_date,
          full_term_class_count: schedule.full_term_class_count,
          short_term_class_count: schedule.short_term_class_count,
        },
        eligibility,
        pricing,
      });
    } catch (error) {
      console.error("Error checking eligibility:", error);
      res.status(500).json({ error: error.message });
    }
  },
);

/**
 * POST /packages/book
 * Create a booking with package type (class-count based)
 */
router.post("/book", authorization, async (req, res) => {
  const userId = req.user;
  const { schedule_id, child_id, package_type, start_date } = req.body;

  // Validation
  if (!schedule_id || !child_id || !package_type || !start_date) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  if (!["full-term", "short-term", "pay-as-you-go"].includes(package_type)) {
    return res.status(400).json({ error: "Invalid package type" });
  }

  try {
    // Verify child belongs to user
    const childCheck = await pool.query(
      "SELECT parent_id FROM children WHERE child_id = $1",
      [child_id],
    );

    if (childCheck.rowCount === 0) {
      return res.status(404).json({ error: "Child not found" });
    }

    if (childCheck.rows[0].parent_id !== userId) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    // Check booking eligibility
    const eligibility = await canBookPackageType(
      schedule_id,
      package_type,
      userId,
    );

    if (!eligibility.canBook) {
      return res.status(400).json({ error: eligibility.reason });
    }

    // Get schedule details for class counts
    const scheduleResult = await pool.query(
      `SELECT
        full_term_class_count,
        short_term_class_count,
        package_types
      FROM schedules
      WHERE schedule_id = $1`,
      [schedule_id],
    );

    const schedule = scheduleResult.rows[0];

    // Determine class counts based on package type
    let classesTotal;
    let hasUsedShortTermTrial = false;

    switch (package_type) {
      case "full-term":
        classesTotal = schedule.full_term_class_count;
        break;
      case "short-term":
        classesTotal = schedule.short_term_class_count;
        hasUsedShortTermTrial = true;
        break;
      case "pay-as-you-go":
        classesTotal = 1;
        break;
    }

    // Create booking (no end_date - package expires when classes_remaining = 0)
    const bookingResult = await pool.query(
      `INSERT INTO bookings (
        schedule_id,
        child_id,
        start_date,
        enrolled_package_type,
        classes_total,
        classes_attended,
        classes_remaining,
        has_used_short_term_trial,
        can_extend_to_full_term
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        schedule_id,
        child_id,
        start_date,
        package_type,
        classesTotal,
        0, // classes_attended
        classesTotal, // classes_remaining
        hasUsedShortTermTrial,
        package_type === "short-term", // can_extend if short-term
      ],
    );

    res.status(201).json({
      message: "Booking created successfully",
      booking: bookingResult.rows[0],
    });
  } catch (error) {
    console.error("Error creating booking:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /packages/extend/:bookingId
 * Extend short-term booking to full-term
 */
router.post("/extend/:bookingId", authorization, async (req, res) => {
  const userId = req.user;
  const { bookingId } = req.params;

  try {
    // Get booking details with child verification
    const bookingResult = await pool.query(
      `SELECT
        b.*,
        c.parent_id,
        s.full_term_class_count,
        s.short_term_class_count,
        s.package_types
      FROM bookings b
      JOIN children c ON b.child_id = c.child_id
      JOIN schedules s ON b.schedule_id = s.schedule_id
      WHERE b.booking_id = $1`,
      [bookingId],
    );

    if (bookingResult.rowCount === 0) {
      return res.status(404).json({ error: "Booking not found" });
    }

    const booking = bookingResult.rows[0];

    // Verify ownership
    if (booking.parent_id !== userId) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    // Validation checks
    if (booking.enrolled_package_type !== "short-term") {
      return res
        .status(400)
        .json({ error: "Only short-term bookings can be extended" });
    }

    if (!booking.can_extend_to_full_term) {
      return res
        .status(400)
        .json({ error: "This booking is not eligible for extension" });
    }

    if (booking.classes_remaining === 0) {
      return res
        .status(400)
        .json({ error: "Cannot extend after all classes are completed" });
    }

    if (!booking.package_types.includes("full-term")) {
      return res
        .status(400)
        .json({ error: "Full-term package not available for this schedule" });
    }

    // Check extension deadline (24h before last class)
    if (
      booking.extension_deadline &&
      new Date() > new Date(booking.extension_deadline)
    ) {
      return res.status(400).json({ error: "Extension deadline has passed" });
    }

    // Calculate remaining classes in short-term
    const shortTermRemaining = booking.classes_remaining;
    const fullTermTotal = booking.full_term_class_count;
    const additionalClasses =
      fullTermTotal - (booking.short_term_class_count - shortTermRemaining);

    // Create new full-term booking (inherits start_date, no end_date)
    const newBookingResult = await pool.query(
      `INSERT INTO bookings (
        schedule_id,
        child_id,
        start_date,
        enrolled_package_type,
        classes_total,
        classes_attended,
        classes_remaining,
        has_used_short_term_trial,
        can_extend_to_full_term,
        upgraded_from_booking_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        booking.schedule_id,
        booking.child_id,
        booking.start_date,
        "full-term",
        fullTermTotal,
        booking.classes_attended, // Carry over attended classes
        fullTermTotal - booking.classes_attended,
        true, // Keep short-term trial flag
        false, // Cannot extend again
        bookingId, // Reference to original booking
      ],
    );

    // Mark original booking as upgraded
    await pool.query(
      `UPDATE bookings
      SET can_extend_to_full_term = false
      WHERE booking_id = $1`,
      [bookingId],
    );

    // Calculate pricing (short-term cost already paid)
    const shortTermPrice =
      booking.short_term_class_count * (booking.price || 0);
    const fullTermPrice = fullTermTotal * (booking.price || 0);
    const additionalCost = fullTermPrice - shortTermPrice;

    res.json({
      message: "Booking extended to full-term successfully",
      original_booking: booking,
      new_booking: newBookingResult.rows[0],
      pricing: {
        short_term_paid: shortTermPrice,
        full_term_total: fullTermPrice,
        additional_cost: additionalCost,
        classes_added: additionalClasses,
      },
    });
  } catch (error) {
    console.error("Error extending booking:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /packages/booking/:bookingId/extension-status
 * Get extension eligibility and pricing for a booking
 */
router.get(
  "/booking/:bookingId/extension-status",
  authorization,
  async (req, res) => {
    const userId = req.user;
    const { bookingId } = req.params;

    try {
      const result = await pool.query(
        `SELECT
          b.*,
          c.parent_id,
          s.full_term_class_count,
          s.short_term_class_count,
          s.package_types,
          s.price
        FROM bookings b
        JOIN children c ON b.child_id = c.child_id
        JOIN schedules s ON b.schedule_id = s.schedule_id
        WHERE b.booking_id = $1`,
        [bookingId],
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ error: "Booking not found" });
      }

      const booking = result.rows[0];

      if (booking.parent_id !== userId) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      // Calculate extension details
      const canExtend =
        booking.enrolled_package_type === "short-term" &&
        booking.can_extend_to_full_term &&
        booking.classes_remaining > 0 &&
        booking.package_types.includes("full-term");

      const shortTermPrice =
        booking.short_term_class_count * (booking.price || 0);
      const fullTermPrice =
        booking.full_term_class_count * (booking.price || 0);

      res.json({
        booking_id: bookingId,
        enrolled_package_type: booking.enrolled_package_type,
        can_extend: canExtend,
        classes_remaining: booking.classes_remaining,
        classes_total: booking.classes_total,
        extension_deadline: booking.extension_deadline,
        pricing: {
          short_term_paid: shortTermPrice,
          full_term_total: fullTermPrice,
          extension_cost: fullTermPrice - shortTermPrice,
          classes_to_add:
            booking.full_term_class_count - booking.short_term_class_count,
        },
      });
    } catch (error) {
      console.error("Error getting extension status:", error);
      res.status(500).json({ error: error.message });
    }
  },
);

module.exports = router;
