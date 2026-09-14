import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1c2521",
        paper: "#f7f6f2",
        surface: "#ffffff",
        line: "#ddd9cc",
        muted: "#6b6a5e",
        pine: { DEFAULT: "#1f5c4f", dark: "#163f37", tint: "#e7efec" },
        ochre: { DEFAULT: "#9c6b25", tint: "#f5ecdd" },
        brick: { DEFAULT: "#8b3a3a", tint: "#f4e6e6" },
        sage: { DEFAULT: "#2f6f4e", tint: "#e8f0ea" },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "Georgia", "serif"],
        mono: ["var(--font-plex-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        DEFAULT: "0.5rem",
      },
    },
  },
  plugins: [],
} satisfies Config;
