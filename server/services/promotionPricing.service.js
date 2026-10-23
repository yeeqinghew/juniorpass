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
              SELECT 1
              FROM bookings previous_booking
              JOIN listings previous_listing
                ON previous_listing.listing_id = previous_booking.listing_id
              WHERE previous_booking.user_id = $1
                AND previous_listing.partner_id = p.partner_id
            ) AS is_existing_customer,
            EXISTS (
              SELECT 1 FROM promotion_redemptions previous_redemption
              WHERE previous_redemption.promotion_id = p.promotion_id
                AND previous_redemption.user_id = $1
            ) AS already_redeemed
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
      if (promotion.already_redeemed) return false;
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
  return {
    promotion,
    chargedCredits,
    partnerCreditedCredits:
      promotion.funded_by === "platform" ? standardCredits : chargedCredits,
  };
};

module.exports = { getEligiblePromotion, getPromotionPrice };
