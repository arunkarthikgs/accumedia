import { Bell, Plus } from "lucide-react";
import MetricCard from "@/components/ui/MetricCard";
import CaseRow from "@/components/ui/CaseRow";

/**
 * Throwaway preview page — visit /style-preview to see the new components
 * rendered with sample data, completely isolated from your real app/page.tsx.
 * Safe to delete once you've decided whether to adopt this style for real.
 */
export default function StylePreviewPage() {
  return (
    <div className="max-w-4xl mx-auto p-8">
      <div className="flex items-center justify-between pb-4 border-b border-slate-200 mb-6">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center text-white font-medium text-sm">M</div>
          <div>
            <p className="font-medium text-sm">Macula Healthcare</p>
            <p className="text-xs text-slate-400">Sunrise Eye Hospital</p>
          </div>
        </div>
        <button aria-label="Notifications"><Bell className="h-4 w-4 text-slate-500" /></button>
      </div>

      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold">Good morning, Dr. Rao</h1>
          <p className="text-sm text-slate-500">3 cases need your attention today</p>
        </div>
        <button className="flex items-center gap-1.5 bg-slate-900 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-slate-800">
          <Plus className="h-4 w-4" /> New case
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <MetricCard label="Total cases" value={128} />
        <MetricCard label="Pending review" value={14} tone="warning" />
        <MetricCard label="Approved" value={96} tone="success" />
        <MetricCard label="Open flags" value={3} tone="danger" />
      </div>

      <div className="flex items-center gap-2.5 bg-red-50 rounded-lg px-4 py-3 mb-6">
        <p className="text-sm text-red-700 flex-1">
          3 cases have open safety flags awaiting a compliance decision.
        </p>
        <a href="/admin/safety-queue" className="text-xs font-medium text-red-700 border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-100">
          Review queue
        </a>
      </div>

      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-sm">Recent cases</h2>
        <a href="/admin/cases" className="text-sm text-blue-600 hover:underline">View all</a>
      </div>

      <div className="flex flex-col gap-2">
        <CaseRow
          title="Diabetic retinopathy — laser intervention"
          physician="Dr. Aisha Rao"
          specialty="Ophthalmology"
          status="approved"
          statusLabel="Approved"
        />
        <CaseRow
          title="Cataract surgery — bilateral"
          physician="Dr. Karan Mehta"
          specialty="Ophthalmology"
          status="pending"
          statusLabel="Pending review"
        />
        <CaseRow
          title="Post-MI rehabilitation adherence"
          physician="Dr. Priya Nair"
          specialty="Cardiology"
          status="flagged"
          statusLabel="Flagged"
          flagDetail="1 open safety flag — needs review"
        />
      </div>
    </div>
  );
}
