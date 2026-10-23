const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { AUTH_ROLES } = require("../constants/auth");
const sendEmail = require("../utils/emailSender");

const sessionChangeEmailTemplate = fs.readFileSync(
  path.join(__dirname, "../templates/classSessionChangeEmail.html"),
  "utf8",
);

const SESSION_ACTIONS = Object.freeze({
  CANCEL: "cancel",
  RESCHEDULE: "reschedule",
  MAKEUP: "makeup",
});

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const normalizeReason = (value) => {
  const reason = String(value || "").trim();
  return reason ? reason.slice(0, 1000) : null;
};

const toWallClockString = (value) => {
  if (typeof value === "string") return value.slice(0, 19);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(new Date(value))
    .reduce((values, part) => ({ ...values, [part.type]: part.value }), {});
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
};

const applyScheduleExceptions = async (db, scheduleId, occurrenceWindows) => {
  const result = await db.query(
    `SELECT exception_date::text, exception_type,
            replacement_start_date, replacement_end_date
     FROM scheduleExceptions
     WHERE schedule_id = $1
     ORDER BY created_at ASC, exception_id ASC`,
    [scheduleId],
  );

  return occurrenceWindows.map((window) => {
    let effective = { ...window, status: "scheduled" };
    const visitedDates = new Set();

    for (let step = 0; step <= result.rows.length; step += 1) {
      const date = effective.start_at.slice(0, 10);
      if (visitedDates.has(date)) break;
      visitedDates.add(date);
      const exception = result.rows.find((row) => row.exception_date === date);
      if (!exception) break;
      if (exception.exception_type === "cancelled") {
        effective.status = "cancelled";
        break;
      }
      if (
        exception.exception_type === "rescheduled" &&
        exception.replacement_start_date &&
        exception.replacement_end_date
      ) {
        effective = {
          start_at: toWallClockString(exception.replacement_start_date),
          end_at: toWallClockString(exception.replacement_end_date),
          status: "rescheduled",
        };
      }
    }
    return effective;
  });
};

const isTimestamp = (value) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) &&
  Number.isFinite(new Date(value).getTime());

const validateSessionChangeInput = (action, body = {}) => {
  if (!Object.values(SESSION_ACTIONS).includes(action)) {
    return "Unsupported session action";
  }
  if (!UUID_PATTERN.test(String(body.schedule_id || ""))) {
    return "A valid schedule is required";
  }
  if (!isTimestamp(body.scheduled_date)) {
    return "A valid session date is required";
  }
  if (action === SESSION_ACTIONS.CANCEL && !normalizeReason(body.reason)) {
    return "Tell parents why this session is being cancelled";
  }
  if (
    [SESSION_ACTIONS.RESCHEDULE, SESSION_ACTIONS.MAKEUP].includes(action) &&
    (!isTimestamp(body.new_start_date) || !isTimestamp(body.new_end_date))
  ) {
    return "Choose a valid replacement start and end time";
  }
  return null;
};

const formatWallClock = (value) =>
  new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(value));

const getMainSiteUrl = (env = process.env) => {
  const configuredUrl = (env.FRONTEND_URL || env.CLIENT_URL || "").trim();
  if (configuredUrl) return configuredUrl.replace(/\/+$/, "");
  if (env.NODE_ENV === "staging") return "https://staging.juniorpass.sg";
  if (env.NODE_ENV === "production") return "https://www.juniorpass.sg";
  return "http://localhost:5173";
};

const getChangeCopy = ({ action, listingTitle, oldDate, newDate, reason }) => {
  if (action === SESSION_ACTIONS.CANCEL) {
    return {
      type: "class_cancelled",
      title: `Class cancelled: ${listingTitle}`,
      message: `${listingTitle} on ${formatWallClock(oldDate)} has been cancelled. Reason: ${reason}`,
      emailSubject: `Class cancellation: ${listingTitle}`,
      heading: "A class session has been cancelled",
      intro: "Your activity partner has cancelled the following class session.",
      dateLabel: "Cancelled session",
      dateValue: formatWallClock(oldDate),
    };
  }

  if (action === SESSION_ACTIONS.RESCHEDULE) {
    return {
      type: "class_rescheduled",
      title: `Class rescheduled: ${listingTitle}`,
      message: `${listingTitle} has moved from ${formatWallClock(oldDate)} to ${formatWallClock(newDate)}.`,
      emailSubject: `Class rescheduled: ${listingTitle}`,
      heading: "Your class session has moved",
      intro: "Your activity partner has rescheduled the following class session.",
      dateLabel: "New session time",
      dateValue: formatWallClock(newDate),
    };
  }

  return {
    type: "makeup_class",
    title: `Make-up class scheduled: ${listingTitle}`,
    message: `A make-up class for the cancelled ${listingTitle} session has been scheduled for ${formatWallClock(newDate)}.`,
    emailSubject: `Make-up class scheduled: ${listingTitle}`,
    heading: "A make-up class has been scheduled",
    intro: "Your activity partner has arranged a replacement for a cancelled session.",
    dateLabel: "Make-up class",
    dateValue: formatWallClock(newDate),
  };
};

