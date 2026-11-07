const test = require("node:test");
const assert = require("node:assert/strict");
const { calculateCreditPrice } = require("../utils/creditPricing");

test("calculates every tier boundary using the server-owned rate", () => {
  assert.equal(calculateCreditPrice(1), "12.00");
  assert.equal(calculateCreditPrice(10), "120.00");
  assert.equal(calculateCreditPrice(11), "110.00");
  assert.equal(calculateCreditPrice(20), "200.00");
  assert.equal(calculateCreditPrice(21), "204.75");
  assert.equal(calculateCreditPrice(30), "292.50");
  assert.equal(calculateCreditPrice(31), "291.40");
  assert.equal(calculateCreditPrice(61), "573.40");
});

test("rejects invalid credit quantities", () => {
  assert.equal(calculateCreditPrice(0), null);
  assert.equal(calculateCreditPrice(-1), null);
  assert.equal(calculateCreditPrice(1.5), null);
  assert.equal(calculateCreditPrice("not-a-number"), null);
});
