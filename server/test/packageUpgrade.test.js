const test = require("node:test");
const assert = require("node:assert/strict");
const { calculatePackageUpgrade } = require("../utils/packageUpgrade");

test("charges only the outstanding credits for a short-to-full-term upgrade", () => {
  assert.deepEqual(
    calculatePackageUpgrade({
      fullTermCredits: 100,
      chargedCredits: 30,
      partnerCreditedCredits: 30,
      fullTermClasses: 10,
      shortTermClasses: 3,
    }),
    {
      upgradeCredits: 70,
      partnerUpgradeCredits: 70,
      classesToAdd: 7,
      fullTermCredits: 100,
      fullTermClasses: 10,
    },
  );
});

test("uses the actual amount already charged when the short package was promoted", () => {
  assert.equal(
    calculatePackageUpgrade({
      fullTermCredits: 100,
      chargedCredits: 20,
      partnerCreditedCredits: 30,
      fullTermClasses: 10,
      shortTermClasses: 3,
    }).upgradeCredits,
    80,
  );
});

test("rejects invalid or non-incremental upgrades", () => {
  assert.equal(
    calculatePackageUpgrade({
      fullTermCredits: 30,
      chargedCredits: 30,
      partnerCreditedCredits: 30,
      fullTermClasses: 3,
      shortTermClasses: 3,
    }),
    null,
  );
});
