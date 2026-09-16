"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function OrgSettingsPage() {
  const [org, setOrg] = useState<any>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [organizations, setOrganizations] = useState<any[]>([]);
  useEffect(() => { const selectedOrgId = new URLSearchParams(window.location.search).get("orgId") || ""; fetch("/api/admin/organizations").then((response) => response.json()).then((data) => { const items = data.organizations || []; setOrganizations(items); setOrg(items.find((item: any) => item.id === selectedOrgId) || items[0] || null); }); }, []);
  const save = async (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); const hospitalPhotoUrls = String(values.hospitalPhotoUrls || "").split("\n").map((url) => url.trim()).filter(Boolean); const response = await fetch("/api/admin/organizations", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId: org.id, ...values, hospitalPhotoUrls }) }); const data = await response.json(); setMessage(response.ok ? "Organization profile saved." : data.error || "Unable to save organization profile."); if (response.ok) setOrg(data.organization); };

  return (
    <div className="readable-route max-w-3xl space-y-6">
      <div>
        <Link href="/admin/organizations" className="text-xs font-semibold text-pine hover:underline">← Hospital Networks</Link>
        <h1 className="text-2xl font-extrabold text-ink tracking-tight">Organization & Brand Identity</h1>
        <p className="text-xs text-muted mt-1">Configure clinical branding and legal medical disclaimers.</p>
      </div>

      <form key={org?.id || "empty"} onSubmit={save} className="bg-surface rounded-lg border border-line p-6 space-y-5">
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-1">Hospital / Organization</label>
          <select
            value={org?.id || ""}
            onChange={(event) => {
              const next = organizations.find((item) => item.id === event.target.value);
              setOrg(next || null);
              window.history.replaceState(null, "", `/settings/organization?orgId=${event.target.value}`);
            }}
            className="w-full text-xs p-3 rounded-lg border border-line bg-paper text-ink"
          >
            <option value="" disabled>Select a hospital</option>
            {organizations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
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
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-xs font-bold uppercase tracking-wider text-muted">Location<input name="location" defaultValue={org?.location || ""} placeholder="City, state, country" className="mt-1 w-full text-xs p-3 rounded-lg border border-line bg-paper text-ink" /></label>
          <label className="block text-xs font-bold uppercase tracking-wider text-muted">Website<input name="websiteUrl" type="url" defaultValue={org?.websiteUrl || ""} placeholder="https://hospital.example" className="mt-1 w-full text-xs p-3 rounded-lg border border-line bg-paper text-ink" /></label>
          <label className="block text-xs font-bold uppercase tracking-wider text-muted">Contact email<input name="contactEmail" type="email" defaultValue={org?.contactEmail || ""} placeholder="communications@hospital.example" className="mt-1 w-full text-xs p-3 rounded-lg border border-line bg-paper text-ink" /></label>
          <label className="block text-xs font-bold uppercase tracking-wider text-muted">Contact phone<input name="contactPhone" defaultValue={org?.contactPhone || ""} placeholder="+91 ..." className="mt-1 w-full text-xs p-3 rounded-lg border border-line bg-paper text-ink" /></label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {(["linkedinUrl", "facebookUrl", "instagramUrl", "xUrl", "youtubeUrl"] as const).map((field) => <label key={field} className="block text-xs font-bold uppercase tracking-wider text-muted">{field.replace("Url", " URL")}<input name={field} type="url" defaultValue={org?.[field] || ""} placeholder="https://..." className="mt-1 w-full text-xs p-3 rounded-lg border border-line bg-paper text-ink" /></label>)}
          <label className="block text-xs font-bold uppercase tracking-wider text-muted">Preferred writing tone<input name="preferredTone" defaultValue={org?.preferredTone || ""} placeholder="Warm, educational, clinically precise" className="mt-1 w-full text-xs p-3 rounded-lg border border-line bg-paper text-ink" /></label>
        </div>
        <label className="block text-xs font-bold uppercase tracking-wider text-muted">Default call to action<textarea name="callToAction" rows={2} defaultValue={org?.callToAction || ""} placeholder="Book an appointment through the hospital reception." className="mt-1 w-full text-xs p-3 rounded-lg border border-line bg-paper text-ink" /></label>
        <label className="block text-xs font-bold uppercase tracking-wider text-muted">Hospital photo URLs<textarea name="hospitalPhotoUrls" rows={2} defaultValue={Array.isArray(org?.hospitalPhotoUrls) ? org.hospitalPhotoUrls.join("\n") : ""} placeholder="One image URL per line" className="mt-1 w-full text-xs p-3 rounded-lg border border-line bg-paper text-ink" /></label>
        <button type="submit" disabled={!org} className="rounded bg-pine px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">Save brand settings</button>
        {message && <p className="text-xs text-muted">{message}</p>}
      </form>
    </div>
  );
}
