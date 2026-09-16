"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { ArrowLeft, Building2, CheckCircle2, Loader2 } from "lucide-react";

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
};

export default function NewOrganizationPage() {
  const router = useRouter();
  const [form, setForm] = useState(initialForm);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (field: keyof typeof initialForm, value: string) => setForm((current) => ({ ...current, [field]: value }));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/organizations", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
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
          <section className="card space-y-4 p-6">
            <h2 className="border-b border-line pb-3 text-[11px] font-bold uppercase tracking-wider text-muted">Organisation details</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Organisation / Hospital name" required value={form.name} onChange={(value) => update("name", value)} placeholder="Apollo Hospitals - Bangalore" />
              <Field label="Organisation slug" value={form.slug} onChange={(value) => update("slug", value)} placeholder="apollo-bangalore (optional)" />
              <Field label="Location" value={form.location} onChange={(value) => update("location", value)} placeholder="City, state, country" />
              <Field label="Website URL" type="url" value={form.websiteUrl} onChange={(value) => update("websiteUrl", value)} placeholder="https://hospital.example" />
              <Field label="Contact email" type="email" value={form.contactEmail} onChange={(value) => update("contactEmail", value)} placeholder="communications@hospital.example" />
              <Field label="Contact phone" type="tel" value={form.contactPhone} onChange={(value) => update("contactPhone", value)} placeholder="+91 ..." />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="LinkedIn profile URL" type="url" value={form.linkedinUrl} onChange={(value) => update("linkedinUrl", value)} placeholder="https://linkedin.com/company/..." />
              <Field label="Facebook page URL" type="url" value={form.facebookUrl} onChange={(value) => update("facebookUrl", value)} placeholder="https://facebook.com/..." />
              <Field label="Instagram profile URL" type="url" value={form.instagramUrl} onChange={(value) => update("instagramUrl", value)} placeholder="https://instagram.com/..." />
              <Field label="X profile URL" type="url" value={form.xUrl} onChange={(value) => update("xUrl", value)} placeholder="https://x.com/..." />
              <Field label="YouTube channel URL" type="url" value={form.youtubeUrl} onChange={(value) => update("youtubeUrl", value)} placeholder="https://youtube.com/@..." />
            </div>
          </section>

          <section className="card space-y-4 p-6">
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

          <section className="card space-y-4 p-6">
            <h2 className="border-b border-line pb-3 text-[11px] font-bold uppercase tracking-wider text-muted">Content preferences</h2>
            <label className="block text-xs font-semibold text-ink">Default call to action
              <textarea rows={2} value={form.callToAction} onChange={(event) => update("callToAction", event.target.value)} placeholder="Book an appointment through the hospital reception." className="mt-1 w-full rounded border border-line bg-paper p-3 text-xs text-ink" />
            </label>
            <label className="block text-xs font-semibold text-ink">Medical disclaimer
              <textarea rows={3} value={form.defaultDisclaimer} onChange={(event) => update("defaultDisclaimer", event.target.value)} className="mt-1 w-full rounded border border-line bg-paper p-3 text-xs text-ink" />
            </label>
          </section>

          <section className="card space-y-4 p-6">
            <div><h2 className="text-[11px] font-bold uppercase tracking-wider text-muted">Advanced configuration</h2><p className="mt-1 text-xs text-muted">These settings control ingestion and clinical synthesis defaults.</p></div>
            <div className="grid gap-2">
              {ASR_MODELS.map((model) => <label key={model.id} className={`flex cursor-pointer gap-3 rounded border p-3 ${form.preferredAsrModel === model.id ? "border-pine bg-pine-tint" : "border-line bg-surface"}`}><input type="radio" name="preferredAsrModel" value={model.id} checked={form.preferredAsrModel === model.id} onChange={(event) => update("preferredAsrModel", event.target.value)} /><span><span className="block text-xs font-semibold text-ink">{model.name}</span><span className="block text-[11px] text-muted">{model.description}</span></span></label>)}
            </div>
            <label className="block text-xs font-semibold text-ink">Custom clinical prompt
              <textarea rows={4} value={form.customSystemPrompt} onChange={(event) => update("customSystemPrompt", event.target.value)} placeholder="Optional organisation-specific clinical instructions" className="mt-1 w-full rounded border border-line bg-paper p-3 font-mono text-xs text-ink" />
            </label>
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
