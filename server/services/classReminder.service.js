const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const pool = require("../db");
const { AUTH_ROLES } = require("../constants/auth");
const sendEmail = require("../utils/emailSender");

const REMINDER_INTERVAL_MS = 10 * 60 * 1000;
const REMINDER_WINDOW_HOURS = 24;
const MAX_EMAIL_ATTEMPTS = 5;
const REMINDER_LOCK_NAME = "juniorpass-class-reminders";
const reminderEmailTemplate = fs.readFileSync(
  path.join(__dirname, "../templates/classReminderEmail.html"),
  "utf8",
);

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const formatSingaporeDateTime = (value) =>
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

const getReminderCopy = (occurrence) => {
  const classTime = formatSingaporeDateTime(occurrence.scheduled_date);
  const childName = occurrence.child_name || "Your child";
  const location = occurrence.outlet_address
    ? ` at ${occurrence.outlet_address}`
    : "";

  return {
    title: `Class reminder: ${occurrence.listing_title}`,
    message: `${childName}'s class starts on ${classTime}${location}.`,
    classTime,
    childName,
  };
};

const buildReminderEmail = (occurrence, env = process.env) => {
  const copy = getReminderCopy(occurrence);
  const mainSiteUrl = getMainSiteUrl(env);
  const values = {
    parentName: occurrence.parent_name || "there",
    childName: copy.childName,
    classTitle: occurrence.listing_title,
    classTime: copy.classTime,
    location: occurrence.outlet_address || "To be confirmed",
    partnerName: occurrence.partner_name || "JuniorPASS partner",
    manageBookingsUrl: `${mainSiteUrl}/profile`,
    logoUrl: `${mainSiteUrl}/juniorpass-logo.png`,
    currentYear: new Date().getFullYear(),
  };

  return Object.entries(values).reduce(
    (html, [key, value]) =>
      html.replaceAll(`{{${key}}}`, escapeHtml(value)),
    reminderEmailTemplate,
  );
};

const getEmailIdempotencyKey = (occurrence) => {
  const scheduledFor = new Date(occurrence.scheduled_date).toISOString();
  const digest = crypto
    .createHash("sha256")
    .update(`${occurrence.occurrence_id}:${scheduledFor}`)
    .digest("hex");
  return `class-reminder-${digest}`;
};

