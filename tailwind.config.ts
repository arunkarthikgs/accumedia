import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "var(--ink)",
        paper: "var(--paper)",
        surface: "var(--surface)",
        line: "var(--line)",
        muted: "var(--muted)",
        plum: {
          50: "#faf4f8",
          100: "#f1e2ec",
          200: "#e2c4d6",
          600: "#9a3f78",
          700: "#7d3162",
          800: "#632650",
          900: "#4a1c3c",
        },
        pine: { DEFAULT: "var(--pine)", dark: "var(--pine-dark)", tint: "var(--pine-tint)" },
        ochre: { DEFAULT: "var(--ochre)", tint: "var(--ochre-tint)" },
        brick: { DEFAULT: "var(--brick)", tint: "var(--brick-tint)" },
        sage: { DEFAULT: "#2f6f4e", tint: "#e8f0ea" },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "Georgia", "serif"],
        mono: ["var(--font-plex-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        DEFAULT: "8px",
        lg: "8px",
        xl: "8px",
        "2xl": "8px",
        "3xl": "8px",
      },
    },
  },
  plugins: [],
} satisfies Config;
