const PHONE_PATTERN = /^[+0-9()\-\s]{7,30}$/;

function normalizeText(value, maxLength) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function normalizeAuthorizedPickups(value) {
  if (!Array.isArray(value)) return null;

  const pickups = value.map((pickup) => ({
    name: normalizeText(pickup?.name, 100),
    relationship: normalizeText(pickup?.relationship, 60),
    phone: normalizeText(pickup?.phone, 30),
  }));

  if (
    pickups.length < 1 ||
    pickups.length > 10 ||
    pickups.some(
      (pickup) =>
        !pickup.name ||
        !pickup.relationship ||
        !pickup.phone ||
        !PHONE_PATTERN.test(pickup.phone),
    )
  ) {
    return null;
  }

  return pickups;
}

function getSafetyDetails(body) {
  const emergencyContactName = normalizeText(body.emergency_contact_name, 100);
  const emergencyContactRelationship = normalizeText(
    body.emergency_contact_relationship,
    60,
  );
  const emergencyContactPhone = normalizeText(body.emergency_contact_phone, 30);
  const authorizedPickups = normalizeAuthorizedPickups(body.authorized_pickups);

  if (
    !emergencyContactName ||
    !emergencyContactRelationship ||
    !emergencyContactPhone ||
    !PHONE_PATTERN.test(emergencyContactPhone) ||
    !authorizedPickups
  ) {
    return null;
  }

  return {
    emergencyContactName,
    emergencyContactRelationship,
    emergencyContactPhone,
    authorizedPickups,
  };
}

module.exports = {
  getSafetyDetails,
  normalizeText,
};
