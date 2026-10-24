const getEligiblePromotion = async (
  queryable,
  { userId, scheduleGroupId, packageType, standardCredits, lock = false },
) => {
  if (lock) {
    await queryable.query(
      `SELECT promotion_id FROM promotions
       WHERE schedule_group_id = $1 AND package_type = $2
         AND status = 'approved'
         AND NOW() BETWEEN starts_at AND ends_at
       ORDER BY created_at ASC
       FOR UPDATE`,
      [scheduleGroupId, packageType],
    );
  }
  const result = await queryable.query(
    `SELECT p.*,
            (
              SELECT COUNT(*)::integer FROM promotion_redemptions pr
              WHERE pr.promotion_id = p.promotion_id
            ) AS redemption_count,
            EXISTS (
              SELECT 1 FROM promotion_allowed_users pau
              WHERE pau.promotion_id = p.promotion_id AND pau.user_id = $1
            ) AS is_selected,
            EXISTS (
              SELECT 1 FROM bookings previous_booking
              WHERE previous_booking.user_id = $1
                AND previous_booking.status IN ('confirmed', 'completed')
            ) AS is_existing_customer,
            (
              SELECT COUNT(*)::integer FROM promotion_redemptions previous_redemption
              WHERE previous_redemption.promotion_id = p.promotion_id
                AND previous_redemption.user_id = $1
            ) AS user_redemption_count
     FROM promotions p
     WHERE p.schedule_group_id = $2
       AND p.package_type = $3
       AND p.status = 'approved'
       AND NOW() BETWEEN p.starts_at AND p.ends_at
     ORDER BY p.created_at ASC`,
    [userId, scheduleGroupId, packageType],
  );

  return (
    result.rows.find((promotion) => {
      if (
        Number(promotion.user_redemption_count) >=
        Number(promotion.per_user_redemption_limit)
      ) return false;
      if (Number(promotion.redemption_count) >= Number(promotion.max_redemptions)) {
        return false;
      }
      if (Number(promotion.promotional_credit_cost) >= Number(standardCredits)) {
        return false;
      }
      if (promotion.eligibility === "selected_users") return promotion.is_selected;
      if (promotion.eligibility === "first_time_customer") {
        return !promotion.is_existing_customer;
      }
      return promotion.eligibility === "everyone";
    }) || null
  );
};

const getPromotionPrice = async (queryable, options) => {
  const promotion = await getEligiblePromotion(queryable, options);
  const standardCredits = Number(options.standardCredits);
  if (!promotion) {
    return {
      promotion: null,
      chargedCredits: standardCredits,
      partnerCreditedCredits: standardCredits,
    };
  }

  const chargedCredits = Number(promotion.promotional_credit_cost);
  const discountCredits = standardCredits - chargedCredits;
  const platformFundingPercentage =
    promotion.funded_by === "platform"
      ? 100
      : promotion.funded_by === "shared"
        ? Number(promotion.platform_funding_percentage)
        : 0;
  return {
    promotion,
    chargedCredits,
    partnerCreditedCredits: Math.min(
      standardCredits,
      chargedCredits + Math.round(discountCredits * platformFundingPercentage / 100),
    ),
  };
};

module.exports = { getEligiblePromotion, getPromotionPrice };
