import type { ReactNode } from "react";

/**
 * Compact paper surfaces with restrained semantic accents.
 */
const TONE_STYLES: Record<string, { bg: string; text: string }> = {
  neutral: { bg: "bg-surface", text: "text-pine" },
  success: { bg: "bg-sage-tint", text: "text-sage" },
  warning: { bg: "bg-ochre-tint", text: "text-ochre" },
  danger: { bg: "bg-brick-tint", text: "text-brick" },
  pro: { bg: "bg-pine-tint", text: "text-pine" },
};

export default function MetricCard({
  label,
  value,
  description,
  tone = "neutral",
  icon,
}: {
  label: string;
  value: ReactNode;
  description?: string;
  tone?: "neutral" | "success" | "warning" | "danger" | "pro";
  icon?: ReactNode;
}) {
  const style = TONE_STYLES[tone];
  return (
    <div
      className={`rounded-lg border border-line ${style.bg} p-5`}
    >
      {icon && <div className={`mb-2.5 ${style.text}`}>{icon}</div>}
      <p
        className={`text-3xl font-bold ${style.text}`}
        style={{ fontFamily: "var(--font-serif)" }}
      >
        {value}
      </p>
      <p className="text-sm font-semibold text-ink mt-2">{label}</p>
      {description && <p className="text-xs text-muted mt-1">{description}</p>}
    </div>
  );
}
