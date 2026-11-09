export type CreditPricingTier = Readonly<{
  key?: string;
  min: number;
  max: number | null;
  rate: number;
  label: string;
  recommended?: boolean;
}>;

export const CREDIT_PRICING_TIERS: readonly CreditPricingTier[] = [
  { min: 1, max: 10, rate: 12, label: "1-10 credits" },
  {
    min: 11,
    max: 20,
    rate: 10,
    label: "11-20 credits",
    recommended: true,
  },
  { min: 21, max: 30, rate: 9.75, label: "21-30 credits" },
  { min: 31, max: null, rate: 9.4, label: "31+ credits" },
];

export const getCreditPricingTier = (
  credits: unknown,
  tiers: readonly CreditPricingTier[] = CREDIT_PRICING_TIERS,
): CreditPricingTier | null => {
  const quantity = Number(credits);
  if (!Number.isInteger(quantity) || quantity < 1) return null;

  return (
    tiers.find(
      (tier) =>
        quantity >= tier.min && (tier.max === null || quantity <= tier.max),
    ) ?? null
  );
};

export const calculateCreditPrice = (
  credits: unknown,
  tiers: readonly CreditPricingTier[] = CREDIT_PRICING_TIERS,
): number => {
  const tier = getCreditPricingTier(credits, tiers);
  return tier ? Number((Number(credits) * tier.rate).toFixed(2)) : 0;
};
