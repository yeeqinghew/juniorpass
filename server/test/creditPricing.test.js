const test = require("node:test");
const assert = require("node:assert/strict");
const { calculateCreditPrice } = require("../utils/creditPricing");

test("calculates every tier boundary using the server-owned rate", () => {
  assert.equal(calculateCreditPrice(1), "10.00");
  assert.equal(calculateCreditPrice(10), "100.00");
  assert.equal(calculateCreditPrice(11), "107.25");
  assert.equal(calculateCreditPrice(30), "292.50");
  assert.equal(calculateCreditPrice(31), "292.95");
  assert.equal(calculateCreditPrice(60), "567.00");
  assert.equal(calculateCreditPrice(61), "552.05");
});

test("rejects invalid credit quantities", () => {
  assert.equal(calculateCreditPrice(0), null);
  assert.equal(calculateCreditPrice(-1), null);
  assert.equal(calculateCreditPrice(1.5), null);
  assert.equal(calculateCreditPrice("not-a-number"), null);
});
