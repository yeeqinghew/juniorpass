const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getPackageClassCount,
  getPackageCreditCost,
} = require("../utils/packageCredits");

test("converts configured dollar prices to whole credits", () => {
  const schedule = {
    price_payg: "42.00",
    price_fullterm: "500.00",
    price_shortterm: "239.59",
  };

  assert.equal(getPackageCreditCost(schedule, "pay-as-you-go", 9.5), 5);
  assert.equal(getPackageCreditCost(schedule, "full-term", 9.5), 53);
  assert.equal(getPackageCreditCost(schedule, "short-term", 9.5), 26);
});

test("derives short-term credits when the stored price is zero", () => {
  const schedule = {
    price_fullterm: "500.00",
    price_shortterm: "0.00",
    full_term_class_count: 12,
    short_term_class_count: 5,
  };

  assert.equal(getPackageCreditCost(schedule, "short-term", 9.5), 26);
});

test("derives the short-term class count and credits when both are missing", () => {
  const schedule = {
    price_fullterm: "500.00",
    price_shortterm: null,
    full_term_class_count: 12,
    short_term_class_count: null,
  };

  assert.equal(getPackageClassCount(schedule, "short-term"), 3);
  assert.equal(getPackageCreditCost(schedule, "short-term", 9.5), 16);
});

test("rejects packages without a valid positive credit cost", () => {
  assert.equal(
    getPackageCreditCost({ price_shortterm: "0.00" }, "short-term", 9.5),
    null,
  );
  assert.equal(getPackageCreditCost({ price_payg: null }, "pay-as-you-go", 9.5), null);
  assert.equal(getPackageCreditCost({}, "unknown", 9.5), null);
});
