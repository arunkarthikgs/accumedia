import Link from "next/link";
import { db } from "@/lib/db";
import { CheckCircle2, AlertCircle, PlusCircle } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const cases = await db.case.findMany({
    orderBy: { createdAt: "desc" },
    include: { physician: true },
  });

  return (
    <div className="max-w-6xl mx-auto py-10 px-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Clinical Case Hub</h1>
          <p className="text-sm text-slate-600">DPDP & NMC Compliance Pipeline for Indian Hospitals</p>
        </div>
        <Link
          href="/cases/new"
          className="flex items-center gap-2 bg-teal-700 hover:bg-teal-800 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <PlusCircle className="w-4 h-4" /> New Case Intake
        </Link>
      </div>

      <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-700 font-semibold border-b">
            <tr>
              <th className="py-3 px-4">Primary Diagnosis / Title</th>
              <th className="py-3 px-4">Attending Clinician</th>
              <th className="py-3 px-4">Compliance Status</th>
              <th className="py-3 px-4">Created Date</th>
              <th className="py-3 px-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y text-slate-600">
            {cases.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-slate-400">
                  No cases ingested yet. Click "+ New Case Intake" to start.
                </td>
              </tr>
            ) : (
              cases.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50/50">
                  <td className="py-3 px-4 font-medium text-slate-900">{c.title}</td>
                  <td className="py-3 px-4">Dr. {c.physician.name}</td>
                  <td className="py-3 px-4">
                    {c.status === "APPROVED" ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full text-xs font-semibold">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Approved
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full text-xs font-semibold">
                        <AlertCircle className="w-3.5 h-3.5" /> Pending Review
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-xs">{new Date(c.createdAt).toLocaleDateString("en-IN")}</td>
                  <td className="py-3 px-4 text-right">
                    <Link
                      href={c.status === "APPROVED" ? `/cases/${c.id}/assets` : `/cases/${c.id}/review`}
                      className="text-teal-700 hover:underline font-medium text-xs"
                    >
                      {c.status === "APPROVED" ? "View Assets →" : "Review Safety Gate →"}
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
