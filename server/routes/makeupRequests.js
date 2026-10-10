const express = require("express");
const router = express.Router();
const pool = require("../db");
const authorization = require("../middleware/authorization");
const { AUTH_ROLES } = require("../constants/auth");
const { findChildBookingConflicts } = require("../utils/bookingConflicts");

const userAuthorization = authorization.forRole(AUTH_ROLES.USER);
const partnerAuthorization = authorization.forRole(AUTH_ROLES.PARTNER);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const normalizeText = (value, maxLength = 1000) => {
  if (value == null) return null;
  const normalized = String(value).trim();
  return normalized ? normalized.slice(0, maxLength) : null;
};

const singaporeDate = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

const normalizePreferredDates = (value) => {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 3) return null;
  const uniqueDates = [...new Set(value.map((date) => String(date).trim()))];
  if (
    uniqueDates.some(
      (date) => !DATE_PATTERN.test(date) || date < singaporeDate(),
    )
  ) {
    return null;
  }
  return uniqueDates;
};

const insertNotification = async (
  db,
  { recipientType, recipientId, type, title, message, data },
) => {
  await db.query(
    `INSERT INTO notifications
       (recipient_type, recipient_id, type, title, message, data)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [recipientType, recipientId, type, title, message, JSON.stringify(data)],
  );
};

const requestRowsSql = `
  SELECT
    mr.*,
    l.listing_id,
    l.listing_title,
    p.partner_name,
    u.name AS parent_name,
    u.email AS parent_email,
    c.child_id,
    c.name AS child_name,
    o.outlet_name,
    o.address AS outlet_address,
    b.policy_snapshot
  FROM makeup_requests mr
  JOIN bookings b ON b.booking_id = mr.booking_id
  JOIN listings l ON l.listing_id = b.listing_id
  JOIN partners p ON p.partner_id = mr.partner_id
  JOIN users u ON u.user_id = mr.user_id
  LEFT JOIN children c ON c.child_id = b.child_id
  LEFT JOIN schedules s ON s.schedule_id = b.schedule_id
  LEFT JOIN listingOutlets lo ON lo.listing_outlet_id = s.listing_outlet_id
  LEFT JOIN outlets o ON o.outlet_id = lo.outlet_id
`;

router.get("/user", userAuthorization, async (req, res) => {
  try {
    const result = await pool.query(
      `${requestRowsSql}
       WHERE mr.user_id = $1
       ORDER BY mr.created_at DESC`,
      [req.user],
    );
    res.json({ success: true, requests: result.rows });
  } catch (error) {
    console.error("Unable to load user make-up requests:", error);
    res.status(500).json({ error: "Unable to load make-up requests" });
  }
});

router.get("/partner", partnerAuthorization, async (req, res) => {
  try {
    const result = await pool.query(
      `${requestRowsSql}
       WHERE mr.partner_id = $1
       ORDER BY
         CASE mr.status WHEN 'pending' THEN 0 WHEN 'offered' THEN 1 ELSE 2 END,
         mr.created_at DESC`,
      [req.user],
    );
    res.json({ success: true, requests: result.rows });
  } catch (error) {
    console.error("Unable to load partner make-up requests:", error);
    res.status(500).json({ error: "Unable to load make-up requests" });
  }
});

router.post("/", userAuthorization, async (req, res) => {
  const { occurrence_id: occurrenceId } = req.body;
  const reason = normalizeText(req.body.reason);
  const preferredDates = normalizePreferredDates(req.body.preferred_dates);

  if (!occurrenceId) {
    return res.status(400).json({ error: "Class session is required" });
  }
  if (preferredDates === null) {
    return res.status(400).json({
      error: "Choose up to three valid preferred dates",
    });
  }

  try {
    const occurrenceResult = await pool.query(
      `SELECT
         co.occurrence_id,
         co.booking_id,
         co.scheduled_date,
         co.scheduled_end_date,
         co.scheduled_date AT TIME ZONE 'Asia/Singapore' AS scheduled_utc,
         co.status,
         b.policy_snapshot,
         b.status AS booking_status,
         l.partner_id,
         l.listing_title
       FROM class_occurrences co
       JOIN bookings b ON b.booking_id = co.booking_id
       JOIN listings l ON l.listing_id = b.listing_id
       WHERE co.occurrence_id = $1 AND b.user_id = $2`,
      [occurrenceId, req.user],
    );

    if (occurrenceResult.rowCount === 0) {
      return res.status(404).json({ error: "Class session not found" });
    }

    const occurrence = occurrenceResult.rows[0];
    const policy = occurrence.policy_snapshot || {};
    if (occurrence.booking_status !== "confirmed") {
      return res.status(409).json({ error: "This booking is no longer active" });
    }
    if (!['scheduled', 'rescheduled'].includes(occurrence.status)) {
      return res.status(409).json({
        error: "Only upcoming class sessions can be moved",
      });
    }
    if (!policy.makeup_allowed) {
      return res.status(403).json({
        error: "This booking does not include make-up requests",
      });
    }

    const noticeHours = Math.max(0, Number(policy.makeup_notice_hours) || 0);
    const deadline = new Date(occurrence.scheduled_utc).getTime() - noticeHours * 3600000;
    if (!Number.isFinite(deadline) || Date.now() >= deadline) {
      return res.status(409).json({
        error: `Make-up requests must be submitted at least ${noticeHours} hours before class`,
        code: "MAKEUP_DEADLINE_PASSED",
      });
    }

    const created = await pool.query(
      `INSERT INTO makeup_requests
         (booking_id, occurrence_id, user_id, partner_id, reason,
          preferred_dates, original_start_date, original_end_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        occurrence.booking_id,
        occurrenceId,
        req.user,
        occurrence.partner_id,
        reason,
        JSON.stringify(preferredDates),
        occurrence.scheduled_date,
        occurrence.scheduled_end_date,
      ],
    );

    try {
      await insertNotification(pool, {
        recipientType: AUTH_ROLES.PARTNER,
        recipientId: occurrence.partner_id,
        type: "makeup_request",
        title: `Make-up requested: ${occurrence.listing_title}`,
        message: "A parent has requested another date for an upcoming class.",
        data: {
          request_id: created.rows[0].request_id,
          booking_id: occurrence.booking_id,
          occurrence_id: occurrenceId,
        },
      });
    } catch (notificationError) {
      console.error("Unable to create make-up notification:", notificationError.message);
    }

    res.status(201).json({ success: true, request: created.rows[0] });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        error: "A make-up request already exists for this class session",
      });
    }
    console.error("Unable to create make-up request:", error);
    res.status(500).json({ error: "Unable to submit make-up request" });
  }
});

