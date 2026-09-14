import { db } from "@/lib/db";

export default async function OrgSettingsPage() {
  let org: any = null;
  try {
    org = await db.organization.findFirst();
  } catch {
    org = null;
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Organization & Brand Identity</h1>
        <p className="text-xs text-slate-500 mt-1">Configure clinical branding and legal medical disclaimers.</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5 shadow-sm">
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Organization Name</label>
          <input
            type="text"
            defaultValue={org?.name || "Macula Eye Hospital"}
            className="w-full text-xs p-3 rounded-xl border border-slate-200 bg-slate-50"
            readOnly
          />
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Brand Accent Color</label>
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl border" style={{ backgroundColor: org?.brandColorHex || "#059669" }} />
            <span className="text-xs font-mono text-slate-700">{org?.brandColorHex || "#059669"}</span>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
            Statutory Clinical Disclaimer (Applied to all exported assets)
          </label>
          <textarea
            rows={3}
            defaultValue={org?.defaultDisclaimer || "This clinical content is educational only and does not constitute formal medical advice. Consult a registered medical practitioner."}
            className="w-full text-xs p-3 rounded-xl border border-slate-200 bg-slate-50"
            readOnly
          />
        </div>
      </div>
    </div>
  );
}
