"use client";

import { useEffect } from "react";

const HEX_COLOR_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export default function BrandTheme({ initialBrandingHex }: { initialBrandingHex: string | null }) {
  useEffect(() => {
    if (typeof initialBrandingHex !== "string" || !HEX_COLOR_PATTERN.test(initialBrandingHex)) return;
    const root = document.documentElement;
    root.style.setProperty("--pine", initialBrandingHex);
    root.style.setProperty("--pine-dark", `color-mix(in srgb, ${initialBrandingHex} 78%, #000)`);
    root.style.setProperty("--pine-tint", `color-mix(in srgb, ${initialBrandingHex} 12%, #fff)`);
  }, [initialBrandingHex]);

  return null;
}