router.patch("/:requestId/respond", partnerAuthorization, async (req, res) => {
  const { action } = req.body;
  const response = normalizeText(req.body.response);

  if (!['offer', 'reject'].includes(action)) {
    return res.status(400).json({ error: "Choose offer or reject" });
  }
  if (action === "reject" && !response) {
    return res.status(400).json({ error: "Please explain why the request was declined" });
  }
  if (
    action === "offer" &&
    (!DATE_PATTERN.test(String(req.body.offered_date || "")) ||
      req.body.offered_date <= singaporeDate())
  ) {
    return res.status(400).json({ error: "Choose a valid future replacement date" });
  }

  try {
    const result = await pool.query(
      action === "offer"
        ? `UPDATE makeup_requests mr
           SET status = 'offered',
               offered_start_date = $3::date + mr.original_start_date::time,
               offered_end_date = ($3::date + mr.original_start_date::time)
                 + (mr.original_end_date - mr.original_start_date),
               partner_response = $4,
               reviewed_at = NOW()
           WHERE mr.request_id = $1
             AND mr.partner_id = $2
             AND mr.status IN ('pending', 'offered')
           RETURNING mr.*`
        : `UPDATE makeup_requests mr
           SET status = 'rejected',
               partner_response = $3,
               reviewed_at = NOW()
           WHERE mr.request_id = $1
             AND mr.partner_id = $2
             AND mr.status IN ('pending', 'offered')
           RETURNING mr.*`,
      action === "offer"
        ? [req.params.requestId, req.user, req.body.offered_date, response]
        : [req.params.requestId, req.user, response],
    );

    if (result.rowCount === 0) {
      return res.status(409).json({
        error: "This request is unavailable or has already been reviewed",
      });
    }

    const request = result.rows[0];
    try {
      await insertNotification(pool, {
        recipientType: AUTH_ROLES.USER,
        recipientId: request.user_id,
        type: action === "offer" ? "makeup_offered" : "makeup_rejected",
        title: action === "offer" ? "Replacement date offered" : "Make-up request declined",
        message:
          action === "offer"
            ? "Your activity partner offered a replacement date. Please review and confirm it."
            : response,
        data: { request_id: request.request_id, occurrence_id: request.occurrence_id },
      });
    } catch (notificationError) {
      console.error("Unable to create make-up response notification:", notificationError.message);
    }

    res.json({ success: true, request });
  } catch (error) {
    console.error("Unable to respond to make-up request:", error);
    res.status(500).json({ error: "Unable to respond to make-up request" });
  }
});

