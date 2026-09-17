# New style — components and usage

## Page headers
Use `components/PageHeader.tsx` for every new application screen. It provides the shared Dashboard/New Case Ingestion composition: breadcrumb, page title, one-line description, and right-aligned actions.

```tsx
import PageHeader from "@/components/PageHeader";

<PageHeader
  section="Safety Queue"
  title="Safety Review Queue"
  description="Review flagged content and record an explicit decision."
  actions={<button className="rounded-lg bg-pine px-3 py-2 text-xs font-semibold text-white">Refresh</button>}
/>;
```

Place it inside a `max-w-5xl` page frame using the shared `paper`, `surface`, `ink`, `muted`, `line`, and `pine` tokens. Avoid creating a separate dark toolbar or a page-specific header pattern.

## Why these are safe to try
Everything here uses **Tailwind's built-in color palette only**
(`slate`/`green`/`amber`/`red`) — nothing requires editing
`tailwind.config.ts`. That sidesteps the whole custom-token dependency
that caused issues with the earlier "Clinical Ledger" redesign. Drop these
three files into `components/ui/` and they work immediately.

## Files
- `components/ui/StatusBadge.tsx` — semantic status pill (approved/pending/flagged/rejected)
- `components/ui/MetricCard.tsx` — dashboard summary stat card
- `components/ui/CaseRow.tsx` — a single case list row (avatar + title + physician + badge)

## Color mapping (for consistency anywhere else you extend this)
| Meaning | Background | Text |
|---|---|---|
| Approved / success | `bg-green-50` | `text-green-700` (or `-600` for larger numbers) |
| Pending / warning | `bg-amber-50` | `text-amber-700` |
| Flagged / danger | `bg-red-50` | `text-red-700` |
| Rejected / neutral | `bg-slate-100` | `text-slate-600` |
| Primary action | `bg-slate-900` (or `bg-blue-600` if you want a distinct accent) | `text-white` |

## Example: assembling the dashboard mockup you saw

This is NOT a file to drop in — it's a reference showing how the three
components combine. Adapt it into your real `app/page.tsx` once you're
ready (small, isolated change, not a full-file replacement).

```tsx
import { Bell, Plus } from "lucide-react";
import MetricCard from "@/components/ui/MetricCard";
import CaseRow from "@/components/ui/CaseRow";

export default function DashboardExample() {
  return (
    <div className="max-w-4xl mx-auto p-8">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-200 mb-6">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center text-white font-medium text-sm">M</div>
          <div>
            <p className="font-medium text-sm">Accumedia</p>
            <p className="text-xs text-slate-400">Sunrise Eye Hospital</p>
          </div>
        </div>
        <button aria-label="Notifications"><Bell className="h-4 w-4 text-slate-500" /></button>
      </div>

      {/* Greeting + primary action */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold">Good morning, Dr. Rao</h1>
          <p className="text-sm text-slate-500">3 cases need your attention today</p>
        </div>
        <button className="flex items-center gap-1.5 bg-slate-900 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-slate-800">
          <Plus className="h-4 w-4" /> New case
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <MetricCard label="Total cases" value={128} />
        <MetricCard label="Pending review" value={14} tone="warning" />
        <MetricCard label="Approved" value={96} tone="success" />
        <MetricCard label="Open flags" value={3} tone="danger" />
      </div>

      {/* Safety banner - only render when count > 0 */}
      <div className="flex items-center gap-2.5 bg-red-50 rounded-lg px-4 py-3 mb-6">
        <p className="text-sm text-red-700 flex-1">
          3 cases have open safety flags awaiting a compliance decision.
        </p>
        <a href="/admin/safety-queue" className="text-xs font-medium text-red-700 border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-100">
          Review queue
        </a>
      </div>

      {/* Recent cases */}
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
```

## Suggested next step
Given how much file-editing trouble this session already had, I'd suggest:
1. Drop the three `components/ui/*.tsx` files in — they're new files, can't
   conflict with anything.
2. Look at them rendering nowhere in particular first (e.g. a throwaway
   test page) to confirm they compile cleanly in your real project.
3. Only then adapt your real `app/page.tsx` to use them — as a small,
   reviewable diff, not a full-file replacement.
