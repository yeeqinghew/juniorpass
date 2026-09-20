const test = require("node:test");
const assert = require("node:assert/strict");
const { buildOccurrenceWindows } = require("../utils/bookingConflicts");

test("builds every weekly package occurrence with the original duration", () => {
  const occurrences = buildOccurrenceWindows({
    startDate: "2026-10-03T09:00:00Z",
    endDate: "2026-10-03T10:00:00Z",
    classCount: 3,
    frequency: "Weekly",
  });

  assert.deepEqual(occurrences, [
    {
      start_at: "2026-10-03T09:00:00.000Z",
      end_at: "2026-10-03T10:00:00.000Z",
    },
    {
      start_at: "2026-10-10T09:00:00.000Z",
      end_at: "2026-10-10T10:00:00.000Z",
    },
    {
      start_at: "2026-10-17T09:00:00.000Z",
      end_at: "2026-10-17T10:00:00.000Z",
    },
  ]);
});

test("uses the configured interval for monthly packages", () => {
  const occurrences = buildOccurrenceWindows({
    startDate: "2026-10-03T09:00:00Z",
    endDate: "2026-10-03T10:30:00Z",
    classCount: 2,
    frequency: "Monthly",
  });

  assert.equal(occurrences[1].start_at, "2026-11-02T09:00:00.000Z");
  assert.equal(occurrences[1].end_at, "2026-11-02T10:30:00.000Z");
});
