const PACKAGE_PRICE_FIELDS = {
  "pay-as-you-go": "price_payg",
  "full-term": "price_fullterm",
  "short-term": "price_shortterm",
};
const { getShortTermPrice } = require("./packageCredits");

function getMinimumListingCredits(listing) {
  let outlets = listing?.outlets_info;
  if (typeof outlets === "string") {
    try {
      outlets = JSON.parse(outlets);
    } catch {
      outlets = [];
    }
  }

  const prices = [];
  for (const outlet of Array.isArray(outlets) ? outlets : []) {
    for (const group of Array.isArray(outlet?.schedule_groups)
      ? outlet.schedule_groups
      : []) {
      const rate = Number(group.pricing_dollars_per_credit);
      if (!Number.isFinite(rate) || rate <= 0) continue;

      for (const packageType of Array.isArray(group.package_types)
        ? group.package_types
        : []) {
        const price = Number(
          packageType === "short-term"
            ? getShortTermPrice(group) || group.price_shortterm
            : group[PACKAGE_PRICE_FIELDS[packageType]],
        );
        if (Number.isFinite(price) && price > 0) {
          prices.push(Math.ceil(price / rate));
        }
      }
    }
  }

  return prices.length > 0 ? Math.min(...prices) : null;
}

function withMinimumListingCredits(listing) {
  return listing
    ? { ...listing, credit: getMinimumListingCredits(listing) }
    : listing;
}

module.exports = { getMinimumListingCredits, withMinimumListingCredits };
