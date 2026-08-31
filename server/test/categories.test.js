const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  parseCategoryIds,
  parseDisplayOrder,
  slugifyCategoryName,
  validateCategoryName,
} = require("../utils/categories");

test("category names are normalized and restricted to catalogue-safe text", () => {
  assert.deepEqual(validateCategoryName("  Arts   & Crafts  "), {
    name: "Arts & Crafts",
  });
  assert.deepEqual(validateCategoryName("<script>alert(1)</script>"), {
    error: "Category name contains unsupported characters",
  });
  assert.deepEqual(validateCategoryName("A"), {
    error: "Category name must be between 2 and 60 characters",
  });
});

test("category slugs and IDs are deterministic", () => {
  assert.equal(slugifyCategoryName("STEM & Coding"), "stem-coding");
  assert.deepEqual(parseCategoryIds(["2", 1, 2]), [2, 1]);
  assert.equal(parseCategoryIds([0, 1]), null);
  assert.equal(parseCategoryIds("1,2"), null);
});

test("category display order accepts only non-negative whole numbers", () => {
  assert.equal(parseDisplayOrder("3"), 3);
  assert.equal(parseDisplayOrder(-1), null);
  assert.equal(parseDisplayOrder(1.5), null);
});

test("category migration preserves legacy assignments without dropping them", () => {
  const migration = fs.readFileSync(
    path.join(__dirname, "../migrations/20260830_normalize_activity_categories.sql"),
    "utf8",
  );

  assert.match(migration, /CREATE TABLE IF NOT EXISTS activity_categories/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS partner_activity_categories/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS listing_activity_categories/);
  assert.match(migration, /UNNEST\(p\.categories\)/);
  assert.doesNotMatch(migration, /DROP TYPE\s+(IF EXISTS\s+)?categories/i);
});
