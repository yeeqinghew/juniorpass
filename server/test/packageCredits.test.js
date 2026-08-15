const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getPackageClassCount,
  getPackageCreditCost,
} = require("../utils/packageCredits");

test("returns configured package prices as whole credits", () => {
  const schedule = {
    price_payg: "42.00",
    price_fullterm: "500.00",
    price_shortterm: "239.59",
  };

  assert.equal(getPackageCreditCost(schedule, "pay-as-you-go"), 42);
  assert.equal(getPackageCreditCost(schedule, "full-term"), 500);
  assert.equal(getPackageCreditCost(schedule, "short-term"), 240);
});

test("derives short-term credits when the stored price is zero", () => {
  const schedule = {
    price_fullterm: "500.00",
    price_shortterm: "0.00",
    full_term_class_count: 12,
    short_term_class_count: 5,
  };

  assert.equal(getPackageCreditCost(schedule, "short-term"), 240);
});

test("derives the short-term class count and credits when both are missing", () => {
  const schedule = {
    price_fullterm: "500.00",
    price_shortterm: null,
    full_term_class_count: 12,
    short_term_class_count: null,
  };

  assert.equal(getPackageClassCount(schedule, "short-term"), 3);
  assert.equal(getPackageCreditCost(schedule, "short-term"), 144);
});

test("rejects packages without a valid positive credit cost", () => {
  assert.equal(
    getPackageCreditCost({ price_shortterm: "0.00" }, "short-term"),
    null,
  );
  assert.equal(getPackageCreditCost({ price_payg: null }, "pay-as-you-go"), null);
  assert.equal(getPackageCreditCost({}, "unknown"), null);
});
