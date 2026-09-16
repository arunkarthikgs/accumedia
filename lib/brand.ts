const HEX_COLOR_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export function normalizeBrandColor(value: unknown, fallback = "#0f766e") {
  if (typeof value === "string" && HEX_COLOR_PATTERN.test(value.trim())) {
    return value.trim().toLowerCase();
  }
  return fallback;
}

export function isBrandColor(value: unknown) {
  return typeof value === "string" && HEX_COLOR_PATTERN.test(value.trim());
}
