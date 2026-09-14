"use client";

import { useEffect, useState } from "react";

export default function OrgSettingsPage() {
  const [org, setOrg] = useState<any>(null);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => { fetch("/api/admin/organizations").then((response) => response.json()).then((data) => setOrg(data.organizations?.[0] || null)); }, []);
  const save = async (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); const response = await fetch("/api/admin/organizations", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId: org.id, ...values }) }); const data = await response.json(); setMessage(response.ok ? "Brand settings saved." : data.error || "Unable to save brand settings."); if (response.ok) setOrg(data.organization); };

  return (
    <div className="readable-route max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-ink tracking-tight">Organization & Brand Identity</h1>
        <p className="text-xs text-muted mt-1">Configure clinical branding and legal medical disclaimers.</p>
      </div>

      <form onSubmit={save} className="bg-surface rounded-lg border border-line p-6 space-y-5">
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-1">Organization Name</label>
          <input
            type="text"
            name="name" defaultValue={org?.name || "Macula Eye Hospital"}
            className="w-full text-xs p-3 rounded-lg border border-line bg-paper text-ink"
          />
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-1">Brand Accent Color</label>
          <div className="flex items-center gap-3">
            <input name="brandingHex" type="color" defaultValue={org?.brandingHex || "#0f766e"} className="h-9 w-9 rounded border" />
            <span className="text-xs font-mono text-muted">{org?.brandingHex || "#0f766e"}</span>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-1">
            Statutory Clinical Disclaimer (Applied to all exported assets)
          </label>
          <textarea
            rows={3}
            name="defaultDisclaimer" defaultValue={org?.defaultDisclaimer || "This clinical content is educational only and does not constitute formal medical advice. Consult a registered medical practitioner."}
            className="w-full text-xs p-3 rounded-lg border border-line bg-paper text-ink"
          />
        </div>
        <label className="block text-xs font-bold uppercase tracking-wider text-muted">Logo URL<input name="logoUrl" defaultValue={org?.logoUrl || ""} placeholder="https://.../logo.png" className="mt-1 w-full text-xs p-3 rounded-lg border border-line bg-paper text-ink" /></label>
        <label className="block text-xs font-bold uppercase tracking-wider text-muted">Brand font<input name="brandFont" defaultValue={org?.brandFont || "Arial"} className="mt-1 w-full text-xs p-3 rounded-lg border border-line bg-paper text-ink" /></label>
        <label className="block text-xs font-bold uppercase tracking-wider text-muted">Brand tagline<input name="brandTagline" defaultValue={org?.brandTagline || ""} className="mt-1 w-full text-xs p-3 rounded-lg border border-line bg-paper text-ink" /></label>
        <button type="submit" disabled={!org} className="rounded bg-pine px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">Save brand settings</button>
        {message && <p className="text-xs text-muted">{message}</p>}
      </form>
    </div>
  );
}