router.post("/:requestId/confirm", userAuthorization, async (req, res) => {
  let client;
  let transactionOpen = false;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    transactionOpen = true;
    const locked = await client.query(
      `SELECT
         mr.*,
         mr.offered_start_date AT TIME ZONE 'Asia/Singapore' AS offered_start_utc,
         current_occurrence.status AS current_occurrence_status,
         current_occurrence.scheduled_date AS current_scheduled_date,
         b.child_id,
         b.schedule_id,
         b.schedule_group_id,
         l.listing_title,
         sg.is_progressive,
         sg.capacity AS group_capacity,
         s.slots AS schedule_capacity
       FROM makeup_requests mr
       JOIN bookings b ON b.booking_id = mr.booking_id
       JOIN class_occurrences current_occurrence
         ON current_occurrence.occurrence_id = mr.occurrence_id
       JOIN listings l ON l.listing_id = b.listing_id
       JOIN schedules s ON s.schedule_id = b.schedule_id
       LEFT JOIN schedule_groups sg ON sg.schedule_group_id = b.schedule_group_id
       WHERE mr.request_id = $1 AND mr.user_id = $2
       FOR UPDATE OF mr, current_occurrence`,
      [req.params.requestId, req.user],
    );

    if (locked.rowCount === 0) {
      await client.query("ROLLBACK");
      transactionOpen = false;
      return res.status(404).json({ error: "Make-up request not found" });
    }

    const request = locked.rows[0];
    if (request.status !== "offered") {
      await client.query("ROLLBACK");
      transactionOpen = false;
      return res.status(409).json({ error: "This replacement date is no longer available" });
    }
    if (!request.offered_start_date || new Date(request.offered_start_utc) <= new Date()) {
      await client.query("ROLLBACK");
      transactionOpen = false;
      return res.status(409).json({ error: "The offered replacement date has passed" });
    }
    if (
      request.current_occurrence_status === "cancelled" ||
      new Date(request.current_scheduled_date).getTime() !==
        new Date(request.original_start_date).getTime()
    ) {
      await client.query("ROLLBACK");
      transactionOpen = false;
      return res.status(409).json({
        error: "The original class session has already changed. Please submit a new request.",
      });
    }

    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [request.child_id]);
    if (request.is_progressive) {
      await client.query(
        "SELECT schedule_group_id FROM schedule_groups WHERE schedule_group_id = $1 FOR UPDATE",
        [request.schedule_group_id],
      );
    } else {
      await client.query(
        "SELECT schedule_id FROM schedules WHERE schedule_id = $1 FOR UPDATE",
        [request.schedule_id],
      );
    }

    const capacityResult = await client.query(
      request.is_progressive
        ? `SELECT COUNT(DISTINCT b.booking_id)::integer AS count
           FROM class_occurrences co
           JOIN bookings b ON b.booking_id = co.booking_id
           WHERE b.schedule_group_id = $1
             AND b.status = 'confirmed'
             AND co.status IN ('scheduled', 'rescheduled')
             AND co.occurrence_id <> $2
             AND co.scheduled_date < $4
             AND co.scheduled_end_date > $3`
        : `SELECT COUNT(*)::integer AS count
           FROM class_occurrences co
           JOIN bookings b ON b.booking_id = co.booking_id
           WHERE b.schedule_id = $1
             AND b.status = 'confirmed'
             AND co.status IN ('scheduled', 'rescheduled')
             AND co.occurrence_id <> $2
             AND co.scheduled_date < $4
             AND co.scheduled_end_date > $3`,
      [
        request.is_progressive ? request.schedule_group_id : request.schedule_id,
        request.occurrence_id,
        request.offered_start_date,
        request.offered_end_date,
      ],
    );
    const capacity = Number(
      request.is_progressive ? request.group_capacity : request.schedule_capacity,
    );
    if (capacityResult.rows[0].count >= capacity) {
      await client.query("ROLLBACK");
      transactionOpen = false;
      return res.status(409).json({
        error: "The offered replacement class is now full. Please ask for another date.",
        code: "MAKEUP_CAPACITY_FULL",
      });
    }

    const conflicts = await findChildBookingConflicts(
      client,
      request.child_id,
      [{ start_at: request.offered_start_date, end_at: request.offered_end_date }],
      request.occurrence_id,
    );
    const overlap = conflicts.find((conflict) => conflict.is_overlap);
    if (overlap) {
      await client.query("ROLLBACK");
      transactionOpen = false;
      return res.status(409).json({
        error: "This child already has another class at the offered time",
        code: "BOOKING_TIME_CONFLICT",
        conflict: overlap,
      });
    }

    await client.query(
      `UPDATE class_occurrences
       SET scheduled_date = $1,
           scheduled_end_date = $2,
           status = 'rescheduled',
           rescheduled_to = $1
       WHERE occurrence_id = $3`,
      [request.offered_start_date, request.offered_end_date, request.occurrence_id],
    );
    const confirmed = await client.query(
      `UPDATE makeup_requests
       SET status = 'confirmed', confirmed_at = NOW()
       WHERE request_id = $1
       RETURNING *`,
      [request.request_id],
    );
    await client.query("COMMIT");
    transactionOpen = false;
    try {
      await insertNotification(pool, {
        recipientType: AUTH_ROLES.PARTNER,
        recipientId: request.partner_id,
        type: "makeup_confirmed",
        title: `Replacement confirmed: ${request.listing_title}`,
        message: "The parent confirmed your offered replacement date.",
        data: { request_id: request.request_id, occurrence_id: request.occurrence_id },
      });
    } catch (notificationError) {
      console.error("Unable to create confirmation notification:", notificationError.message);
    }
    res.json({ success: true, request: confirmed.rows[0] });
  } catch (error) {
    if (client && transactionOpen) await client.query("ROLLBACK");
    console.error("Unable to confirm make-up request:", error);
    res.status(500).json({ error: "Unable to confirm replacement date" });
  } finally {
    client?.release();
  }
});

router.post("/:requestId/withdraw", userAuthorization, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE makeup_requests
       SET status = 'withdrawn'
       WHERE request_id = $1
         AND user_id = $2
         AND status IN ('pending', 'offered')
       RETURNING *`,
      [req.params.requestId, req.user],
    );
    if (result.rowCount === 0) {
      return res.status(409).json({ error: "This request can no longer be withdrawn" });
    }
    const request = result.rows[0];
    try {
      await insertNotification(pool, {
        recipientType: AUTH_ROLES.PARTNER,
        recipientId: request.partner_id,
        type: "makeup_withdrawn",
        title: "Make-up request withdrawn",
        message: "The parent withdrew their make-up request.",
        data: { request_id: request.request_id, occurrence_id: request.occurrence_id },
      });
    } catch (notificationError) {
      console.error("Unable to create withdrawal notification:", notificationError.message);
    }
    res.json({ success: true, request });
  } catch (error) {
    console.error("Unable to withdraw make-up request:", error);
    res.status(500).json({ error: "Unable to withdraw make-up request" });
  }
});

module.exports = router;
