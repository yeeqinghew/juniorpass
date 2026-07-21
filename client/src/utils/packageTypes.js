const PACKAGE_TYPE_ALIASES = {
  "trial-class": "trial",
  "trial-package": "trial",
  payg: "pay-as-you-go",
  "pay-as-you-go-class": "pay-as-you-go",
  "pay-as-you-go-package": "pay-as-you-go",
  "short-term-package": "short-term",
  "full-term-package": "full-term",
};

export const normalisePackageType = (value) => {
  if (value === null || value === undefined) return "";

  const normalised = String(value)
    .trim()
    .replace(/^["']|["']$/g, "")
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/\s+/g, "-");

  return PACKAGE_TYPE_ALIASES[normalised] || normalised;
};

const normalisePackageCollection = (value) => {
  if (Array.isArray(value)) return value;

  if (typeof value !== "string") return [];

  const trimmed = value.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Fall back to parsing PostgreSQL-style array strings below.
    }
  }

  return trimmed
    .replace(/[{}[\]]/g, "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
};

export const getListingPackageTypes = (listing) => {
  const packageTypes = [
    ...normalisePackageCollection(listing?.package_types),
  ];

  if (Array.isArray(listing?.outlets_info)) {
    listing.outlets_info.forEach((outlet) => {
      if (!Array.isArray(outlet?.schedule_groups)) return;

      outlet.schedule_groups.forEach((group) => {
        packageTypes.push(
          ...normalisePackageCollection(group?.package_types),
        );
      });
    });
  }

  return [
    ...new Set(packageTypes.map(normalisePackageType).filter(Boolean)),
  ];
};

export const getPackageTypeLabel = (value) => {
  const packageType = normalisePackageType(value);

  const labels = {
    trial: "Trial class",
    "pay-as-you-go": "Pay as you go",
    "short-term": "Short-term package",
    "full-term": "Full-term package",
  };

  return labels[packageType] || value;
};
