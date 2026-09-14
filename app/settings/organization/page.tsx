import { db } from "@/lib/db";

export default async function OrgSettingsPage() {
  let org: any = null;
  try {
    org = await db.organization.findFirst();
  } catch {
    org = null;
  }

  return (
    <div className="readable-route max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-ink tracking-tight">Organization & Brand Identity</h1>
        <p className="text-xs text-muted mt-1">Configure clinical branding and legal medical disclaimers.</p>
      </div>

      <div className="bg-surface rounded-lg border border-line p-6 space-y-5">
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-1">Organization Name</label>
          <input
            type="text"
            defaultValue={org?.name || "Macula Eye Hospital"}
            className="w-full text-xs p-3 rounded-lg border border-line bg-paper text-ink"
            readOnly
          />
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-1">Brand Accent Color</label>
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl border" style={{ backgroundColor: org?.brandColorHex || "#059669" }} />
            <span className="text-xs font-mono text-muted">{org?.brandColorHex || "#1f5c4f"}</span>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-1">
            Statutory Clinical Disclaimer (Applied to all exported assets)
          </label>
          <textarea
            rows={3}
            defaultValue={org?.defaultDisclaimer || "This clinical content is educational only and does not constitute formal medical advice. Consult a registered medical practitioner."}
            className="w-full text-xs p-3 rounded-lg border border-line bg-paper text-ink"
            readOnly
          />
        </div>
      </div>
    </div>
  );
}
