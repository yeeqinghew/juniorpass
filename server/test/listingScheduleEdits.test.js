const test = require("node:test");
const assert = require("node:assert/strict");
const {
  dateOnly,
  hasStructuralScheduleChange,
} = require("../utils/listingScheduleEdits");

const existing = {
  package_types: ["short-term", "full-term"],
  is_progressive: true,
  capacity: 12,
  frequency: "Weekly",
  full_term_start_date: new Date(2026, 6, 11),
  full_term_class_count: 12,
  short_term_class_count: 3,
};
const existingSlots = [
  {
    day: "Saturday",
    start_time: "09:00:00",
    end_time: "10:00:00",
    slots: 12,
  },
];
const submitted = {
  package_types: ["full-term", "short-term"],
  is_progressive: true,
  capacity: 12,
  frequency: "Weekly",
  full_term_start_date: "2026-07-11",
  full_term_class_count: 12,
  short_term_class_count: 3,
  time_slots: [
    { day: "Saturday", timeslot: ["09:00", "10:00"] },
  ],
};

test("recognizes the same enrolled schedule despite transport formatting", () => {
  assert.equal(
    hasStructuralScheduleChange(existing, submitted, existingSlots),
    false,
  );
});

test("allows price-only edits but rejects structural edits", () => {
  assert.equal(
    hasStructuralScheduleChange(
      existing,
      { ...submitted, price_fullterm: 1200 },
      existingSlots,
    ),
    false,
  );
  assert.equal(
    hasStructuralScheduleChange(
      existing,
      { ...submitted, full_term_class_count: 10 },
      existingSlots,
    ),
    true,
  );
});

test("normalizes database dates for structural comparisons", () => {
  assert.equal(dateOnly(new Date(2026, 6, 11)), "2026-07-11");
  assert.equal(dateOnly("2026-07-11T00:00:00.000Z"), "2026-07-11");
});
