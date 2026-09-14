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
  Clock,
  CheckCircle2,
  ShieldAlert,
} from "lucide-react";
import MetricCard from "@/components/ui/MetricCard";
import CaseRow from "@/components/ui/CaseRow";
import type { CaseStatusVariant } from "@/components/ui/StatusBadge";

export const dynamic = "force-dynamic";

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
  const [totalCases, pendingCases, approvedCases, rejectedCases, openSafetyFlags, recentCases, orgCount] =
    await Promise.all([
      db.case.count(),
      db.case.count({ where: { status: "PENDING_REVIEW" } }),
      db.case.count({ where: { status: "APPROVED" } }),
      db.case.count({ where: { status: "REJECTED" } }),
      db.safetyFlag.count({ where: { status: "OPEN" } }),
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
    <main className="ml-0 mr-auto max-w-7xl p-6 md:p-8 space-y-8">
      <div
        className="border-b border-line pb-8"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-pine">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Clinical intelligence workspace</span>
            </div>
            <h1
              className="mt-3 max-w-3xl text-3xl font-bold tracking-tight text-ink md:text-4xl"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              Clinical Narrative Ingestion &amp; Governance
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
              Capture dictations, run multi-model speech-to-text, synthesize structured master
              clinical records, and conduct compliance reviews across connected hospital networks.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <Link
              href="/cases/new"
              className="flex items-center gap-2 rounded-lg bg-pine px-4 py-2.5 text-sm font-semibold text-white hover:bg-pine-dark transition"
            >
              <PlusCircle className="h-4 w-4" />
              <span>Start Dictation</span>
            </Link>
            <Link
              href="/admin/cases"
              className="flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-ink hover:border-pine hover:text-pine transition"
            >
              <FolderKanban className="h-4 w-4" />
              <span>Manage Cases</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Link href="/admin/cases" className="block rounded-lg transition hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-pine/30" aria-label="View all clinical cases">
          <MetricCard
            label="Total clinical cases"
            value={totalCases}
            description="Across all connected hospitals"
            icon={<FileText className="h-6 w-6" />}
          />
        </Link>
        <Link href="/admin/cases" className="block rounded-lg transition hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-pine/30" aria-label="Review pending clinical cases">
          <MetricCard
            label="Pending review"
            value={pendingCases}
            tone="warning"
            description="Awaiting RMP sign-off"
            icon={<Clock className="h-6 w-6" />}
          />
        </Link>
        <Link href="/admin/cases" className="block rounded-lg transition hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-pine/30" aria-label="View approved clinical records">
          <MetricCard
            label="Approved records"
            value={approvedCases}
            tone="success"
            description="Ready for publishing"
            icon={<CheckCircle2 className="h-6 w-6" />}
          />
        </Link>
        <Link href="/admin/safety-queue" className="block rounded-lg transition hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-pine/30" aria-label="Open Safety Gate review queue">
          <MetricCard
            label="Safety Gate"
            value={openSafetyFlags}
            tone="warning"
            description={openSafetyFlags > 0 ? "Flags awaiting sign-off" : "No open safety flags"}
            icon={<ShieldAlert className="h-6 w-6" />}
          />
        </Link>
        <Link href="/admin/organizations" className="block rounded-lg transition hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-pine/30" aria-label="Manage hospital networks">
          <MetricCard
            label="Hospital networks"
            value={orgCount}
            tone="pro"
            description={`${rejectedCases} cases rejected`}
            icon={<Building2 className="h-6 w-6" />}
          />
        </Link>
      </div>

      {/* Recent Cases Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2
              className="flex items-center gap-2 text-xl font-bold text-ink"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              <Activity className="h-5 w-5 text-pine" />
              Recent Clinical Cases
            </h2>
            <p className="mt-1 text-sm text-muted">
              Immediate audit trail of the latest ingested and synthesized patient narratives.
            </p>
          </div>
          <Link
            href="/admin/cases"
            className="flex items-center gap-1 text-sm font-semibold text-pine hover:text-pine-dark transition"
          >
            <span>View All Cases</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {recentCases.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line bg-surface p-12 text-center text-muted">
            <FileText className="mx-auto h-8 w-8 text-line mb-2" />
            <p className="text-sm font-medium">No clinical cases logged yet.</p>
            <Link
              href="/cases/new"
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-pine hover:underline"
            >
              Create your first case &rarr;
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {recentCases.map((c) => {
              const { variant, label } = toDisplayVariant(c.status, c.safetyFlags.length);
              return (
                <Link key={c.id} href={`/cases/${c.id}/review`} className="block">
                  <CaseRow
                    title={c.title}
                    physician={c.physician.name}
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
                        <Mic className="h-5 w-5" />
                      ) : (
                        <FileEdit className="h-5 w-5" />
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
