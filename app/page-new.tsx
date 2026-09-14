import Link from "next/link";
import { db } from "@/lib/db";
import {
  Activity,
  PlusCircle,
  FolderKanban,
  Building2,
  ShieldCheck,
  ArrowRight,
  FileText,
  Mic,
  FileEdit,
} from "lucide-react";
import MetricCard from "@/components/ui/MetricCard";
import CaseRow from "@/components/ui/CaseRow";
import type { CaseStatusVariant } from "@/components/ui/StatusBadge";

export const dynamic = "force-dynamic";

/**
 * Maps a case's real status + open safety flags to the CaseRow's display
 * variant. "flagged" is new — it wasn't in the original file, since the
 * SafetyFlag table didn't exist yet. An open flag takes visual priority
 * over the underlying PENDING_REVIEW/APPROVED status.
 */
function toDisplayVariant(
  status: string,
  openFlagCount: number
): { variant: CaseStatusVariant; label: string } {
  if (openFlagCount > 0) return { variant: "flagged", label: "Flagged" };
  if (status === "APPROVED") return { variant: "approved", label: "Approved" };
  if (status === "REJECTED") return { variant: "rejected", label: "Rejected" };
  return { variant: "pending", label: "Pending review" };
}

export default async function DashboardPage() {
  const [totalCases, pendingCases, approvedCases, rejectedCases, recentCases, orgCount] =
    await Promise.all([
      db.case.count(),
      db.case.count({ where: { status: "PENDING_REVIEW" } }),
      db.case.count({ where: { status: "APPROVED" } }),
      db.case.count({ where: { status: "REJECTED" } }),
      db.case.findMany({
        take: 6,
        orderBy: { createdAt: "desc" },
        include: {
          organization: { select: { name: true } },
          physician: { select: { name: true, specialty: true } },
          recordings: { select: { id: true, durationSeconds: true } },
          safetyFlags: { where: { status: "OPEN" }, select: { detail: true } },
        },
      }),
      db.organization.count(),
    ]);

  return (
    <main className="mx-auto max-w-7xl p-8 space-y-8">
      {/* Hero / Quick Action Banner — unchanged from the original */}
      <div className="rounded-3xl border border-teal-100 bg-gradient-to-br from-teal-900 via-teal-800 to-slate-900 p-8 text-white shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-teal-500/20 px-3 py-1 text-xs font-semibold text-teal-300 border border-teal-400/30">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>NMC Supervised Clinical Intelligence &amp; DPDP Governance</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white">
              Clinical Narrative Ingestion &amp; Governance
            </h1>
            <p className="text-sm text-teal-100 leading-relaxed">
              Capture dictations, run multi-model speech-to-text, synthesize structured master
              clinical records, and conduct compliance reviews across connected hospital networks.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <Link
              href="/cases/new"
              className="flex items-center gap-2 rounded-2xl bg-teal-400 px-5 py-3 text-xs font-bold text-slate-950 shadow-md hover:bg-teal-300 transition"
            >
              <PlusCircle className="h-4 w-4" />
              <span>Start Dictation</span>
            </Link>
            <Link
              href="/admin/cases"
              className="flex items-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-5 py-3 text-xs font-bold text-white hover:bg-white/20 backdrop-blur-xs transition"
            >
              <FolderKanban className="h-4 w-4" />
              <span>Manage Cases</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Metrics Row — now using MetricCard */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Total clinical cases" value={totalCases} />
        <MetricCard label="Pending review" value={pendingCases} tone="warning" />
        <MetricCard label="Approved records" value={approvedCases} tone="success" />
        <div className="rounded-lg bg-slate-50 p-4">
          <p className="text-sm text-slate-500 mb-1 flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5" /> Hospital networks
          </p>
          <p className="text-2xl font-semibold text-slate-900">{orgCount}</p>
          <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
            <span>{rejectedCases} rejected</span>
            <Link href="/admin/organizations" className="text-teal-600 font-semibold hover:underline">
              Configure &rarr;
            </Link>
          </div>
        </div>
      </div>

      {/* Recent Cases Section — now a stacked list using CaseRow */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Activity className="h-4 w-4 text-teal-600" />
              Recent Clinical Cases
            </h2>
            <p className="text-xs text-slate-500">
              Immediate audit trail of the latest ingested and synthesized patient narratives.
            </p>
          </div>
          <Link
            href="/admin/cases"
            className="flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-800 transition"
          >
            <span>View All Cases</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {recentCases.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center text-slate-400">
            <FileText className="mx-auto h-8 w-8 text-slate-300 mb-2" />
            <p className="text-xs font-medium">No clinical cases logged yet.</p>
            <Link
              href="/cases/new"
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-teal-600 hover:underline"
            >
              Create your first case &rarr;
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {recentCases.map((c) => {
              const { variant, label } = toDisplayVariant(c.status, c.safetyFlags.length);
              return (
                <Link key={c.id} href={`/cases/${c.id}/review`} className="block">
                  <CaseRow
                    title={c.title}
                    physician={`Dr. ${c.physician.name}`}
                    specialty={c.physician.specialty || "General Medicine"}
                    status={variant}
                    statusLabel={label}
                    flagDetail={c.safetyFlags[0]?.detail}
                    sourceLabel={
                      c.recordings.length > 0
                        ? `Audio · ${c.recordings[0].durationSeconds}s`
                        : "Manual entry"
                    }
                    sourceIcon={
                      c.recordings.length > 0 ? (
                        <Mic className="h-3.5 w-3.5" />
                      ) : (
                        <FileEdit className="h-3.5 w-3.5" />
                      )
                    }
                  />
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
