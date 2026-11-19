class ContentSecurityValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ContentSecurityValidationError";
  }
}

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

function normalizeExternalWebsite(value) {
  if (value === undefined || value === null) return value;
  if (typeof value !== "string") {
    throw new ContentSecurityValidationError("Website must be a URL");
  }

  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.length > 1000) {
    throw new ContentSecurityValidationError("Website URL is too long");
  }

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new ContentSecurityValidationError(
      "Website must be a complete HTTPS URL",
    );
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    !parsed.hostname
  ) {
    throw new ContentSecurityValidationError(
      "Website must use HTTPS and cannot contain credentials",
    );
  }

  return parsed.toString();
}

function normalizeCloudinaryImageUrl(value, cloudName = process.env.CLOUDINARY_CLOUD_NAME) {
  if (typeof value !== "string" || !value.trim()) {
    throw new ContentSecurityValidationError("Image URL is required");
  }
  if (!cloudName) {
    throw new ContentSecurityValidationError(
      "Image storage is not configured",
    );
  }

  let parsed;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new ContentSecurityValidationError("Image URL is invalid");
  }

  const pathParts = parsed.pathname.split("/").filter(Boolean);
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== "res.cloudinary.com" ||
    pathParts[0] !== cloudName ||
    pathParts[1] !== "image" ||
    pathParts[2] !== "upload"
  ) {
    throw new ContentSecurityValidationError(
      "Images must come from the configured Junior Pass image storage",
    );
  }

  return parsed.toString();
}

function normalizeCloudinaryImageList(
  value,
  { allowEmpty = true, maximum = 20, cloudName } = {},
) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    throw new ContentSecurityValidationError(
      allowEmpty ? "Images must be an array" : "At least one image is required",
    );
  }
  if (value.length > maximum) {
    throw new ContentSecurityValidationError(
      `No more than ${maximum} images are allowed`,
    );
  }
  return value.map((image) => normalizeCloudinaryImageUrl(image, cloudName));
}

module.exports = {
  ContentSecurityValidationError,
  escapeHtml,
  normalizeExternalWebsite,
  normalizeCloudinaryImageUrl,
  normalizeCloudinaryImageList,
};
