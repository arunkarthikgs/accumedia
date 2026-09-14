import Link from "next/link";
import { db } from "@/lib/db";
import {
  Activity,
  PlusCircle,
  FolderKanban,
  Building2,
  Clock,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Mic,
  ShieldCheck,
  FileText,
} from "lucide-react";

export const dynamic = "force-dynamic";

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
        },
      }),
      db.organization.count(),
    ]);

  return (
    <main className="mx-auto max-w-7xl p-8 space-y-8">
      {/* Hero / Quick Action Banner */}
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

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Total Clinical Cases</span>
            <Activity className="h-4 w-4 text-teal-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{totalCases}</div>
          <p className="mt-1 text-[11px] text-slate-400">Across all connected hospitals</p>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-5 shadow-xs">
          <div className="flex items-center justify-between text-amber-800 text-xs font-medium">
            <span>Pending Review</span>
            <Clock className="h-4 w-4 text-amber-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-amber-900">{pendingCases}</div>
          <p className="mt-1 text-[11px] text-amber-700">Awaiting RMP / Admin sign-off</p>
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-5 shadow-xs">
          <div className="flex items-center justify-between text-emerald-800 text-xs font-medium">
            <span>Approved Records</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-900">{approvedCases}</div>
          <p className="mt-1 text-[11px] text-emerald-700">Compliant &amp; ready for export</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Hospital Networks</span>
            <Building2 className="h-4 w-4 text-slate-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{orgCount}</div>
          <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
            <span>{rejectedCases} cases rejected</span>
            <Link href="/admin/organizations" className="text-teal-600 font-semibold hover:underline">
              Configure &rarr;
            </Link>
          </div>
        </div>
      </div>

      {/* Recent Cases Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">Recent Clinical Cases</h2>
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

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {recentCases.length === 0 ? (
            <div className="col-span-full rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center text-slate-400">
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
            recentCases.map((c) => {
              const statusBadge =
                c.status === "APPROVED" ? (
                  <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200">
                    <CheckCircle2 className="h-3 w-3" /> Approved
                  </span>
                ) : c.status === "REJECTED" ? (
                  <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700 border border-rose-200">
                    <XCircle className="h-3 w-3" /> Rejected
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 border border-amber-200">
                    <Clock className="h-3 w-3" /> Pending Review
                  </span>
                );

              return (
                <div
                  key={c.id}
                  className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-xs hover:border-teal-300 hover:shadow-sm transition"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold text-teal-700 flex items-center gap-1 truncate">
                        <Building2 className="h-3 w-3 shrink-0" />
                        {c.organization.name}
                      </span>
                      {statusBadge}
                    </div>

                    <h3 className="font-semibold text-sm text-slate-900 line-clamp-1">
                      {c.title}
                    </h3>

                    <div className="text-[11px] text-slate-500">
                      Dr. {c.physician.name} • {c.physician.specialty || "General Medicine"}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                    <span className="flex items-center gap-1">
                      {c.recordings.length > 0 ? (
                        <>
                          <Mic className="h-3 w-3 text-teal-600" />
                          <span>Audio ({c.recordings[0].durationSeconds}s)</span>
                        </>
                      ) : (
                        <span>Manual Entry</span>
                      )}
                    </span>

                    <Link
                      href={`/cases/${c.id}/review`}
                      className="font-semibold text-teal-700 hover:text-teal-900 flex items-center gap-0.5"
                    >
                      <span>Review</span>
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </main>
  );
}
