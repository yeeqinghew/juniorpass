const DEFAULT_BOOKING_POLICY = Object.freeze({
  version: 1,
  cancellation_notice_hours: 24,
  refund_before_deadline_percent: 100,
  refund_after_deadline_percent: 0,
  makeup_allowed: false,
  makeup_notice_hours: 24,
  class_requirements: "",
});

const POLICY_LIMITS = Object.freeze({
  cancellation_notice_hours: { min: 0, max: 720 },
  refund_percent: { min: 0, max: 100 },
  makeup_notice_hours: { min: 0, max: 720 },
  class_requirements: 2000,
});

function toInteger(value, fallback, { min, max }) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

function normalizeBookingPolicy(input = {}, fallback = DEFAULT_BOOKING_POLICY) {
  const policy = {
    version: 1,
    cancellation_notice_hours: toInteger(
      input.cancellation_notice_hours,
      fallback.cancellation_notice_hours,
      POLICY_LIMITS.cancellation_notice_hours,
    ),
    refund_before_deadline_percent: toInteger(
      input.refund_before_deadline_percent,
      fallback.refund_before_deadline_percent,
      POLICY_LIMITS.refund_percent,
    ),
    refund_after_deadline_percent: toInteger(
      input.refund_after_deadline_percent,
      fallback.refund_after_deadline_percent,
      POLICY_LIMITS.refund_percent,
    ),
    makeup_allowed:
      input.makeup_allowed === undefined
        ? fallback.makeup_allowed
        : input.makeup_allowed === true,
    makeup_notice_hours: toInteger(
      input.makeup_notice_hours,
      fallback.makeup_notice_hours,
      POLICY_LIMITS.makeup_notice_hours,
    ),
    class_requirements: String(
      input.class_requirements ?? fallback.class_requirements ?? "",
    ).trim(),
  };

  if (
    Object.values(policy).some((value) => value === null) ||
    policy.class_requirements.length > POLICY_LIMITS.class_requirements
  ) {
    return null;
  }

  return policy;
}

function bookingPolicyFromListing(listing) {
  return normalizeBookingPolicy(listing) || { ...DEFAULT_BOOKING_POLICY };
}

function bookingPolicyFromSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return { ...DEFAULT_BOOKING_POLICY };
  }
  return normalizeBookingPolicy(snapshot) || { ...DEFAULT_BOOKING_POLICY };
}

function calculateCancellation({ policy, chargedCredits, classStart, now = new Date() }) {
  const normalizedPolicy = bookingPolicyFromSnapshot(policy);
  const start = new Date(classStart);
  const currentTime = new Date(now);

  if (Number.isNaN(start.getTime()) || Number.isNaN(currentTime.getTime())) {
    throw new Error("Invalid cancellation date");
  }

  const deadline = new Date(
    start.getTime() -
      normalizedPolicy.cancellation_notice_hours * 60 * 60 * 1000,
  );
  const beforeDeadline = currentTime <= deadline;
  const refundPercent = beforeDeadline
    ? normalizedPolicy.refund_before_deadline_percent
    : normalizedPolicy.refund_after_deadline_percent;
  const credits = Math.max(0, Number(chargedCredits) || 0);

  return {
    cancellation_deadline: deadline,
    before_deadline: beforeDeadline,
    refund_percent: refundPercent,
    refund_credits: Math.floor((credits * refundPercent) / 100),
  };
}

module.exports = {
  DEFAULT_BOOKING_POLICY,
  POLICY_LIMITS,
  normalizeBookingPolicy,
  bookingPolicyFromListing,
  bookingPolicyFromSnapshot,
  calculateCancellation,
};
