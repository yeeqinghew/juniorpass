const express = require("express");
const router = express.Router();
const pool = require("../db");
const redisClient = require("../utils/redisClient");
const { AUTH_ROLES } = require("../constants/auth");
const {
  getPackageClassCount,
  getPackageCreditCost,
} = require("../utils/packageCredits");
const authorization = require("../middleware/authorization");
const userAuthorization = authorization.forRole(AUTH_ROLES.USER);
const partnerAuthorization = authorization.forRole(AUTH_ROLES.PARTNER);
const {
  buildOccurrenceWindows,
  findChildBookingConflicts,
} = require("../utils/bookingConflicts");
const {
  bookingPolicyFromListing,
  bookingPolicyFromSnapshot,
  calculateCancellation,
  normalizeBookingPolicy,
} = require("../utils/bookingPolicy");
const {
  sendBookingConfirmation,
} = require("../services/customerDocuments.service");
const {
  getSafetyWaiver,
  isCurrentSafetyWaiverAccepted,
} = require("../utils/safetyWaiver");
const { getPromotionPrice } = require("../services/promotionPricing.service");
const { calculatePackageUpgrade } = require("../utils/packageUpgrade");
const {
  applyScheduleExceptions,
} = require("../services/classSessionManagement.service");
const {
  recordAuditEvent,
  requestAuditId,
} = require("../services/auditLog.service");

router.get("/waiver", userAuthorization, (_req, res) => {
  res.status(200).json({ waiver: getSafetyWaiver() });
});

