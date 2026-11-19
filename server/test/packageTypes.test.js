const test = require("node:test");
const assert = require("node:assert/strict");
const { getPackageTypes } = require("../utils/packageTypes");

test("normalizes PostgreSQL enum-array strings for package eligibility", () => {
  assert.deepEqual(
    getPackageTypes("{short-term,full-term}"),
    ["short-term", "full-term"],
  );
});

test("preserves API arrays and rejects malformed package collections", () => {
  assert.deepEqual(getPackageTypes(["short-term", "full-term"]), [
    "short-term",
    "full-term",
  ]);
  assert.deepEqual(getPackageTypes(null), []);
  assert.deepEqual(getPackageTypes("[not-json]"), []);
});