const buildSessionChangeEmail = ({ recipient, copy, details, env }) => {
  const mainSiteUrl = getMainSiteUrl(env);
  const values = {
    parentName: recipient.parent_name || "there",
    heading: copy.heading,
    intro: copy.intro,
    classTitle: details.listing_title,
    childNames: recipient.child_names.join(", "),
    dateLabel: copy.dateLabel,
    dateValue: copy.dateValue,
    previousDate:
      details.action === SESSION_ACTIONS.RESCHEDULE
        ? formatWallClock(details.old_date)
        : "",
    previousDateRow:
      details.action === SESSION_ACTIONS.RESCHEDULE
        ? `<tr><td class="label">Previous time</td><td>${escapeHtml(formatWallClock(details.old_date))}</td></tr>`
        : "",
    reasonRow: details.reason
      ? `<tr><td class="label">Partner note</td><td>${escapeHtml(details.reason)}</td></tr>`
      : "",
    manageBookingsUrl: `${mainSiteUrl}/profile`,
    logoUrl: `${mainSiteUrl}/juniorpass-logo.png`,
    currentYear: new Date().getFullYear(),
  };

  return Object.entries(values).reduce(
    (html, [key, value]) =>
      html.replaceAll(`{{${key}}}`, key.endsWith("Row") ? value : escapeHtml(value)),
    sessionChangeEmailTemplate,
  );
};

const getPartnerSessions = async (db, partnerId) => {
  const result = await db.query(
    `SELECT
       b.schedule_id,
       b.listing_id,
       l.listing_title,
       o.outlet_name,
       o.address AS outlet_address,
       TO_CHAR(co.scheduled_date, 'YYYY-MM-DD"T"HH24:MI:SS') AS scheduled_date,
       TO_CHAR(co.scheduled_end_date, 'YYYY-MM-DD"T"HH24:MI:SS') AS scheduled_end_date,
       CASE
         WHEN BOOL_AND(co.status = 'cancelled') THEN 'cancelled'
         WHEN BOOL_OR(co.status = 'rescheduled') THEN 'rescheduled'
         ELSE 'scheduled'
       END AS status,
       COUNT(DISTINCT b.booking_id)::integer AS affected_bookings,
       COUNT(DISTINCT b.user_id)::integer AS affected_families,
       COUNT(DISTINCT b.child_id)::integer AS affected_children,
       BOOL_OR(co.makeup_for_occurrence_id IS NOT NULL) AS is_makeup,
       BOOL_OR(EXISTS (
         SELECT 1
         FROM class_occurrences replacement
         WHERE replacement.makeup_for_occurrence_id = co.occurrence_id
       )) AS has_makeup,
       STRING_AGG(DISTINCT NULLIF(co.cancellation_reason, ''), '; ')
         AS cancellation_reason
     FROM class_occurrences co
     JOIN bookings b ON b.booking_id = co.booking_id
     JOIN listings l ON l.listing_id = b.listing_id
     JOIN schedules s ON s.schedule_id = b.schedule_id
     JOIN listingOutlets lo ON lo.listing_outlet_id = s.listing_outlet_id
     JOIN outlets o ON o.outlet_id = lo.outlet_id
     WHERE l.partner_id = $1
       AND b.status = 'confirmed'
       AND co.scheduled_date >= CURRENT_DATE - INTERVAL '30 days'
     GROUP BY b.schedule_id, b.listing_id, l.listing_title,
              o.outlet_name, o.address, co.scheduled_date, co.scheduled_end_date
     ORDER BY co.scheduled_date ASC`,
    [partnerId],
  );
  return result.rows;
};

