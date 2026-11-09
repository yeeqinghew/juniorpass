import { useEffect, useState } from "react";
import { API_ENDPOINTS, fetchWithAuth } from "../utils/api";
import type { CreditPricingTier } from "../utils/creditPricing";

type CreditPricingResponse = {
  tiers?: CreditPricingTier[];
  error?: string;
};

const useCreditPricing = () => {
  const [tiers, setTiers] = useState<CreditPricingTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const loadPricing = async () => {
      try {
        const response = await fetchWithAuth(API_ENDPOINTS.GET_CREDIT_PRICING);
        const data = (await response.json()) as CreditPricingResponse;
        if (!response.ok || !Array.isArray(data.tiers) || data.tiers.length === 0) {
          throw new Error(data.error || "Unable to load credit pricing");
        }
        if (active) setTiers(data.tiers);
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load credit pricing",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    loadPricing();
    return () => {
      active = false;
    };
  }, []);

  return { tiers, loading, error };
};

export default useCreditPricing;
