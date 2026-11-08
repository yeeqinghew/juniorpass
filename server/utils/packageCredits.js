const dollarsToCredits = (value, dollarsPerCredit) => {
  const dollars = Number(value);
  const rate = Number(dollarsPerCredit);
  return Number.isFinite(dollars) &&
    dollars > 0 &&
    Number.isFinite(rate) &&
    rate > 0
    ? Math.ceil(dollars / rate)
    : null;
};

const toPositiveClassCount = (value) => {
  const count = Number(value);
  return Number.isInteger(count) && count > 0 ? count : null;
};

const getShortTermPrice = (scheduleGroup) => {
  const fullTermDollars = Number(scheduleGroup?.price_fullterm);
  const fullTermClasses = getPackageClassCount(scheduleGroup, "full-term");
  const shortTermClasses = getPackageClassCount(scheduleGroup, "short-term");

  if (!fullTermDollars || !fullTermClasses || !shortTermClasses) return null;

  return Math.ceil(
    (fullTermDollars / fullTermClasses) * 1.15 * shortTermClasses * 100,
  ) / 100;
};

const getPackageClassCount = (scheduleGroup, packageType) => {
  if (!scheduleGroup) return null;

  if (packageType === "pay-as-you-go") return 1;

  const fullTermClasses = toPositiveClassCount(
    scheduleGroup.full_term_class_count,
  );

  if (packageType === "full-term") return fullTermClasses;

  if (packageType === "short-term") {
    return (
      toPositiveClassCount(scheduleGroup.short_term_class_count) ||
      (fullTermClasses ? Math.ceil(fullTermClasses * 0.25) : null)
    );
  }

  return null;
};

const getPackageCreditCost = (scheduleGroup, packageType, dollarsPerCredit) => {
  if (!scheduleGroup) return null;

  if (packageType === "pay-as-you-go") {
    return dollarsToCredits(scheduleGroup.price_payg, dollarsPerCredit);
  }

  if (packageType === "full-term") {
    return dollarsToCredits(scheduleGroup.price_fullterm, dollarsPerCredit);
  }

  if (packageType === "short-term") {
    const calculatedPrice = getShortTermPrice(scheduleGroup);
    if (calculatedPrice) return dollarsToCredits(calculatedPrice, dollarsPerCredit);

    // Retain bookability for legacy schedules that predate full-term details.
    return dollarsToCredits(scheduleGroup.price_shortterm, dollarsPerCredit);
  }

  return null;
};

module.exports = {
  dollarsToCredits,
  getPackageClassCount,
  getShortTermPrice,
  getPackageCreditCost,
};
