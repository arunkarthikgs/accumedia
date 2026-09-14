import { ReactNode } from "react";

export type StatusTone = "pine" | "sage" | "ochre" | "brick" | "muted";

const DOT_COLOR: Record<StatusTone, string> = {
  pine: "bg-pine",
  sage: "bg-sage",
  ochre: "bg-ochre",
  brick: "bg-brick",
  muted: "bg-muted",
};

const TEXT_COLOR: Record<StatusTone, string> = {
  pine: "text-pine-dark",
  sage: "text-sage",
  ochre: "text-ochre",
  brick: "text-brick",
  muted: "text-muted",
};

/**
 * A small status tag: colored dot + label, on a plain hairline-bordered
 * chip — deliberately not a saturated pastel pill. Used for case status,
 * asset status, and safety-flag confidence throughout the admin/case UI so
 * status always reads the same way.
 */
export default function StatusTag({
  tone,
  children,
  icon,
}: {
  tone: StatusTone;
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border border-line bg-surface px-2 py-0.5 text-[11px] font-medium ${TEXT_COLOR[tone]}`}
    >
      {icon || <span className={`h-1.5 w-1.5 rounded-full ${DOT_COLOR[tone]}`} />}
      {children}
    </span>
  );
}
