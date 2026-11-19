const getPackageTypes = (value) => {
  if (Array.isArray(value)) {
    return value.map(String).map((type) => type.trim()).filter(Boolean);
  }

  if (typeof value !== "string") return [];

  const trimmed = value.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return getPackageTypes(parsed);
    } catch {
      return [];
    }
  }

  return trimmed
    .replace(/^\{?|\}?$/g, "")
    .split(",")
    .map((type) => type.trim().replace(/^['\"]|['\"]$/g, ""))
    .filter(Boolean);
};

module.exports = { getPackageTypes };
