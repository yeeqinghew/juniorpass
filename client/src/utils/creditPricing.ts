export type CreditPricingTier = Readonly<{
  min: number;
  max: number | null;
  rate: number;
  label: string;
  recommended?: boolean;
}>;

export const CREDIT_PRICING_TIERS: readonly CreditPricingTier[] = [
  { min: 1, max: 10, rate: 10, label: "1-10 credits" },
  {
    min: 11,
    max: 30,
    rate: 9.75,
    label: "11-30 credits",
    recommended: true,
  },
  { min: 31, max: 60, rate: 9.45, label: "31-60 credits" },
  { min: 61, max: null, rate: 9.05, label: "61+ credits" },
];

export const getCreditPricingTier = (
  credits: unknown,
): CreditPricingTier | null => {
  const quantity = Number(credits);
  if (!Number.isInteger(quantity) || quantity < 1) return null;

  return (
    CREDIT_PRICING_TIERS.find(
      (tier) =>
        quantity >= tier.min &&
        (tier.max === null || quantity <= tier.max),
    ) ?? null
  );
};

export const calculateCreditPrice = (credits: unknown): number => {
  const tier = getCreditPricingTier(credits);
  return tier ? Number((Number(credits) * tier.rate).toFixed(2)) : 0;
};
