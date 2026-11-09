const CREDIT_PRICING_TIERS = [
  { key: "parent_credit_rate_1_10", min: 1, max: 10, rateInCents: 1200 },
  { key: "parent_credit_rate_11_20", min: 11, max: 20, rateInCents: 1000 },
  { key: "parent_credit_rate_21_30", min: 21, max: 30, rateInCents: 975 },
  { key: "parent_credit_rate_31_plus", min: 31, max: null, rateInCents: 940 },
];

const CREDIT_PRICING_SETTING_KEYS = CREDIT_PRICING_TIERS.map((tier) => tier.key);

async function getActiveCreditPricingTiers(db, effectiveAt = new Date()) {
  const result = await db.query(
    `SELECT DISTINCT ON (setting_key) setting_key, new_value
     FROM platform_setting_history
     WHERE setting_key = ANY($1::text[])
       AND effective_from <= $2
     ORDER BY setting_key, effective_from DESC, history_id DESC`,
    [CREDIT_PRICING_SETTING_KEYS, effectiveAt],
  );
  const activeRates = new Map(
    result.rows.map((row) => [
      row.setting_key,
      Math.round(Number(row.new_value) * 100),
    ]),
  );

  return CREDIT_PRICING_TIERS.map((tier) => ({
    ...tier,
    rateInCents: activeRates.get(tier.key) || tier.rateInCents,
  }));
}

function getCreditPricingTier(credits, tiers = CREDIT_PRICING_TIERS) {
  const quantity = Number(credits);
  if (!Number.isInteger(quantity) || quantity < 1) return null;

  return tiers.find(
    (tier) => quantity >= tier.min && (tier.max === null || quantity <= tier.max),
  );
}

function calculateCreditPrice(credits, tiers = CREDIT_PRICING_TIERS) {
  const tier = getCreditPricingTier(credits, tiers);
  if (!tier) return null;
  return (Number(credits) * tier.rateInCents / 100).toFixed(2);
}

function serializeCreditPricingTiers(tiers) {
  return tiers.map((tier, index) => ({
    key: tier.key,
    min: tier.min,
    max: tier.max,
    rate: tier.rateInCents / 100,
    label: tier.max === null ? `${tier.min}+ credits` : `${tier.min}-${tier.max} credits`,
    recommended: index === 1,
  }));
}

module.exports = {
  CREDIT_PRICING_SETTING_KEYS,
  CREDIT_PRICING_TIERS,
  getActiveCreditPricingTiers,
  getCreditPricingTier,
  calculateCreditPrice,
  serializeCreditPricingTiers,
};

