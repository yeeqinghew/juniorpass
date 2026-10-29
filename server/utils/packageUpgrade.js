const calculatePackageUpgrade = ({
  fullTermCredits,
  chargedCredits,
  partnerCreditedCredits,
  fullTermClasses,
  shortTermClasses,
}) => {
  const fullCredits = Number(fullTermCredits);
  const paidCredits = Number(chargedCredits);
  const partnerCredits = Number(partnerCreditedCredits);
  const fullClasses = Number(fullTermClasses);
  const shortClasses = Number(shortTermClasses);

  if (
    !Number.isInteger(fullCredits) ||
    fullCredits < 1 ||
    !Number.isInteger(paidCredits) ||
    paidCredits < 0 ||
    !Number.isInteger(fullClasses) ||
    !Number.isInteger(shortClasses) ||
    fullClasses <= shortClasses ||
    fullCredits <= paidCredits
  ) {
    return null;
  }

  const settledPartnerCredits = Number.isInteger(partnerCredits)
    ? Math.max(0, partnerCredits)
    : paidCredits;

  return {
    upgradeCredits: fullCredits - paidCredits,
    partnerUpgradeCredits: Math.max(0, fullCredits - settledPartnerCredits),
    classesToAdd: fullClasses - shortClasses,
    fullTermCredits: fullCredits,
    fullTermClasses: fullClasses,
  };
};

module.exports = { calculatePackageUpgrade };
