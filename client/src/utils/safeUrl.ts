export const safeExternalHttpsUrl = (value: unknown): string | null => {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = new URL(value.trim());
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      !parsed.hostname
    ) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
};