const prepareReminder = async (db, occurrence) => {
  await db.query("BEGIN");
  try {
    const currentOccurrenceResult = await db.query(
      `SELECT scheduled_date, status
       FROM class_occurrences
       WHERE occurrence_id = $1
       FOR UPDATE`,
      [occurrence.occurrence_id],
    );
    const currentOccurrence = currentOccurrenceResult.rows[0];
    const scheduleChanged =
      !currentOccurrence ||
      !["scheduled", "rescheduled"].includes(currentOccurrence.status) ||
      new Date(currentOccurrence.scheduled_date).getTime() !==
        new Date(occurrence.scheduled_date).getTime();

    if (scheduleChanged) {
      await db.query("ROLLBACK");
      return null;
    }

    let reminderResult = await db.query(
      `INSERT INTO class_reminders (occurrence_id, scheduled_for)
       VALUES ($1, $2)
       ON CONFLICT (occurrence_id, scheduled_for) DO NOTHING
       RETURNING reminder_id, notification_id, email_sent_at, email_attempt_count`,
      [occurrence.occurrence_id, occurrence.scheduled_date],
    );

    if (reminderResult.rowCount === 0) {
      reminderResult = await db.query(
        `SELECT reminder_id, notification_id, email_sent_at, email_attempt_count
         FROM class_reminders
         WHERE occurrence_id = $1 AND scheduled_for = $2
         FOR UPDATE`,
        [occurrence.occurrence_id, occurrence.scheduled_date],
      );
    }

    const reminder = reminderResult.rows[0];
    if (!reminder) {
      throw new Error("Unable to create or load the class reminder delivery record");
    }

    if (!reminder.notification_id) {
      const copy = getReminderCopy(occurrence);
      const notificationResult = await db.query(
        `INSERT INTO notifications
           (recipient_type, recipient_id, type, title, message, data)
         VALUES ($1, $2, 'class_reminder', $3, $4, $5)
         RETURNING notification_id`,
        [
          AUTH_ROLES.USER,
          occurrence.user_id,
          copy.title,
          copy.message,
          JSON.stringify({
            occurrence_id: occurrence.occurrence_id,
            booking_id: occurrence.booking_id,
            listing_id: occurrence.listing_id,
            scheduled_date: occurrence.scheduled_date,
            child_name: occurrence.child_name,
            outlet_address: occurrence.outlet_address,
          }),
        ],
      );

      reminder.notification_id = notificationResult.rows[0].notification_id;
      await db.query(
        `UPDATE class_reminders
         SET notification_id = $2, updated_at = NOW()
         WHERE reminder_id = $1`,
        [reminder.reminder_id, reminder.notification_id],
      );
    }

    await db.query("COMMIT");
    return reminder;
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
};

const sendReminderEmail = async ({
  db,
  reminder,
  occurrence,
  sendEmailImpl,
  env,
}) => {
  if (
    reminder.email_sent_at ||
    Number(reminder.email_attempt_count || 0) >= MAX_EMAIL_ATTEMPTS
  ) {
    return false;
  }

  try {
    await sendEmailImpl(
      occurrence.parent_email,
      `Reminder: ${occurrence.listing_title} is coming up`,
      buildReminderEmail(occurrence, env),
      { idempotencyKey: getEmailIdempotencyKey(occurrence) },
    );
    await db.query(
      `UPDATE class_reminders
       SET email_sent_at = NOW(), email_attempt_count = email_attempt_count + 1,
           last_email_error = NULL, updated_at = NOW()
       WHERE reminder_id = $1 AND email_sent_at IS NULL`,
      [reminder.reminder_id],
    );
    return true;
  } catch (error) {
    await db.query(
      `UPDATE class_reminders
       SET email_attempt_count = email_attempt_count + 1,
           last_email_error = LEFT($2, 1000), updated_at = NOW()
       WHERE reminder_id = $1 AND email_sent_at IS NULL`,
      [reminder.reminder_id, error.message || "Email delivery failed"],
    );
    return false;
  }
};

const runClassReminders = async ({
  dbPool = pool,
  sendEmailImpl = sendEmail,
  env = process.env,
} = {}) => {
  const db = await dbPool.connect();
  let lockAcquired = false;

  try {
    const lockResult = await db.query(
      "SELECT pg_try_advisory_lock(hashtext($1)) AS acquired",
      [REMINDER_LOCK_NAME],
    );
    lockAcquired = Boolean(lockResult.rows[0]?.acquired);
    if (!lockAcquired) return { skipped: true, processed: 0, emailsSent: 0 };

    const occurrencesResult = await db.query(
      `SELECT co.occurrence_id, co.scheduled_date, co.scheduled_end_date,
              b.booking_id, b.user_id, b.listing_id,
              u.name AS parent_name, u.email AS parent_email,
              c.name AS child_name, l.listing_title,
              p.partner_name, o.address AS outlet_address
       FROM class_occurrences co
       JOIN bookings b ON b.booking_id = co.booking_id
       JOIN users u ON u.user_id = b.user_id
       LEFT JOIN children c ON c.child_id = b.child_id
       JOIN listings l ON l.listing_id = b.listing_id
       JOIN partners p ON p.partner_id = l.partner_id
       JOIN schedules s ON s.schedule_id = b.schedule_id
       JOIN listingOutlets lo ON lo.listing_outlet_id = s.listing_outlet_id
       JOIN outlets o ON o.outlet_id = lo.outlet_id
       WHERE b.status = 'confirmed'
         AND co.status IN ('scheduled', 'rescheduled')
         AND co.scheduled_date > NOW()
         AND co.scheduled_date <= NOW() + ($1 * INTERVAL '1 hour')
       ORDER BY co.scheduled_date, co.occurrence_id`,
      [REMINDER_WINDOW_HOURS],
    );

    let emailsSent = 0;
    for (const occurrence of occurrencesResult.rows) {
      try {
        const reminder = await prepareReminder(db, occurrence);
        if (!reminder) continue;
        if (
          await sendReminderEmail({
            db,
            reminder,
            occurrence,
            sendEmailImpl,
            env,
          })
        ) {
          emailsSent += 1;
        }
      } catch (error) {
        console.error(
          `Class reminder failed for occurrence ${occurrence.occurrence_id}:`,
          error.message,
        );
      }
    }

    return {
      skipped: false,
      processed: occurrencesResult.rowCount,
      emailsSent,
    };
  } finally {
    if (lockAcquired) {
      try {
        await db.query("SELECT pg_advisory_unlock(hashtext($1))", [
          REMINDER_LOCK_NAME,
        ]);
      } catch (error) {
        console.error("Unable to release class reminder lock:", error.message);
      }
    }
    db.release();
  }
};

const shouldRunClassReminders = (env = process.env) =>
  env.CLASS_REMINDERS_ENABLED === "true" ||
  (env.NODE_ENV === "production" &&
    env.CLASS_REMINDERS_ENABLED !== "false");

const startClassReminderScheduler = ({
  run = runClassReminders,
  env = process.env,
} = {}) => {
  if (!shouldRunClassReminders(env)) return () => {};

  let stopped = false;
  let running = false;
  const execute = async () => {
    if (stopped || running) return;
    running = true;
    try {
      const result = await run({ env });
      if (result.processed > 0) {
        console.log(
          `Class reminders processed: ${result.processed}; emails sent: ${result.emailsSent}`,
        );
      }
    } catch (error) {
      console.error("Class reminder scheduler failed:", error.message);
    } finally {
      running = false;
    }
  };

  const initialTimer = setTimeout(execute, 5000);
  const intervalTimer = setInterval(execute, REMINDER_INTERVAL_MS);
  initialTimer.unref?.();
  intervalTimer.unref?.();

  return () => {
    stopped = true;
    clearTimeout(initialTimer);
    clearInterval(intervalTimer);
  };
};

module.exports = {
  MAX_EMAIL_ATTEMPTS,
  buildReminderEmail,
  escapeHtml,
  formatSingaporeDateTime,
  getEmailIdempotencyKey,
  getMainSiteUrl,
  getReminderCopy,
  runClassReminders,
  shouldRunClassReminders,
  startClassReminderScheduler,
};
