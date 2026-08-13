const CREDIT_PRICING_TIERS = [
  { min: 1, max: 10, rateInCents: 1000 },
  { min: 11, max: 30, rateInCents: 975 },
  { min: 31, max: 60, rateInCents: 945 },
  { min: 61, max: null, rateInCents: 905 },
];

function getCreditPricingTier(credits) {
  const quantity = Number(credits);
  if (!Number.isInteger(quantity) || quantity < 1) return null;

  return CREDIT_PRICING_TIERS.find(
    (tier) => quantity >= tier.min && (tier.max === null || quantity <= tier.max),
  );
}

function calculateCreditPrice(credits) {
  const tier = getCreditPricingTier(credits);
  if (!tier) return null;
  return (Number(credits) * tier.rateInCents / 100).toFixed(2);
}

module.exports = { CREDIT_PRICING_TIERS, getCreditPricingTier, calculateCreditPrice };

