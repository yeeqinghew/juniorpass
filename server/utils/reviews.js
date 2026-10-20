const REVIEW_WINDOW_DAYS = 30;
const REVIEW_TAGS = Object.freeze([
  "Engaging instructor",
  "Child enjoyed it",
  "Well organised",
  "Good facilities",
  "Suitable for the stated age",
]);

const normalizeReviewInput = ({ rating, comment, tags, attended_at_least_one }) => {
  const normalizedRating = Number(rating);
  const normalizedComment = typeof comment === "string" ? comment.trim() : "";
  const normalizedTags = Array.isArray(tags)
    ? [...new Set(tags.filter((tag) => REVIEW_TAGS.includes(tag)))].slice(0, 5)
    : [];

  if (
    !Number.isInteger(normalizedRating) ||
    normalizedRating < 1 ||
    normalizedRating > 5 ||
    normalizedComment.length > 1000
  ) {
    return null;
  }

  return {
    rating: normalizedRating,
    comment: normalizedComment,
    tags: normalizedTags,
    attendedAtLeastOne:
      typeof attended_at_least_one === "boolean" ? attended_at_least_one : null,
  };
};

module.exports = { REVIEW_WINDOW_DAYS, REVIEW_TAGS, normalizeReviewInput };
