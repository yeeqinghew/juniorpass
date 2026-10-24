const test = require("node:test");
const assert = require("node:assert/strict");
const { getPromotionPrice } = require("../services/promotionPricing.service");

const queryableWith = (rows) => ({
  query: async () => ({ rows }),
});

test("uses the standard price when no eligible promotion exists", async () => {
  const pricing = await getPromotionPrice(queryableWith([]), {
    userId: "user-1",
    scheduleGroupId: "schedule-1",
    packageType: "full-term",
    standardCredits: 50,
  });

  assert.equal(pricing.promotion, null);
  assert.equal(pricing.chargedCredits, 50);
  assert.equal(pricing.partnerCreditedCredits, 50);
});

test("platform funding charges the parent less while preserving partner settlement", async () => {
  const pricing = await getPromotionPrice(
    queryableWith([
      {
        promotion_id: "promotion-1",
        promotional_credit_cost: 40,
        funded_by: "platform",
        eligibility: "everyone",
        redemption_count: 2,
        max_redemptions: 10,
        user_redemption_count: 0,
        per_user_redemption_limit: 1,
      },
    ]),
    {
      userId: "user-1",
      scheduleGroupId: "schedule-1",
      packageType: "full-term",
      standardCredits: 50,
    },
  );

  assert.equal(pricing.chargedCredits, 40);
  assert.equal(pricing.partnerCreditedCredits, 50);
});

test("partner funding uses the promotional credits for charge and settlement", async () => {
  const pricing = await getPromotionPrice(
    queryableWith([
      {
        promotion_id: "promotion-1",
        promotional_credit_cost: 40,
        funded_by: "partner",
        eligibility: "selected_users",
        is_selected: true,
        redemption_count: 0,
        max_redemptions: 1,
        user_redemption_count: 0,
        per_user_redemption_limit: 1,
      },
    ]),
    {
      userId: "user-1",
      scheduleGroupId: "schedule-1",
      packageType: "full-term",
      standardCredits: 50,
    },
  );

  assert.equal(pricing.chargedCredits, 40);
  assert.equal(pricing.partnerCreditedCredits, 40);
});

test("does not apply exhausted or already redeemed promotions", async () => {
  const pricing = await getPromotionPrice(
    queryableWith([
      {
        promotional_credit_cost: 40,
        funded_by: "partner",
        eligibility: "everyone",
        redemption_count: 10,
        max_redemptions: 10,
        user_redemption_count: 0,
        per_user_redemption_limit: 1,
      },
      {
        promotional_credit_cost: 35,
        funded_by: "partner",
        eligibility: "everyone",
        redemption_count: 0,
        max_redemptions: 10,
        user_redemption_count: 1,
        per_user_redemption_limit: 1,
      },
    ]),
    {
      userId: "user-1",
      scheduleGroupId: "schedule-1",
      packageType: "full-term",
      standardCredits: 50,
    },
  );

  assert.equal(pricing.promotion, null);
  assert.equal(pricing.chargedCredits, 50);
});

test("shared funding splits the discount using the configured platform share", async () => {
  const pricing = await getPromotionPrice(queryableWith([{
    promotion_id: "promotion-1",
    promotional_credit_cost: 40,
    funded_by: "shared",
    platform_funding_percentage: 50,
    eligibility: "everyone",
    redemption_count: 0,
    max_redemptions: 10,
    user_redemption_count: 0,
    per_user_redemption_limit: 2,
  }]), {
    userId: "user-1", scheduleGroupId: "schedule-1",
    packageType: "full-term", standardCredits: 50,
  });
  assert.equal(pricing.chargedCredits, 40);
  assert.equal(pricing.partnerCreditedCredits, 45);
});
