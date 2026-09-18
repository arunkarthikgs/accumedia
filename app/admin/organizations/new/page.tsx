"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, Building2, CheckCircle2, Loader2, Palette, FileText, Settings2, BriefcaseBusiness } from "lucide-react";

const ASR_MODELS = [
  { id: "whisper-1", name: "OpenAI Whisper-1", description: "Multilingual cloud speech recognition." },
  { id: "deepgram-nova-3-medical", name: "Deepgram Nova-3 Medical", description: "Medical-tuned cloud speech recognition." },
  { id: "faster-whisper-self-hosted", name: "Faster-Whisper (Self-Hosted)", description: "Self-hosted recognition for private deployments." },
];

const initialForm = {
  name: "",
  slug: "",
  location: "",
  websiteUrl: "",
  contactEmail: "",
  contactPhone: "",
  linkedinUrl: "",
  facebookUrl: "",
  instagramUrl: "",
  xUrl: "",
  youtubeUrl: "",
  brandingHex: "#0f766e",
  logoUrl: "",
  brandFont: "Arial",
  brandTagline: "",
  preferredTone: "",
  callToAction: "",
  hospitalPhotoUrls: "",
  preferredAsrModel: "whisper-1",
  customSystemPrompt: "",
  defaultDisclaimer: "This clinical summary is generated under NMC registered medical practitioner supervision.",
  adminUserName: "",
  adminUserEmail: "",
  adminUserPassword: "",
};

