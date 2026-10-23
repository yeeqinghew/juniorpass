const test = require("node:test");
const assert = require("node:assert/strict");
const {
  applyScheduleExceptions,
  validateSessionChangeInput,
} = require("../services/classSessionManagement.service");

const scheduleId = "64045e30-8a70-4cbc-a9cb-8b3e0a53c877";

test("validates the required fields for partner session changes", () => {
  assert.equal(
    validateSessionChangeInput("cancel", {
      schedule_id: scheduleId,
      scheduled_date: "2026-11-01T09:00:00",
      reason: "Coach is unavailable",
    }),
    null,
  );
  assert.match(
    validateSessionChangeInput("cancel", {
      schedule_id: scheduleId,
      scheduled_date: "2026-11-01T09:00:00",
    }),
    /why this session is being cancelled/i,
  );
  assert.match(
    validateSessionChangeInput("reschedule", {
      schedule_id: scheduleId,
      scheduled_date: "2026-11-01T09:00:00",
    }),
    /replacement start and end time/i,
  );
});

test("applies a cancellation to future enrolment occurrences", async () => {
  const db = {
    query: async () => ({
      rows: [
        {
          exception_date: "2026-11-01",
          exception_type: "cancelled",
          replacement_start_date: null,
          replacement_end_date: null,
        },
      ],
    }),
  };
  const result = await applyScheduleExceptions(db, scheduleId, [
    {
      start_at: "2026-11-01T09:00:00",
      end_at: "2026-11-01T10:00:00",
    },
  ]);
  assert.equal(result[0].status, "cancelled");
});

test("follows chained reschedules for future enrolments", async () => {
  const db = {
    query: async () => ({
      rows: [
        {
          exception_date: "2026-11-01",
          exception_type: "rescheduled",
          replacement_start_date: new Date("2026-11-03T02:00:00.000Z"),
          replacement_end_date: new Date("2026-11-03T03:00:00.000Z"),
        },
        {
          exception_date: "2026-11-03",
          exception_type: "rescheduled",
          replacement_start_date: new Date("2026-11-05T06:00:00.000Z"),
          replacement_end_date: new Date("2026-11-05T07:00:00.000Z"),
        },
      ],
    }),
  };
  const result = await applyScheduleExceptions(db, scheduleId, [
    {
      start_at: "2026-11-01T09:00:00",
      end_at: "2026-11-01T10:00:00",
    },
  ]);
  assert.deepEqual(result[0], {
    start_at: "2026-11-05T14:00:00",
    end_at: "2026-11-05T15:00:00",
    status: "rescheduled",
  });
});
