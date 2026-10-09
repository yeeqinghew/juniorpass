const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildReminderEmail,
  getEmailIdempotencyKey,
  runClassReminders,
  shouldRunClassReminders,
} = require("../services/classReminder.service");

const occurrence = {
  occurrence_id: "11111111-1111-4111-a111-111111111111",
  booking_id: "22222222-2222-4222-a222-222222222222",
  listing_id: "33333333-3333-4333-a333-333333333333",
  user_id: "44444444-4444-4444-a444-444444444444",
  scheduled_date: "2026-10-10T01:00:00.000Z",
  scheduled_end_date: "2026-10-10T02:00:00.000Z",
  parent_name: "Parent <script>",
  parent_email: "parent@example.com",
  child_name: "Jamie",
  listing_title: "Junior Basketball",
  partner_name: "Activity Partner",
  outlet_address: "10 Example Street",
};

test("reminder email escapes stored content and uses the staging site", () => {
  const html = buildReminderEmail(occurrence, { NODE_ENV: "staging" });

  assert.match(html, /Parent &lt;script&gt;/);
  assert.doesNotMatch(html, /Parent <script>/);
  assert.match(html, /https:\/\/staging\.juniorpass\.sg\/profile/);
  assert.match(
    html,
    /https:\/\/staging\.juniorpass\.sg\/juniorpass-logo\.png/,
  );
  assert.match(html, /Saturday, 10 October 2026 at 9:00 am/);
  assert.match(html, /background: #98bdd2/);
  assert.match(html, /background: #f3a5c7/);
  assert.match(html, /View your booking/);
  assert.doesNotMatch(html, /{{[a-zA-Z]+}}/);
});

test("email idempotency key changes when an occurrence is rescheduled", () => {
  const firstKey = getEmailIdempotencyKey(occurrence);
  const secondKey = getEmailIdempotencyKey({
    ...occurrence,
    scheduled_date: "2026-10-11T01:00:00.000Z",
  });

  assert.notEqual(firstKey, secondKey);
  assert.equal(firstKey, getEmailIdempotencyKey(occurrence));
});

test("scheduler defaults on only for production", () => {
  assert.equal(shouldRunClassReminders({ NODE_ENV: "development" }), false);
  assert.equal(shouldRunClassReminders({ NODE_ENV: "staging" }), false);
  assert.equal(
    shouldRunClassReminders({
      NODE_ENV: "staging",
      CLASS_REMINDERS_ENABLED: "true",
    }),
    true,
  );
  assert.equal(shouldRunClassReminders({ NODE_ENV: "production" }), true);
  assert.equal(
    shouldRunClassReminders({
      NODE_ENV: "production",
      CLASS_REMINDERS_ENABLED: "false",
    }),
    false,
  );
});

test("reminder run creates one notification and sends an idempotent email", async () => {
  const queries = [];
  const sentEmails = [];
  const client = {
    async query(sql, params) {
      const normalized = String(sql).replace(/\s+/g, " ").trim();
      queries.push({ sql: normalized, params });

      if (normalized.includes("pg_try_advisory_lock")) {
        return { rowCount: 1, rows: [{ acquired: true }] };
      }
      if (normalized.startsWith("SELECT co.occurrence_id")) {
        return { rowCount: 1, rows: [occurrence] };
      }
      if (normalized.startsWith("SELECT scheduled_date, status")) {
        return {
          rowCount: 1,
          rows: [{
            scheduled_date: occurrence.scheduled_date,
            status: "scheduled",
          }],
        };
      }
      if (normalized.startsWith("INSERT INTO class_reminders")) {
        return {
          rowCount: 1,
          rows: [{
            reminder_id: "55555555-5555-4555-a555-555555555555",
            notification_id: null,
            email_sent_at: null,
            email_attempt_count: 0,
          }],
        };
      }
      if (normalized.startsWith("INSERT INTO notifications")) {
        return {
          rowCount: 1,
          rows: [{ notification_id: "66666666-6666-4666-a666-666666666666" }],
        };
      }
      return { rowCount: 1, rows: [] };
    },
    release() {},
  };

  const result = await runClassReminders({
    dbPool: { async connect() { return client; } },
    async sendEmailImpl(...args) {
      sentEmails.push(args);
    },
    env: { NODE_ENV: "staging" },
  });

  assert.deepEqual(result, { skipped: false, processed: 1, emailsSent: 1 });
  assert.equal(sentEmails.length, 1);
  assert.equal(sentEmails[0][0], occurrence.parent_email);
  assert.equal(
    sentEmails[0][3].idempotencyKey,
    getEmailIdempotencyKey(occurrence),
  );
  assert.equal(
    queries.filter(({ sql }) => sql.startsWith("INSERT INTO notifications")).length,
    1,
  );
  assert.ok(queries.some(({ sql }) => sql.includes("email_sent_at = NOW()")));
  assert.ok(queries.some(({ sql }) => sql.includes("pg_advisory_unlock")));
});

test("reminder run skips an occurrence whose schedule changed after selection", async () => {
  const sentEmails = [];
  const client = {
    async query(sql) {
      const normalized = String(sql).replace(/\s+/g, " ").trim();
      if (normalized.includes("pg_try_advisory_lock")) {
        return { rowCount: 1, rows: [{ acquired: true }] };
      }
      if (normalized.startsWith("SELECT co.occurrence_id")) {
        return { rowCount: 1, rows: [occurrence] };
      }
      if (normalized.startsWith("SELECT scheduled_date, status")) {
        return {
          rowCount: 1,
          rows: [{
            scheduled_date: "2026-10-11T01:00:00.000Z",
            status: "rescheduled",
          }],
        };
      }
      return { rowCount: 1, rows: [] };
    },
    release() {},
  };

  const result = await runClassReminders({
    dbPool: { async connect() { return client; } },
    async sendEmailImpl(...args) {
      sentEmails.push(args);
    },
  });

  assert.deepEqual(result, { skipped: false, processed: 1, emailsSent: 0 });
  assert.equal(sentEmails.length, 0);
});
