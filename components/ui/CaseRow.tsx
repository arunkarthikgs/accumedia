import { Stethoscope, AlertTriangle, Mic } from "lucide-react";
import StatusBadge, { CaseStatusVariant } from "./StatusBadge";

const AVATAR_TONE: Record<CaseStatusVariant, string> = {
  approved: "bg-sage-tint text-sage",
  pending: "bg-ochre-tint text-ochre",
  flagged: "bg-brick-tint text-brick",
  rejected: "bg-slate-100 text-muted",
};

function initials(name: string) {
  return name
    .replace(/^Dr\.?\s*/i, "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

export default function CaseRow({
  title,
  physician,
  specialty,
  status,
  flagDetail,
  statusLabel,
  sourceLabel,
  sourceIcon,
}: {
  title: string;
  physician: string;
  specialty: string;
  status: CaseStatusVariant;
  flagDetail?: string;
  statusLabel: string;
  sourceLabel?: string;
  sourceIcon?: React.ReactNode;
}) {
  return (
    <div
      className={`flex items-center gap-4 rounded-lg border border-line bg-surface p-4 transition hover:border-pine/50 ${
        status === "flagged" ? "ring-1 ring-brick/30" : ""
      }`}
    >
      <div
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold ${AVATAR_TONE[status]}`}
        style={{ fontFamily: "var(--font-serif)" }}
      >
        {initials(physician)}
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm text-ink truncate">{title}</p>
        {flagDetail ? (
          <p className="text-xs text-brick mt-1 flex items-center gap-1.5">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            {flagDetail}
          </p>
        ) : (
          <p className="text-xs text-muted mt-1 flex items-center gap-1.5">
            <Stethoscope className="h-5 w-5 shrink-0" />
            {physician} · {specialty}
          </p>
        )}
      </div>

      {sourceLabel && (
        <span className="hidden sm:flex items-center gap-2 text-xs text-muted shrink-0">
          {sourceIcon === undefined ? <Mic className="h-5 w-5" /> : sourceIcon}
          {sourceLabel}
        </span>
      )}

      <StatusBadge variant={status}>{statusLabel}</StatusBadge>
    </div>
  );
}
