const CATEGORY_NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}\s&'()+,./-]*$/u;

function normalizeCategoryName(value) {
  if (typeof value !== "string") return null;
  return value.trim().replace(/\s+/g, " ");
}

function validateCategoryName(value) {
  const name = normalizeCategoryName(value);
  if (!name) return { error: "Category name is required" };
  if (name.length < 2 || name.length > 60) {
    return { error: "Category name must be between 2 and 60 characters" };
  }
  if (!CATEGORY_NAME_PATTERN.test(name)) {
    return { error: "Category name contains unsupported characters" };
  }
  return { name };
}

function slugifyCategoryName(name) {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseCategoryIds(value) {
  if (!Array.isArray(value)) return null;

  const ids = value.map(Number);
  if (ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) return null;
  return [...new Set(ids)];
}

function parseDisplayOrder(value) {
  const order = Number(value);
  if (!Number.isSafeInteger(order) || order < 0) return null;
  return order;
}

module.exports = {
  normalizeCategoryName,
  parseCategoryIds,
  parseDisplayOrder,
  slugifyCategoryName,
  validateCategoryName,
};
