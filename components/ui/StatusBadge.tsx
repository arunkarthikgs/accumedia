import { CheckCircle2, Clock, AlertTriangle, XCircle } from "lucide-react";
import type { ReactNode } from "react";

export type CaseStatusVariant = "approved" | "pending" | "flagged" | "rejected";

const VARIANT_STYLES: Record<CaseStatusVariant, { bg: string; text: string; icon: ReactNode }> = {
  approved: {
    bg: "bg-sage-tint",
    text: "text-sage",
    icon: <CheckCircle2 className="h-5 w-5" />,
  },
  pending: {
    bg: "bg-ochre-tint",
    text: "text-ochre",
    icon: <Clock className="h-5 w-5" />,
  },
  flagged: {
    bg: "bg-brick-tint",
    text: "text-brick",
    icon: <AlertTriangle className="h-5 w-5" />,
  },
  rejected: {
    bg: "bg-slate-100",
    text: "text-muted",
    icon: <XCircle className="h-5 w-5" />,
  },
};

export default function StatusBadge({
  variant,
  children,
}: {
  variant: CaseStatusVariant;
  children: ReactNode;
}) {
  const style = VARIANT_STYLES[variant];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap ${style.bg} ${style.text}`}
    >
      {style.icon}
      {children}
    </span>
  );
}
