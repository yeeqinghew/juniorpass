const assert = require("node:assert/strict");
const test = require("node:test");
const {
  DEFAULT_BOOKING_POLICY,
  normalizeBookingPolicy,
  calculateCancellation,
} = require("../utils/bookingPolicy");

test("normalizes a complete booking policy", () => {
  assert.deepEqual(
    normalizeBookingPolicy({
      cancellation_notice_hours: 48,
      refund_before_deadline_percent: 75,
      refund_after_deadline_percent: 10,
      makeup_allowed: true,
      makeup_notice_hours: 12,
      class_requirements: " Bring shoes. ",
    }),
    {
      version: 1,
      cancellation_notice_hours: 48,
      refund_before_deadline_percent: 75,
      refund_after_deadline_percent: 10,
      makeup_allowed: true,
      makeup_notice_hours: 12,
      class_requirements: "Bring shoes.",
    },
  );
});

test("rejects booking policies outside supported limits", () => {
  assert.equal(
    normalizeBookingPolicy({ cancellation_notice_hours: 721 }),
    null,
  );
  assert.equal(
    normalizeBookingPolicy({ refund_before_deadline_percent: 101 }),
    null,
  );
});

test("calculates the exact credit refund before and after the deadline", () => {
  const policy = {
    ...DEFAULT_BOOKING_POLICY,
    cancellation_notice_hours: 24,
    refund_before_deadline_percent: 75,
    refund_after_deadline_percent: 10,
  };
  const classStart = new Date("2026-10-20T02:00:00.000Z");

  const early = calculateCancellation({
    policy,
    chargedCredits: 101,
    classStart,
    now: new Date("2026-10-18T02:00:00.000Z"),
  });
  const late = calculateCancellation({
    policy,
    chargedCredits: 101,
    classStart,
    now: new Date("2026-10-19T03:00:00.000Z"),
  });

  assert.equal(early.before_deadline, true);
  assert.equal(early.refund_credits, 75);
  assert.equal(late.before_deadline, false);
  assert.equal(late.refund_credits, 10);
});