router.post("/", userAuthorization, async (req, res) => {
  const {
    listing_id,
    schedule_id,
    start_date,
    end_date,
    child_id,
    package_type,
    acknowledge_same_day_booking: acknowledgeSameDayBooking = false,
    waiver_accepted: waiverAccepted = false,
    waiver_version: waiverVersion,
    promotion_id: expectedPromotionId,
  } = req.body;

  try {
    // Validate request body
    if (!listing_id || !start_date || !end_date || !child_id) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    if (
      !isCurrentSafetyWaiverAccepted({
        accepted: waiverAccepted,
        version: waiverVersion,
      })
    ) {
      return res.status(400).json({
        code: "SAFETY_WAIVER_REQUIRED",
        error:
          "Please review and accept the current child safety acknowledgement",
        waiver: getSafetyWaiver(),
      });
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
    const user = await pool.query(
      `SELECT user_id,
              CASE
                WHEN credit_expires_at IS NOT NULL AND credit_expires_at <= NOW()
                  THEN 0
                ELSE credit
              END AS credit
       FROM users
       WHERE user_id = $1`,
      [user_id],
    );

    if (listing.rows.length === 0) {
      return res.status(404).json({ error: "Listing not found" });
    }

    if (user.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const currentBookingPolicy = bookingPolicyFromListing(listing.rows[0]);
    if (req.body.acknowledged_policy) {
      const acknowledgedPolicy = normalizeBookingPolicy(
        req.body.acknowledged_policy,
      );
      if (
        !acknowledgedPolicy ||
        JSON.stringify(acknowledgedPolicy) !==
          JSON.stringify(currentBookingPolicy)
      ) {
        return res.status(409).json({
          code: "BOOKING_POLICY_CHANGED",
          error:
            "The booking policy changed while you were booking. Please review the updated terms and try again.",
        });
      }
    }

    // Optional: validate child belongs to this parent if provided
    if (child_id) {
      const child = await pool.query(
        `SELECT child_id
         FROM children
         WHERE child_id = $1
           AND parent_id = $2
           AND NULLIF(BTRIM(emergency_contact_name), '') IS NOT NULL
           AND NULLIF(BTRIM(emergency_contact_relationship), '') IS NOT NULL
           AND NULLIF(BTRIM(emergency_contact_phone), '') IS NOT NULL
           AND jsonb_typeof(authorized_pickups) = 'array'
           AND jsonb_array_length(authorized_pickups) > 0`,
        [child_id, user_id],
      );
      if (child.rowCount === 0) {
        return res.status(400).json({
          code: "CHILD_SAFETY_PROFILE_INCOMPLETE",
          error:
            "Complete this child's emergency contact and authorised pickup information before booking",
        });
      }
    }

    // Progressive programmes share one enrolment capacity across every required
    // time slot. Non-progressive classes keep per-time-slot capacity.
    const schedule = await pool.query(
      `SELECT s.slots,
              sg.capacity,
              sg.price_payg,
              sg.price_fullterm, 
              sg.price_shortterm,
              sg.schedule_group_id,
              sg.package_types, 
              sg.full_term_class_count, 
              sg.short_term_class_count,
              sg.frequency,
              sg.is_progressive,
              sg.pricing_dollars_per_credit
       FROM schedules s
       JOIN schedule_groups sg 
       ON s.schedule_group_id = sg.schedule_group_id
       WHERE s.schedule_id = $1`,
      [schedule_id],
    );

    if (schedule.rows.length === 0) {
      return res.status(404).json({ error: "Schedule not found" });
    }

    const scheduleGroup = schedule.rows[0];
    const isProgressive = scheduleGroup.is_progressive === true;
    const maxSlots = Number(
      isProgressive ? scheduleGroup.capacity : scheduleGroup.slots,
    );
    const schedule_group_id = scheduleGroup.schedule_group_id;

    if (!Number.isInteger(maxSlots) || maxSlots < 1) {
      return res.status(400).json({ error: "Class capacity is unavailable" });
    }

    // Determine package type
    const enrolledPackageType = package_type || "pay-as-you-go";

    // Validate package
    let availablePackageTypes = scheduleGroup.package_types || [];

    if (typeof availablePackageTypes === "string") {
      availablePackageTypes = availablePackageTypes
        .replace(/[{}]/g, "")
        .split(",")
        .map((type) => type.trim())
        .filter(Boolean);
    }

    if (!Array.isArray(availablePackageTypes)) {
      availablePackageTypes = [];
    }

    if (!availablePackageTypes.includes(enrolledPackageType)) {
      return res.status(400).json({ error: "Package type is not available" });
    }

    // Calculate credits + number of classes using the same fallbacks as the UI.
    const classes_total = getPackageClassCount(
      scheduleGroup,
      enrolledPackageType,
    );
    // Use the rate captured when this package price was saved.
    const dollarsPerCredit = Number(scheduleGroup.pricing_dollars_per_credit);
    const standardCreditCost = getPackageCreditCost(
      scheduleGroup,
      enrolledPackageType,
      dollarsPerCredit,
    );

    if (!standardCreditCost || !Number.isInteger(classes_total) || classes_total < 1) {
      return res.status(400).json({
        error: "This package's credit cost is unavailable",
      });
    }

    let occurrenceWindows = buildOccurrenceWindows({
      startDate: start_date,
      endDate: end_date,
      classCount: classes_total,
      frequency: scheduleGroup.frequency,
    });

    const existingBookings = await pool.query(
      isProgressive
        ? `SELECT COUNT(*) AS count
           FROM bookings
           WHERE schedule_group_id = $1
             AND status = 'confirmed'`
        : `SELECT COUNT(*) AS count
           FROM bookings
           WHERE schedule_id = $1
             AND DATE(start_date) = DATE($2::timestamp)
             AND status = 'confirmed'`,
      isProgressive
        ? [schedule_group_id]
        : [schedule_id, start_date],
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

      // Serialize bookings for one child so concurrent requests cannot bypass
      // the conflict check.
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        child_id,
      ]);
      const bookingConflicts = await findChildBookingConflicts(
        client,
        child_id,
        occurrenceWindows,
      );
      const overlappingBooking = bookingConflicts.find(
        (booking) => booking.is_overlap,
      );
      if (overlappingBooking) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          error: "This child already has a class at that time",
          code: "BOOKING_TIME_CONFLICT",
          conflict: overlappingBooking,
        });
      }
      if (bookingConflicts.length > 0 && !acknowledgeSameDayBooking) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          error: "This child already has another class on the same day",
          code: "SAME_DAY_BOOKING_WARNING",
          conflicts: bookingConflicts,
        });
      }

      // Lock the capacity owner so simultaneous requests cannot both claim the
      // final place.
      if (isProgressive) {
        await client.query(
          "SELECT schedule_group_id FROM schedule_groups WHERE schedule_group_id = $1 FOR UPDATE",
          [schedule_group_id],
        );
        // Session changes belong to a specific time slot. Lock it as well so
        // an enrolment cannot race a partner cancellation or reschedule.
        await client.query(
          "SELECT schedule_id FROM schedules WHERE schedule_id = $1 FOR UPDATE",
          [schedule_id],
        );
      } else {
        await client.query(
          "SELECT schedule_id FROM schedules WHERE schedule_id = $1 FOR UPDATE",
          [schedule_id],
        );
      }
      const currentCapacity = await client.query(
        isProgressive
          ? `SELECT COUNT(*)::integer AS count
             FROM bookings
             WHERE schedule_group_id = $1
               AND status = 'confirmed'`
          : `SELECT COUNT(*)::integer AS count
             FROM bookings
             WHERE schedule_id = $1
               AND DATE(start_date) = DATE($2::timestamp)
               AND status = 'confirmed'`,
        isProgressive
          ? [schedule_group_id]
          : [schedule_id, start_date],
      );
      const currentBookedCount = currentCapacity.rows[0].count;
      if (currentBookedCount >= maxSlots) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          error: "This timeslot is fully booked",
          booked_count: currentBookedCount,
          max_slots: maxSlots,
        });
      }

      occurrenceWindows = await applyScheduleExceptions(
        client,
        schedule_id,
        occurrenceWindows,
      );

      // Lock and re-evaluate the promotion inside the booking transaction.
      // This makes the redemption limit and the charged price authoritative
      // even when several parents book the final promotional places together.
      const promotionPricing = await getPromotionPrice(client, {
        userId: user_id,
        scheduleGroupId: schedule_group_id,
        packageType: enrolledPackageType,
        standardCredits: standardCreditCost,
        lock: true,
      });
      const creditCost = promotionPricing.chargedCredits;
      const partnerCreditedCredits = promotionPricing.partnerCreditedCredits;
      if (
        expectedPromotionId &&
        promotionPricing.promotion?.promotion_id !== expectedPromotionId
      ) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          code: "PROMOTION_UNAVAILABLE",
          error: "This promotion has just ended or reached its redemption limit. Please review the updated price.",
        });
      }

      // Deduct credits only if the balance still covers the package. This
      // prevents concurrent booking requests from taking the balance negative.
      const debitResult = await client.query(
        `UPDATE users
         SET credit = credit - $1
         WHERE user_id = $2
           AND credit >= $1
           AND (credit_expires_at IS NULL OR credit_expires_at > NOW())
         RETURNING credit`,
        [creditCost, user_id],
      );

      if (debitResult.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Insufficient credits" });
      }

      // Credit partner balance
      await client.query(
        "UPDATE partners SET credit = credit + $1 WHERE partner_id = $2",
        [partnerCreditedCredits, listing.rows[0].partner_id],
      );

      // Capture the policy now so later listing edits cannot alter this booking's terms.
      const policySnapshot = currentBookingPolicy;

      // Create booking record with package info
      const newBooking = await client.query(
        `
        INSERT INTO bookings (
          listing_id, schedule_id, user_id, child_id, schedule_group_id,
          start_date, end_date, enrolled_package_type, classes_total,
          dollars_per_credit, charged_credits, standard_credits,
          partner_credited_credits, promotion_id, policy_snapshot,
          waiver_snapshot, waiver_acknowledged_at, waiver_acknowledged_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW(), $17)
        RETURNING *
      `,
        [
          listing_id,
          schedule_id,
          user_id,
          child_id,
          schedule_group_id,
          start_date,
          end_date,
          enrolledPackageType,
          classes_total,
          dollarsPerCredit,
          creditCost,
          standardCreditCost,
          partnerCreditedCredits,
          promotionPricing.promotion?.promotion_id || null,
          JSON.stringify(policySnapshot),
          JSON.stringify(getSafetyWaiver()),
          user_id,
        ],
      );

      const booking_id = newBooking.rows[0].booking_id;

      if (promotionPricing.promotion) {
        await client.query(
          `INSERT INTO promotion_redemptions (
             promotion_id, user_id, booking_id, charged_credits, standard_credits
           ) VALUES ($1, $2, $3, $4, $5)`,
          [
            promotionPricing.promotion.promotion_id,
            user_id,
            booking_id,
            creditCost,
            standardCreditCost,
          ],
        );
      }

      // Generate class occurrences based on frequency
      console.log(
        `📅 Generating ${classes_total} class occurrences`,
      );

      // Create individual class occurrences
      for (const [index, occurrence] of occurrenceWindows.entries()) {
        await client.query(
          `INSERT INTO class_occurrences (
            booking_id, scheduled_date, scheduled_end_date, occurrence_number, status
          )
          VALUES ($1, $2, $3, $4, $5)`,
          [
            booking_id,
            occurrence.start_at,
            occurrence.end_at,
            index + 1,
            occurrence.status,
          ],
        );
      }

      console.log(
        `✅ Created ${classes_total} class occurrences for booking ${booking_id}`,
      );

      // Record parent's debit transaction if child context is provided
      if (child_id) {
        await client.query(
          `INSERT INTO transactions (parent_id, child_id, listing_id, used_credit, transaction_type)
           VALUES ($1, $2, $3, $4, $5)`,
          [user_id, child_id, listing_id, creditCost, "DEBIT"],
        );
      }

      const balanceAfterBooking = Number(debitResult.rows[0].credit);
      await recordAuditEvent(client, {
        actorType: AUTH_ROLES.USER,
        actorId: req.user,
        action: "BOOKING_CREDITS_DEBITED",
        entityType: "credit",
        entityId: user_id,
        before: { balance: balanceAfterBooking + Number(creditCost) },
        after: { balance: balanceAfterBooking },
        metadata: {
          booking_id,
          listing_id,
          credit_delta: -Number(creditCost),
        },
        requestId: requestAuditId(req),
      });

      await client.query("COMMIT");

      // Booking history changes the partner edit permissions exposed by the
      // listing endpoint, so do not leave a pre-booking response cached.
      try {
        await Promise.all([
          redisClient.del(`/listings/${listing_id}`),
          redisClient.del("/listings"),
        ]);
      } catch (cacheError) {
        console.error(
          `Booking ${booking_id} succeeded but listing cache invalidation failed:`,
          cacheError.message,
        );
      }

      try {
        await sendBookingConfirmation({
          bookingId: booking_id,
          automatic: true,
        });
      } catch (emailError) {
        console.error(
          `Booking ${booking_id} succeeded but its confirmation email failed:`,
          emailError.message,
        );
      }

      // Insert partner notification for new booking
      try {
        await pool.query(
          `INSERT INTO notifications (recipient_type, recipient_id, type, title, message, data)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            AUTH_ROLES.PARTNER,
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
            AUTH_ROLES.USER,
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
        updated_credit: Number(debitResult.rows[0].credit),
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

    // Get capacity from the selected schedule time slot.
    const schedule = await pool.query(
      `SELECT s.schedule_id, s.slots, s.day, s.start_time, s.end_time,
              sg.frequency, sg.is_progressive,
              l.listing_id, l.listing_title
       FROM schedules s
       JOIN schedule_groups sg ON s.schedule_group_id = sg.schedule_group_id
       JOIN listingOutlets lo ON sg.listing_outlet_id = lo.listing_outlet_id
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
       AND DATE(start_date) = DATE($2::timestamp)
       AND status = 'confirmed'`,
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
      timeslot: [schedule.rows[0].start_time, schedule.rows[0].end_time],
      frequency: schedule.rows[0].frequency,
      start_date,
      end_date,
      max_slots: maxSlots,
      booked_count: bookedCount,
      available_spots: availableSpots,
      is_full: isFull,
      is_progressive: schedule.rows[0].is_progressive,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

// Upgrade a confirmed short-term booking to its full-term package. The booking,
// wallet, partner balance, occurrences and transaction record change together.
router.post("/:bookingId/extend", userAuthorization, async (req, res) => {
  const { bookingId } = req.params;
  const userId = req.user;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const lockedBooking = await client.query(
      `SELECT *
       FROM bookings
       WHERE booking_id = $1
         AND user_id = $2
       FOR UPDATE`,
      [bookingId, userId],
    );

    if (lockedBooking.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Booking not found" });
    }

    const booking = lockedBooking.rows[0];
    if (booking.enrolled_package_type === "full-term" && booking.upgraded_at) {
      await client.query("COMMIT");
      return res.status(200).json({
        success: true,
        already_extended: true,
        booking,
      });
    }

    if (booking.status !== "confirmed" || booking.enrolled_package_type !== "short-term") {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: "Only confirmed short-term bookings can be extended",
      });
    }

    const detailsResult = await client.query(
      `SELECT sg.*, l.partner_id, l.listing_title,
              p.credit AS partner_credit,
              COALESCE(MAX(co.scheduled_end_date), b.end_date) AS extension_deadline
       FROM bookings b
       JOIN schedule_groups sg ON sg.schedule_group_id = b.schedule_group_id
       JOIN listings l ON l.listing_id = b.listing_id
       JOIN partners p ON p.partner_id = l.partner_id
       LEFT JOIN class_occurrences co ON co.booking_id = b.booking_id
       WHERE b.booking_id = $1
       GROUP BY sg.schedule_group_id, l.partner_id, l.listing_title,
                p.partner_id, b.end_date`,
      [bookingId],
    );
    const details = detailsResult.rows[0];

    if (
      !details ||
      !Array.isArray(details.package_types) ||
      !details.package_types.includes("full-term")
    ) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "A full-term package is not available" });
    }

    if (new Date(details.extension_deadline) <= new Date()) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "The extension period has ended" });
    }

    const fullTermCredits = getPackageCreditCost(
      details,
      "full-term",
      booking.dollars_per_credit || details.pricing_dollars_per_credit,
    );
    const upgrade = calculatePackageUpgrade({
      fullTermCredits,
      chargedCredits: booking.charged_credits,
      partnerCreditedCredits: booking.partner_credited_credits,
      fullTermClasses: details.full_term_class_count,
      shortTermClasses: booking.classes_total,
    });

    if (!upgrade) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "This package cannot be extended" });
    }

    const allWindows = buildOccurrenceWindows({
      startDate: booking.start_date,
      endDate: booking.end_date,
      classCount: upgrade.fullTermClasses,
      frequency: details.frequency,
    });
    const additionalWindows = await applyScheduleExceptions(
      client,
      booking.schedule_id,
      allWindows.slice(Number(booking.classes_total)),
    );
    const conflicts = await findChildBookingConflicts(
      client,
      booking.child_id,
      additionalWindows.filter((window) => window.status !== "cancelled"),
    );
    const overlap = conflicts.find((conflict) => conflict.is_overlap);
    if (overlap) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        code: "BOOKING_TIME_CONFLICT",
        error: "The full-term sessions conflict with another class for this child",
        conflict: overlap,
      });
    }

    const walletResult = await client.query(
      `UPDATE users
       SET credit = credit - $1
       WHERE user_id = $2
         AND credit >= $1
         AND (credit_expires_at IS NULL OR credit_expires_at > NOW())
       RETURNING credit`,
      [upgrade.upgradeCredits, userId],
    );
    if (walletResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        code: "INSUFFICIENT_CREDITS",
        error: `You need ${upgrade.upgradeCredits} credits to extend this package`,
        required_credits: upgrade.upgradeCredits,
      });
    }

    await client.query(
      `UPDATE partners
       SET credit = credit + $1
       WHERE partner_id = $2`,
      [upgrade.partnerUpgradeCredits, details.partner_id],
    );

    const updatedBooking = await client.query(
      `UPDATE bookings
       SET enrolled_package_type = 'full-term',
           classes_total = $1,
           charged_credits = $2,
           standard_credits = $2,
           partner_credited_credits = $2,
           can_extend_to_full_term = false,
           upgraded_at = NOW(),
           upgrade_credits = $3
       WHERE booking_id = $4
       RETURNING *`,
      [upgrade.fullTermClasses, upgrade.fullTermCredits, upgrade.upgradeCredits, bookingId],
    );

    for (const [index, occurrence] of additionalWindows.entries()) {
      await client.query(
        `INSERT INTO class_occurrences (
           booking_id, scheduled_date, scheduled_end_date, occurrence_number, status
         ) VALUES ($1, $2, $3, $4, $5)`,
        [
          bookingId,
          occurrence.start_at,
          occurrence.end_at,
          Number(booking.classes_total) + index + 1,
          occurrence.status,
        ],
      );
    }

    await client.query(
      `INSERT INTO transactions (parent_id, child_id, listing_id, used_credit, transaction_type)
       VALUES ($1, $2, $3, $4, 'DEBIT')`,
      [userId, booking.child_id, booking.listing_id, upgrade.upgradeCredits],
    );

    const balanceAfter = Number(walletResult.rows[0].credit);
    await recordAuditEvent(client, {
      actorType: AUTH_ROLES.USER,
      actorId: userId,
      action: "BOOKING_PACKAGE_EXTENDED",
      entityType: "booking",
      entityId: bookingId,
      before: {
        package_type: "short-term",
        charged_credits: Number(booking.charged_credits),
        classes_total: Number(booking.classes_total),
        balance: balanceAfter + upgrade.upgradeCredits,
      },
      after: {
        package_type: "full-term",
        charged_credits: upgrade.fullTermCredits,
        classes_total: upgrade.fullTermClasses,
        balance: balanceAfter,
      },
      metadata: { credit_delta: -upgrade.upgradeCredits },
      requestId: requestAuditId(req),
    });

    await client.query("COMMIT");

    try {
      await pool.query(
        `INSERT INTO notifications (recipient_type, recipient_id, type, title, message, data)
         VALUES ($1, $2, 'booking', $3, $4, $5)`,
        [
          AUTH_ROLES.PARTNER,
          details.partner_id,
          `Package extended: ${details.listing_title}`,
          "A short-term booking has been extended to full-term.",
          JSON.stringify({ booking_id: bookingId, credits: upgrade.upgradeCredits }),
        ],
      );
      await Promise.all([
        redisClient.del(`/listings/${booking.listing_id}`),
        redisClient.del("/listings"),
      ]);
    } catch (sideEffectError) {
      console.error(`Booking ${bookingId} extended but follow-up failed:`, sideEffectError.message);
    }

    return res.status(200).json({
      success: true,
      booking: updatedBooking.rows[0],
      charged_credits: upgrade.upgradeCredits,
      balance: balanceAfter,
      classes_added: upgrade.classesToAdd,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error extending booking:", error);
    return res.status(500).json({ error: "Unable to extend this package" });
  } finally {
    client.release();
  }
});

// GET all bookings for a user
router.get("/user", userAuthorization, async (req, res) => {
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
        o.address as outlet_address,
        o.nearest_mrt,
        sg.is_progressive,
        sg.package_types,
        sg.full_term_class_count,
        sg.pricing_dollars_per_credit,
        sg.price_fullterm,
        COALESCE(MAX(co.scheduled_end_date), b.end_date) AS extension_deadline,
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
      JOIN schedules s ON b.schedule_id = s.schedule_id
      JOIN listingOutlets lo ON s.listing_outlet_id = lo.listing_outlet_id
      JOIN outlets o ON lo.outlet_id = o.outlet_id
      JOIN schedule_groups sg ON s.schedule_group_id = sg.schedule_group_id
      LEFT JOIN class_occurrences co ON co.booking_id = b.booking_id
      WHERE b.user_id = $1
      GROUP BY b.booking_id, l.listing_id, p.partner_id, o.outlet_id,
               sg.schedule_group_id
      ORDER BY b.start_date DESC
    `,
      [user_id],
    );

    res.json({
      success: true,
      bookings: bookings.rows.map((booking) => {
        const fullTermCredits = getPackageCreditCost(
          booking,
          "full-term",
          booking.dollars_per_credit || booking.pricing_dollars_per_credit,
        );
        const upgrade = calculatePackageUpgrade({
          fullTermCredits,
          chargedCredits: booking.charged_credits,
          partnerCreditedCredits: booking.partner_credited_credits,
          fullTermClasses: booking.full_term_class_count,
          shortTermClasses: booking.classes_total,
        });
        const canExtend =
          booking.status === "confirmed" &&
          booking.enrolled_package_type === "short-term" &&
          Array.isArray(booking.package_types) &&
          booking.package_types.includes("full-term") &&
          new Date(booking.extension_deadline) > new Date() &&
          Boolean(upgrade);

        return {
          ...booking,
          can_extend_to_full_term: canExtend,
          extension_credits: canExtend ? upgrade.upgradeCredits : null,
          extension_classes: canExtend ? upgrade.classesToAdd : null,
        };
      }),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

// GET all class occurrences for a user (for calendar view)
router.get("/user/occurrences", userAuthorization, async (req, res) => {
  try {
    const user_id = req.user;
    const occurrences = await pool.query(
      `
      SELECT
        co.*,
        b.booking_id,
        b.listing_id,
        b.enrolled_package_type,
        b.classes_total,
        b.policy_snapshot,
        l.listing_title,
        l.images,
        p.partner_name,
        p.picture as partner_picture,

        sg.is_progressive,
        sg.price_payg,
        sg.price_fullterm,
        sg.price_shortterm,
        (
          SELECT child_id
          FROM transactions
          WHERE parent_id = b.user_id
            AND listing_id = b.listing_id
            AND transaction_type = 'DEBIT'
            AND created_at >= b.created_at
          ORDER BY created_at ASC
          LIMIT 1
        ) as child_id,
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
        ,(
          SELECT gender
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
        ) as child_gender
      FROM class_occurrences co
      JOIN bookings b ON co.booking_id = b.booking_id
      JOIN listings l ON b.listing_id = l.listing_id
      JOIN partners p ON l.partner_id = p.partner_id
      JOIN schedules s ON b.schedule_id = s.schedule_id
      JOIN schedule_groups sg ON s.schedule_group_id = sg.schedule_group_id
      WHERE b.user_id = $1
      ORDER BY co.scheduled_date ASC
    `,
      [user_id],
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

// GET all bookings for a partner
router.get("/partner/:partnerId", partnerAuthorization, async (req, res) => {
  try {
    const { partnerId } = req.params;
    if (req.user !== partnerId) {
      return res.status(403).json({ error: "Not authorized for these bookings" });
    }

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
router.delete("/:bookingId", userAuthorization, async (req, res) => {
  const { bookingId } = req.params;
  const user_id = req.user;
  const cancellationReason = String(
    req.body?.reason || "Cancelled by parent",
  )
    .trim()
    .slice(0, 1000);
  let client;

  try {
    client = await pool.connect();
    await client.query("BEGIN");

    // Lock the booking so repeated/concurrent cancellation requests can only
    // refund it once.
    const booking = await client.query(
      `
      SELECT
        b.*,
        b.start_date AT TIME ZONE 'Asia/Singapore' AS booking_start_utc,
        l.partner_id,
        l.listing_title,
        sg.is_progressive,
        COALESCE(
          b.charged_credits,
          (
            SELECT used_credit
            FROM transactions
            WHERE parent_id = b.user_id
              AND listing_id = b.listing_id
              AND transaction_type = 'DEBIT'
              AND created_at >= b.created_at
            ORDER BY created_at ASC
            LIMIT 1
          ),
          0
        ) AS actual_credit_charged
      FROM bookings b
      JOIN listings l ON b.listing_id = l.listing_id
      LEFT JOIN schedules s ON b.schedule_id = s.schedule_id
      LEFT JOIN schedule_groups sg ON s.schedule_group_id = sg.schedule_group_id
      WHERE b.booking_id = $1 AND b.user_id = $2
      FOR UPDATE OF b
    `,
      [bookingId, user_id],
    );

    if (booking.rows.length === 0) {
      await client.query("ROLLBACK");
      return res
        .status(404)
        .json({ error: "Booking not found or unauthorized" });
    }

    const bookingData = booking.rows[0];

    if (bookingData.status === "cancelled") {
      await client.query("COMMIT");
      return res.json({
        success: true,
        already_cancelled: true,
        message: "Booking was already cancelled",
        refunded_credit: Number(bookingData.refunded_credits || 0),
        refund_percentage: Number(bookingData.refund_percentage || 0),
      });
    }

    const classStart = new Date(bookingData.booking_start_utc);
    const now = new Date();
    if (classStart <= now) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: bookingData.is_progressive
          ? "This programme can no longer be cancelled because it has already started"
          : "This class can no longer be cancelled because it has already started",
      });
    }

    const policy = bookingPolicyFromSnapshot(bookingData.policy_snapshot);
    const cancellation = calculateCancellation({
      policy,
      chargedCredits: bookingData.actual_credit_charged,
      classStart,
      now,
    });
    const creditRefund = cancellation.refund_credits;

    if (creditRefund > 0) {
      const refundedWallet = await client.query(
        `UPDATE users
         SET credit = CASE
               WHEN credit_expires_at IS NOT NULL AND credit_expires_at <= NOW()
                 THEN $1
               ELSE credit + $1
             END,
             credit_expires_at = CASE
               WHEN credit_expires_at IS NULL OR credit_expires_at <= NOW()
                 THEN NOW() + INTERVAL '90 days'
               ELSE credit_expires_at
             END
         WHERE user_id = $2
         RETURNING credit`,
        [creditRefund, user_id],
      );

      await client.query(
        "UPDATE partners SET credit = credit - $1 WHERE partner_id = $2",
        [
          Math.floor(
            (Number(
              bookingData.partner_credited_credits || bookingData.charged_credits || 0,
            ) * cancellation.refund_percent) /
              100,
          ),
          bookingData.partner_id,
        ],
      );

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

      const balanceAfterRefund = Number(refundedWallet.rows[0].credit);
      await recordAuditEvent(client, {
        actorType: AUTH_ROLES.USER,
        actorId: req.user,
        action: "BOOKING_CREDITS_REFUNDED",
        entityType: "credit",
        entityId: user_id,
        before: { balance: balanceAfterRefund - Number(creditRefund) },
        after: { balance: balanceAfterRefund },
        metadata: {
          booking_id: bookingId,
          listing_id: bookingData.listing_id,
          credit_delta: Number(creditRefund),
          refund_percentage: cancellation.refund_percent,
        },
        requestId: requestAuditId(req),
      });
    }

    await client.query(
      `UPDATE bookings
       SET status = 'cancelled',
           cancelled_at = NOW(),
           cancelled_by = $2,
           cancellation_reason = $3,
           refunded_credits = $4,
           refund_percentage = $5
       WHERE booking_id = $1`,
      [
        bookingId,
        AUTH_ROLES.USER,
        cancellationReason,
        creditRefund,
        cancellation.refund_percent,
      ],
    );

    await client.query(
      `UPDATE class_occurrences
       SET status = 'cancelled',
           cancellation_reason = $2,
           cancelled_by = $3
       WHERE booking_id = $1
         AND status IN ('scheduled', 'rescheduled')`,
      [bookingId, cancellationReason, AUTH_ROLES.USER],
    );

    await client.query("COMMIT");

    const notificationData = JSON.stringify({
      user_id,
      booking_id: bookingId,
      listing_id: bookingData.listing_id,
      credit: creditRefund,
      refund_percentage: cancellation.refund_percent,
    });
    const refundMessage =
      creditRefund > 0
        ? `${creditRefund} credits were refunded.`
        : "No credits were refundable under the booking policy.";

    try {
      await Promise.all([
        pool.query(
          `INSERT INTO notifications (recipient_type, recipient_id, type, title, message, data)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            AUTH_ROLES.PARTNER,
            bookingData.partner_id,
            "cancellation",
            "Booking cancelled: " + bookingData.listing_title,
            refundMessage,
            notificationData,
          ],
        ),
        pool.query(
          `INSERT INTO notifications (recipient_type, recipient_id, type, title, message, data)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            AUTH_ROLES.USER,
            user_id,
            "cancellation",
            "Booking cancelled",
            refundMessage,
            notificationData,
          ],
        ),
      ]);
    } catch (notifyErr) {
      console.error("Failed to insert cancellation notification:", notifyErr.message);
    }

    return res.json({
      success: true,
      message: "Booking cancelled successfully",
      refunded_credit: creditRefund,
      refund_percentage: cancellation.refund_percent,
      cancellation_deadline: cancellation.cancellation_deadline.toISOString(),
    });
  } catch (error) {
    await client?.query("ROLLBACK").catch(() => {});
    console.error("❌ Cancel booking error:", error.message);
    res.status(500).json({
      error: "Server error",
    });
  } finally {
    client?.release();
  }
});

/**
 * Get all bookings for a specific listing (for partners to see registered students)
 * Returns booking details with parent and child information
 */
router.get(
  "/listing/:listing_id",
  partnerAuthorization,
  async (req, res) => {
  const { listing_id } = req.params;

  try {
    // First verify the partner owns this listing
    const listingCheck = await pool.query(
      "SELECT partner_id FROM listings WHERE listing_id = $1 AND partner_id = $2",
      [listing_id, req.user],
    );

    if (listingCheck.rowCount === 0) {
      return res.status(404).json({ error: "Listing not found or not owned by this partner" });
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
        CASE WHEN safety_access.can_view THEN c.special_notes END as child_safety_notes,
        CASE WHEN safety_access.can_view THEN c.emergency_contact_name END as emergency_contact_name,
        CASE WHEN safety_access.can_view THEN c.emergency_contact_relationship END as emergency_contact_relationship,
        CASE WHEN safety_access.can_view THEN c.emergency_contact_phone END as emergency_contact_phone,
        CASE WHEN safety_access.can_view THEN c.authorized_pickups END as authorized_pickups,
        CASE WHEN safety_access.can_view THEN c.safety_updated_at END as safety_updated_at,
        CASE WHEN safety_access.can_view THEN b.waiver_acknowledged_at END as waiver_acknowledged_at,
        s.day as schedule_day
      FROM bookings b
      JOIN users u ON u.user_id = b.user_id
      LEFT JOIN children c ON c.child_id = b.child_id
      LEFT JOIN schedules s ON s.schedule_id = b.schedule_id
      LEFT JOIN LATERAL (
        SELECT EXISTS (
          SELECT 1
          FROM class_occurrences co
          WHERE co.booking_id = b.booking_id
            AND co.status IN ('scheduled', 'rescheduled')
            AND co.scheduled_end_date >= NOW()
        ) AS can_view
      ) safety_access ON TRUE
      WHERE b.listing_id = $1
        AND b.status = 'confirmed'
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
  },
);

module.exports = router;