export default function NewOrganizationPage() {
  const router = useRouter();
  const [form, setForm] = useState(initialForm);
  const [activeTab, setActiveTab] = useState<"details" | "brand" | "content" | "advanced" | "commercial">("details");
  const [plans, setPlans] = useState<any[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/subscription?catalog=true", { credentials: "same-origin" })
      .then((response) => response.json())
      .then((data) => { setPlans(data.plans || []); setSelectedPlanId(data.plans?.[0]?.id || ""); })
      .catch(() => undefined);
  }, []);

  const update = (field: keyof typeof initialForm, value: string) => setForm((current) => ({ ...current, [field]: value }));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.name.trim() || !form.adminUserName.trim() || !form.adminUserEmail.trim() || !selectedPlanId) {
      setActiveTab(!form.name.trim() || !form.adminUserName.trim() || !form.adminUserEmail.trim() ? "details" : "commercial");
      setError("Complete the required hospital name, administrator name, administrator email, and commercial plan fields.");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/organizations", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          planId: selectedPlanId,
          hospitalPhotoUrls: form.hospitalPhotoUrls.split("\n").map((url) => url.trim()).filter(Boolean),
        }),
      });
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) throw new Error("Your session may have expired. Please sign in again.");
      const data = await response.json();
      if (response.status === 401 || response.status === 403) throw new Error(data.error || "Your session may have expired. Please sign in again.");
      if (!response.ok) throw new Error(data.error || "Unable to create organisation.");
      router.push("/admin/organizations");
    } catch (submitError: any) {
      setError(submitError.message || "Unable to create organisation.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className="readable-route min-h-screen bg-paper px-6 py-8 text-ink md:px-10">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Link href="/admin/organizations" className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-pine hover:underline">
              <ArrowLeft className="h-3 w-3" /> Hospital Networks
            </Link>
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-pine" />
              <h1 className="text-2xl font-bold tracking-tight text-ink">Add New Hospital Network</h1>
            </div>
            <p className="mt-1 text-xs text-muted">Create the organisation profile used across clinical content, images, and publishing assets.</p>
          </div>
        </div>

        {error && <div className="mb-6 rounded border border-brick/30 bg-brick-tint px-4 py-3 text-xs font-medium text-brick">{error}</div>}

        <form onSubmit={submit} className="space-y-6">
          <div className="card flex gap-1 overflow-x-auto p-2" role="tablist" aria-label="Organisation profile sections">
            {([ ["details", "Organisation details", Building2], ["brand", "Brand identity", Palette], ["content", "Content preferences", FileText], ["advanced", "Advanced configuration", Settings2], ["commercial", "Commercial plan", BriefcaseBusiness] ] as const).map(([tab, label, Icon]) => <button key={tab} type="button" role="tab" aria-selected={activeTab === tab} onClick={() => setActiveTab(tab as typeof activeTab)} className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded px-3 py-2 text-xs font-semibold transition ${activeTab === tab ? "bg-pine text-white" : "text-muted hover:bg-pine-tint hover:text-pine"}`}><Icon className="h-3.5 w-3.5" />{label}</button>)}
          </div>

          <section className={activeTab === "details" ? "card space-y-4 p-6" : "hidden"}>
            <h2 className="border-b border-line pb-3 text-[11px] font-bold uppercase tracking-wider text-muted">Organisation details</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Organisation / Hospital name" required value={form.name} onChange={(value) => update("name", value)} placeholder="Apollo Hospitals - Bangalore" />
              <Field label="Organisation slug" value={form.slug} onChange={(value) => update("slug", value)} placeholder="apollo-bangalore (optional)" />
              <Field label="Address" value={form.location} onChange={(value) => update("location", value)} placeholder="Street, city, state, country" />
              <Field label="Website URL" type="url" value={form.websiteUrl} onChange={(value) => update("websiteUrl", value)} placeholder="https://hospital.example" />
              <Field label="Contact email" type="email" value={form.contactEmail} onChange={(value) => update("contactEmail", value)} placeholder="communications@hospital.example" />
              <Field label="Contact phone" type="tel" value={form.contactPhone} onChange={(value) => update("contactPhone", value)} placeholder="+91 ..." />
            </div>
            <div className="border-t border-line pt-4">
              <h3 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-muted">Default Hospital Administrator</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Administrator name" required value={form.adminUserName} onChange={(value) => update("adminUserName", value)} placeholder="Hospital administrator name" />
                <Field label="Administrator email / User ID" required type="email" value={form.adminUserEmail} onChange={(value) => update("adminUserEmail", value)} placeholder="admin@hospital.example" />
                <Field label="Initial password" type="password" value={form.adminUserPassword} onChange={(value) => update("adminUserPassword", value)} placeholder="Optional; welcome email sets password" />
              </div>
              <p className="mt-2 text-[11px] text-muted">This account is created as the first Organization Administrator and can create additional hospital users.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="LinkedIn profile URL" type="url" value={form.linkedinUrl} onChange={(value) => update("linkedinUrl", value)} placeholder="https://linkedin.com/company/..." />
              <Field label="Facebook page URL" type="url" value={form.facebookUrl} onChange={(value) => update("facebookUrl", value)} placeholder="https://facebook.com/..." />
              <Field label="Instagram profile URL" type="url" value={form.instagramUrl} onChange={(value) => update("instagramUrl", value)} placeholder="https://instagram.com/..." />
              <Field label="X profile URL" type="url" value={form.xUrl} onChange={(value) => update("xUrl", value)} placeholder="https://x.com/..." />
              <Field label="YouTube channel URL" type="url" value={form.youtubeUrl} onChange={(value) => update("youtubeUrl", value)} placeholder="https://youtube.com/@..." />
            </div>
          </section>

          <section className={activeTab === "brand" ? "card space-y-4 p-6" : "hidden"}>
            <h2 className="border-b border-line pb-3 text-[11px] font-bold uppercase tracking-wider text-muted">Brand identity</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Logo URL" type="url" value={form.logoUrl} onChange={(value) => update("logoUrl", value)} placeholder="https://.../logo.png" />
              <Field label="Brand typeface" value={form.brandFont} onChange={(value) => update("brandFont", value)} placeholder="Arial or a web-safe font" />
              <Field label="Brand tagline" value={form.brandTagline} onChange={(value) => update("brandTagline", value)} placeholder="Short public-facing descriptor" />
              <Field label="Preferred writing tone" value={form.preferredTone} onChange={(value) => update("preferredTone", value)} placeholder="Warm, educational, clinically precise" />
            </div>
            <label className="block text-xs font-semibold text-ink">Primary brand colour
              <span className="mt-1 flex items-center gap-3"><input type="color" value={form.brandingHex} onChange={(event) => update("brandingHex", event.target.value)} className="h-9 w-10 cursor-pointer rounded border border-line" /><span className="font-mono text-xs text-muted">{form.brandingHex}</span></span>
            </label>
            <label className="block text-xs font-semibold text-ink">Hospital image URLs
              <textarea rows={3} value={form.hospitalPhotoUrls} onChange={(event) => update("hospitalPhotoUrls", event.target.value)} placeholder="One image URL per line" className="mt-1 w-full rounded border border-line bg-paper p-3 text-xs text-ink" />
            </label>
          </section>

          <section className={activeTab === "content" ? "card space-y-4 p-6" : "hidden"}>
            <h2 className="border-b border-line pb-3 text-[11px] font-bold uppercase tracking-wider text-muted">Content preferences</h2>
            <label className="block text-xs font-semibold text-ink">Default call to action
              <textarea rows={2} value={form.callToAction} onChange={(event) => update("callToAction", event.target.value)} placeholder="Book an appointment through the hospital reception." className="mt-1 w-full rounded border border-line bg-paper p-3 text-xs text-ink" />
            </label>
            <label className="block text-xs font-semibold text-ink">Medical disclaimer
              <textarea rows={3} value={form.defaultDisclaimer} onChange={(event) => update("defaultDisclaimer", event.target.value)} className="mt-1 w-full rounded border border-line bg-paper p-3 text-xs text-ink" />
            </label>
          </section>

          <section className={activeTab === "advanced" ? "card space-y-4 p-6" : "hidden"}>
            <div><h2 className="text-[11px] font-bold uppercase tracking-wider text-muted">Advanced configuration</h2><p className="mt-1 text-xs text-muted">These settings control ingestion and clinical synthesis defaults.</p></div>
            <div className="grid gap-2">
              {ASR_MODELS.map((model) => <label key={model.id} className={`flex cursor-pointer gap-3 rounded border p-3 ${form.preferredAsrModel === model.id ? "border-pine bg-pine-tint" : "border-line bg-surface"}`}><input type="radio" name="preferredAsrModel" value={model.id} checked={form.preferredAsrModel === model.id} onChange={(event) => update("preferredAsrModel", event.target.value)} /><span><span className="block text-xs font-semibold text-ink">{model.name}</span><span className="block text-[11px] text-muted">{model.description}</span></span></label>)}
            </div>
            <label className="block text-xs font-semibold text-ink">Custom clinical prompt
              <textarea rows={4} value={form.customSystemPrompt} onChange={(event) => update("customSystemPrompt", event.target.value)} placeholder="Optional organisation-specific clinical instructions" className="mt-1 w-full rounded border border-line bg-paper p-3 font-mono text-xs text-ink" />
            </label>
          </section>

          <section className={activeTab === "commercial" ? "card space-y-4 p-6" : "hidden"}>
            <h2 className="border-b border-line pb-3 text-[11px] font-bold uppercase tracking-wider text-muted">Commercial plan</h2>
            <p className="text-xs text-muted">Select the database-defined RFP plan. The subscription is created with the hospital.</p>
            <select value={selectedPlanId} onChange={(event) => setSelectedPlanId(event.target.value)} className="w-full rounded border border-line bg-paper p-3 text-xs text-ink" aria-required="true"><option value="">Select commercial plan *</option>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · {plan.isCustom ? "Custom pricing" : `${plan.currency} ${Number(plan.monthlyPrice || 0).toLocaleString()} / ${plan.billingInterval}`} · {plan.monthlyCaseLimit ?? "Custom"} cases/month</option>)}</select>
          </section>

          <div className="flex justify-end gap-3 border-t border-line pt-5">
            <Link href="/admin/organizations" className="rounded border border-line bg-surface px-4 py-2.5 text-xs font-semibold text-ink hover:border-pine">Cancel</Link>
            <button type="submit" disabled={isSaving} className="inline-flex items-center gap-2 rounded bg-pine px-5 py-2.5 text-xs font-semibold text-white hover:bg-pine-dark disabled:opacity-50">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {isSaving ? "Creating organisation..." : "Create organisation"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}

function Field({ label, value, onChange, placeholder, type = "text", required = false }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; type?: string; required?: boolean }) {
  return <label className="block text-xs font-semibold text-ink">{label}{required ? " *" : ""}<input required={required} type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="mt-1 w-full rounded border border-line bg-paper px-3 py-2.5 text-xs text-ink outline-none focus:border-pine focus:ring-2 focus:ring-pine/20" /></label>;
}