const changePartnerSession = async ({
  dbPool,
  partnerId,
  action,
  body,
  sendEmailImpl = sendEmail,
  env = process.env,
}) => {
  const validationError = validateSessionChangeInput(action, body);
  if (validationError) {
    return { status: 400, payload: { error: validationError } };
  }

  const reason = normalizeReason(body.reason);
  const client = await dbPool.connect();
  let transactionOpen = false;
  let recipients = [];
  let details;

  try {
    await client.query("BEGIN");
    transactionOpen = true;
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `${body.schedule_id}:${body.scheduled_date}`,
    ]);
    await client.query(
      "SELECT schedule_id FROM schedules WHERE schedule_id = $1 FOR UPDATE",
      [body.schedule_id],
    );

    if (action !== SESSION_ACTIONS.CANCEL) {
      const dates = await client.query(
        `SELECT
           $1::timestamp > (NOW() AT TIME ZONE 'Asia/Singapore') AS future_start,
           $2::timestamp > $1::timestamp AS valid_range`,
        [body.new_start_date, body.new_end_date],
      );
      if (!dates.rows[0].future_start || !dates.rows[0].valid_range) {
        await client.query("ROLLBACK");
        transactionOpen = false;
        return {
          status: 400,
          payload: { error: "The replacement session must have a future start and a later end time" },
        };
      }
    }

    const occurrenceResult = await client.query(
      `SELECT
         co.occurrence_id,
         co.booking_id,
         co.status::text,
         co.scheduled_date,
         co.scheduled_end_date,
         co.scheduled_date > (NOW() AT TIME ZONE 'Asia/Singapore') AS is_future,
         b.user_id,
         b.child_id,
         u.name AS parent_name,
         u.email AS parent_email,
         c.name AS child_name,
         l.listing_id,
         l.listing_title
       FROM class_occurrences co
       JOIN bookings b ON b.booking_id = co.booking_id
       JOIN listings l ON l.listing_id = b.listing_id
       JOIN users u ON u.user_id = b.user_id
       LEFT JOIN children c ON c.child_id = b.child_id
       WHERE b.schedule_id = $1
         AND co.scheduled_date = $2::timestamp
         AND l.partner_id = $3
         AND b.status = 'confirmed'
       FOR UPDATE OF co`,
      [body.schedule_id, body.scheduled_date, partnerId],
    );

    if (occurrenceResult.rowCount === 0) {
      await client.query("ROLLBACK");
      transactionOpen = false;
      return { status: 404, payload: { error: "Class session not found" } };
    }

    const occurrences = occurrenceResult.rows;
    const requiredStatus =
      action === SESSION_ACTIONS.MAKEUP
        ? ["cancelled"]
        : ["scheduled", "rescheduled"];
    if (occurrences.some((row) => !requiredStatus.includes(row.status))) {
      await client.query("ROLLBACK");
      transactionOpen = false;
      return {
        status: 409,
        payload: {
          error:
            action === SESSION_ACTIONS.MAKEUP
              ? "A make-up class can only be added to a cancelled session"
              : "This session has already changed. Refresh and try again.",
        },
      };
    }
    if (
      action !== SESSION_ACTIONS.MAKEUP &&
      occurrences.some((row) => !row.is_future)
    ) {
      await client.query("ROLLBACK");
      transactionOpen = false;
      return {
        status: 409,
        payload: { error: "Past class sessions can no longer be changed" },
      };
    }

    const occurrenceIds = occurrences.map((row) => row.occurrence_id);
    const listingTitle = occurrences[0].listing_title;
    const oldDate = occurrences[0].scheduled_date;

    if (action === SESSION_ACTIONS.RESCHEDULE) {
      const conflicts = await client.query(
        `SELECT DISTINCT c.name AS child_name, l.listing_title
         FROM class_occurrences existing
         JOIN bookings b ON b.booking_id = existing.booking_id
         JOIN children c ON c.child_id = b.child_id
         JOIN listings l ON l.listing_id = b.listing_id
         WHERE b.child_id = ANY($1::uuid[])
           AND existing.occurrence_id <> ALL($2::uuid[])
           AND b.status = 'confirmed'
           AND existing.status IN ('scheduled', 'rescheduled')
           AND existing.scheduled_date < $4::timestamp
           AND existing.scheduled_end_date > $3::timestamp`,
        [
          occurrences.map((row) => row.child_id),
          occurrenceIds,
          body.new_start_date,
          body.new_end_date,
        ],
      );
      if (conflicts.rowCount > 0) {
        await client.query("ROLLBACK");
        transactionOpen = false;
        return {
          status: 409,
          payload: {
            code: "CHILD_SCHEDULE_CONFLICT",
            error: "The new time conflicts with another booking for one or more children",
            conflicts: conflicts.rows,
          },
        };
      }
    }

    if (action === SESSION_ACTIONS.CANCEL) {
      await client.query(
        `UPDATE class_occurrences
         SET status = 'cancelled', cancellation_reason = $2,
             cancelled_by = $3, updated_at = NOW()
         WHERE occurrence_id = ANY($1::uuid[])`,
        [occurrenceIds, reason, AUTH_ROLES.PARTNER],
      );
    } else if (action === SESSION_ACTIONS.RESCHEDULE) {
      await client.query(
        `UPDATE class_occurrences
         SET scheduled_date = $2::timestamp,
             scheduled_end_date = $3::timestamp,
             status = 'rescheduled', rescheduled_to = $2::timestamp,
             cancellation_reason = NULL, cancelled_by = NULL,
             updated_at = NOW()
         WHERE occurrence_id = ANY($1::uuid[])`,
        [occurrenceIds, body.new_start_date, body.new_end_date],
      );
    } else {
      const inserted = await client.query(
        `INSERT INTO class_occurrences (
           booking_id, scheduled_date, scheduled_end_date,
           occurrence_number, status, makeup_for_occurrence_id
         )
         SELECT source.booking_id, $2::timestamp, $3::timestamp,
                COALESCE((
                  SELECT MAX(existing.occurrence_number) + 1
                  FROM class_occurrences existing
                  WHERE existing.booking_id = source.booking_id
                ), 1),
                'scheduled', source.occurrence_id
         FROM class_occurrences source
         WHERE source.occurrence_id = ANY($1::uuid[])
         ON CONFLICT (makeup_for_occurrence_id)
           WHERE makeup_for_occurrence_id IS NOT NULL
         DO NOTHING
         RETURNING occurrence_id`,
        [occurrenceIds, body.new_start_date, body.new_end_date],
      );
      if (inserted.rowCount !== occurrences.length) {
        await client.query("ROLLBACK");
        transactionOpen = false;
        return {
          status: 409,
          payload: { error: "A make-up class has already been created for this session" },
        };
      }
    }

    await client.query(
      `INSERT INTO scheduleExceptions (
         schedule_id, exception_date, exception_type, reason,
         replacement_start_date, replacement_end_date
       )
       VALUES ($1, $2::timestamp::date, $3, LEFT($4::text, 255), $5::timestamp, $6::timestamp)
       ON CONFLICT (schedule_id, exception_date)
       DO UPDATE SET
         exception_type = EXCLUDED.exception_type,
         reason = EXCLUDED.reason,
         replacement_start_date = EXCLUDED.replacement_start_date,
         replacement_end_date = EXCLUDED.replacement_end_date,
         updated_at = NOW()`,
      [
        body.schedule_id,
        body.scheduled_date,
        action === SESSION_ACTIONS.CANCEL ? "cancelled" : "rescheduled",
        reason,
        action === SESSION_ACTIONS.CANCEL ? null : body.new_start_date,
        action === SESSION_ACTIONS.CANCEL ? null : body.new_end_date,
      ],
    );

    const copy = getChangeCopy({
      action,
      listingTitle,
      oldDate,
      newDate: body.new_start_date,
      reason,
    });

    const users = new Map();
    for (const occurrence of occurrences) {
      const recipient = users.get(occurrence.user_id) || {
        user_id: occurrence.user_id,
        parent_name: occurrence.parent_name,
        parent_email: occurrence.parent_email,
        child_names: [],
      };
      if (occurrence.child_name && !recipient.child_names.includes(occurrence.child_name)) {
        recipient.child_names.push(occurrence.child_name);
      }
      users.set(occurrence.user_id, recipient);
    }
    recipients = [...users.values()];

    for (const recipient of recipients) {
      await client.query(
        `INSERT INTO notifications
           (recipient_type, recipient_id, type, title, message, data)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          AUTH_ROLES.USER,
          recipient.user_id,
          copy.type,
          copy.title,
          copy.message,
          JSON.stringify({
            listing_id: occurrences[0].listing_id,
            schedule_id: body.schedule_id,
            occurrence_ids: occurrenceIds,
            old_date: oldDate,
            new_date: body.new_start_date || null,
            action,
            reason,
          }),
        ],
      );
    }

    details = {
      action,
      listing_title: listingTitle,
      old_date: oldDate,
      new_date: body.new_start_date || null,
      reason,
      copy,
    };
    await client.query("COMMIT");
    transactionOpen = false;

    const deliveries = await Promise.allSettled(
      recipients
        .filter((recipient) => recipient.parent_email)
        .map((recipient) => {
          const digest = crypto
            .createHash("sha256")
            .update(
              `${action}:${body.schedule_id}:${oldDate}:${recipient.user_id}`,
            )
            .digest("hex");
          return sendEmailImpl(
            recipient.parent_email,
            copy.emailSubject,
            buildSessionChangeEmail({ recipient, copy, details, env }),
            { idempotencyKey: `class-session-change-${digest}` },
          );
        }),
    );
    const emailsSent = deliveries.filter(
      (delivery) => delivery.status === "fulfilled",
    ).length;

    return {
      status: 200,
      payload: {
        success: true,
        message: "Session updated and affected parents notified",
        affected_bookings: occurrences.length,
        affected_families: recipients.length,
        emails_sent: emailsSent,
      },
    };
  } catch (error) {
    if (transactionOpen) await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  SESSION_ACTIONS,
  applyScheduleExceptions,
  changePartnerSession,
  getPartnerSessions,
  validateSessionChangeInput,
};
