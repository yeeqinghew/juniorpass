const test = require("node:test");
const assert = require("node:assert/strict");
const { REVIEW_TAGS, normalizeReviewInput } = require("../utils/reviews");

test("normalizes a valid review and removes unsupported or duplicate tags", () => {
  assert.deepEqual(
    normalizeReviewInput({
      rating: "5",
      comment: "  A thoughtful class.  ",
      tags: [REVIEW_TAGS[0], REVIEW_TAGS[0], "Not allowed"],
      attended_at_least_one: true,
    }),
    {
      rating: 5,
      comment: "A thoughtful class.",
      tags: [REVIEW_TAGS[0]],
      attendedAtLeastOne: true,
    },
  );
});

test("rejects invalid ratings and oversized comments", () => {
  assert.equal(normalizeReviewInput({ rating: 0 }), null);
  assert.equal(normalizeReviewInput({ rating: 6 }), null);
  assert.equal(
    normalizeReviewInput({ rating: 4, comment: "x".repeat(1001) }),
    null,
  );
});
