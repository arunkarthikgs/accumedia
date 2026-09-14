# Add this to your real tailwind.config.ts

Do NOT replace your tailwind.config.ts — just add a `colors` key inside
its existing `theme.extend`. If it currently looks like:

```ts
import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: { extend: {} },
  plugins: [],
};
export default config;
```

Change `theme: { extend: {} }` to:

```ts
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
  },
},
```

Without this, every `bg-pine`, `text-ochre`, `border-brick`, etc. class in
the admin/cases, admin/safety-queue, and cases/[id]/assets pages will
silently do nothing — no error, the classes just won't generate any CSS.
