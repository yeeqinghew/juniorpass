const toPositiveCredits = (value) => {
  const credits = Number(value);
  return Number.isFinite(credits) && credits > 0 ? Math.ceil(credits) : null;
};

const toPositiveClassCount = (value) => {
  const count = Number(value);
  return Number.isInteger(count) && count > 0 ? count : null;
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

const getPackageCreditCost = (scheduleGroup, packageType) => {
  if (!scheduleGroup) return null;

  if (packageType === "pay-as-you-go") {
    return toPositiveCredits(scheduleGroup.price_payg);
  }

  if (packageType === "full-term") {
    return toPositiveCredits(scheduleGroup.price_fullterm);
  }

  if (packageType === "short-term") {
    const configuredCredits = toPositiveCredits(
      scheduleGroup.price_shortterm,
    );
    if (configuredCredits) return configuredCredits;

    const fullTermCredits = toPositiveCredits(scheduleGroup.price_fullterm);
    const fullTermClasses = getPackageClassCount(scheduleGroup, "full-term");
    const shortTermClasses = getPackageClassCount(scheduleGroup, "short-term");

    if (!fullTermCredits || !fullTermClasses || !shortTermClasses) return null;

    return Math.ceil(
      (fullTermCredits / fullTermClasses) * 1.15 * shortTermClasses,
    );
  }

  return null;
};

module.exports = { getPackageClassCount, getPackageCreditCost };
