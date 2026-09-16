"use client";

import { useEffect } from "react";

const HEX_COLOR_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export default function BrandTheme() {
  useEffect(() => {
    fetch("/api/auth/me", { credentials: "same-origin" })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        const color = data?.user?.organizationBrandingHex;
        if (typeof color !== "string" || !HEX_COLOR_PATTERN.test(color)) return;
        const root = document.documentElement;
        root.style.setProperty("--pine", color);
        root.style.setProperty("--pine-dark", `color-mix(in srgb, ${color} 78%, #000)`);
        root.style.setProperty("--pine-tint", `color-mix(in srgb, ${color} 12%, #fff)`);
      })
      .catch(() => undefined);
  }, []);

  return null;
}
