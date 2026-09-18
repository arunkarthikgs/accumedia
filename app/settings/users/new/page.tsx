"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Loader2, Stethoscope } from "lucide-react";

type Organization = { id: string; name: string };
type SpecialtyOption = { name: string; category: string };

export default function NewPhysicianPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedOrganizationId = searchParams.get("organizationId") || "";
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [specialties, setSpecialties] = useState<SpecialtyOption[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [form, setForm] = useState({ organizationId: selectedOrganizationId, name: "", email: "", password: "", registrationNo: "", specialty: "", qualifications: "", designation: "", profilePhotoUrl: "" });
  const [isSaving, setIsSaving] = useState(false);
  const [profilePhotoFile, setProfilePhotoFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/users${selectedOrganizationId ? `?organizationId=${encodeURIComponent(selectedOrganizationId)}` : ""}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load organizations.");
        setOrganizations(data.organizations || []);
        setIsSuperAdmin(Boolean(data.isSuperAdmin));
      })
      .catch((requestError: Error) => setError(requestError.message));
    fetch("/api/specialties", { credentials: "same-origin" }).then((response) => response.json()).then((data) => setSpecialties(data.specialties || [])).catch(() => undefined);
  }, [selectedOrganizationId]);

  const update = (field: keyof typeof form, value: string) => setForm((current) => ({ ...current, [field]: value }));
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to create physician.");
      if (profilePhotoFile && data.user?.id) {
        const uploadForm = new FormData();
        uploadForm.append("file", profilePhotoFile);
        uploadForm.append("target", "doctor");
        uploadForm.append("organizationId", data.user.organizationId || form.organizationId);
        uploadForm.append("userId", data.user.id);
        const uploadResponse = await fetch("/api/profile-media/upload", { method: "POST", body: uploadForm });
        const uploadData = await uploadResponse.json();
        if (!uploadResponse.ok) throw new Error(uploadData.error || "Physician created, but the profile photo upload failed.");
      }
      router.push(`/settings/users?organizationId=${encodeURIComponent(data.user.organizationId)}`);
    } catch (requestError: any) {
      setError(requestError.message || "Unable to create physician.");
    } finally {
      setIsSaving(false);
    }
  };

  return <main className="readable-route min-h-full bg-paper p-6 text-ink md:p-8"><div className="mx-auto max-w-3xl space-y-6">
    <header><Link href={`/settings/users${selectedOrganizationId ? `?organizationId=${encodeURIComponent(selectedOrganizationId)}` : ""}`} className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-pine hover:underline"><ArrowLeft className="h-3 w-3" /> Physicians &amp; Medical Staff</Link><div className="flex items-center gap-2"><Stethoscope className="h-5 w-5 text-pine" /><h1 className="text-2xl font-bold tracking-tight">Add Physician</h1></div><p className="mt-1 text-sm text-muted">Create a login-enabled physician or clinical team account for a hospital.</p></header>
    {error && <div className="rounded border border-brick/30 bg-brick-tint px-4 py-3 text-xs font-medium text-brick">{error}</div>}
    <form onSubmit={submit} className="card space-y-5 p-6">
      {isSuperAdmin && <label className="block text-xs font-semibold">Organisation<select required value={form.organizationId} onChange={(event) => update("organizationId", event.target.value)} className="mt-1 w-full rounded border border-line bg-paper p-3 text-xs"><option value="">Select hospital or clinic</option>{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select></label>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Physician name" required value={form.name} onChange={(value) => update("name", value)} placeholder="Dr. A. Sharma" />
        <Field label="Hospital email / User ID" required type="email" value={form.email} onChange={(value) => update("email", value)} placeholder="physician@hospital.org" />
        <Field label="Initial password" required type="password" value={form.password} onChange={(value) => update("password", value)} placeholder="At least 8 characters" />
        <Field label="Medical council registration number" value={form.registrationNo} onChange={(value) => update("registrationNo", value)} placeholder="State council / national registration number" />
        <SpecialtySelect value={form.specialty} options={specialties} onChange={(value) => update("specialty", value)} />
        <Field label="Qualifications" value={form.qualifications} onChange={(value) => update("qualifications", value)} placeholder="MBBS, MD, FRCS" />
        <Field label="Designation" value={form.designation} onChange={(value) => update("designation", value)} placeholder="Consultant Cardiologist" />
        <Field label="Profile photo URL" type="url" value={form.profilePhotoUrl} onChange={(value) => update("profilePhotoUrl", value)} placeholder="https://.../doctor.jpg" />
        <label className="block text-xs font-semibold text-ink">Upload profile photograph<input type="file" accept="image/*" onChange={(event) => setProfilePhotoFile(event.target.files?.[0] || null)} className="mt-1 block w-full rounded border border-line bg-paper px-3 py-2.5 text-xs" /><span className="mt-1 block text-[10px] font-normal text-muted">Optional. Image files up to 8 MB.</span></label>
      </div>
      <div className="flex justify-end gap-3 border-t border-line pt-5"><Link href={`/settings/users${selectedOrganizationId ? `?organizationId=${encodeURIComponent(selectedOrganizationId)}` : ""}`} className="rounded border border-line bg-surface px-4 py-2.5 text-xs font-semibold text-ink hover:border-pine">Cancel</Link><button type="submit" disabled={isSaving} className="inline-flex items-center gap-2 rounded bg-pine px-5 py-2.5 text-xs font-semibold text-white hover:bg-pine-dark disabled:opacity-50">{isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}{isSaving ? "Creating physician..." : "Create physician"}</button></div>
    </form>
  </div></main>;
}

function Field({ label, value, onChange, placeholder, type = "text", required = false }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; type?: string; required?: boolean }) {
  return <label className="block text-xs font-semibold text-ink">{label}{required ? " *" : ""}<input required={required} minLength={type === "password" ? 8 : undefined} type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="mt-1 w-full rounded border border-line bg-paper px-3 py-2.5 text-xs outline-none focus:border-pine focus:ring-2 focus:ring-pine/20" /></label>;
}

function SpecialtySelect({ value, options, onChange }: { value: string; options: SpecialtyOption[]; onChange: (value: string) => void }) {
  const groups = options.reduce<Record<string, SpecialtyOption[]>>((result, option) => { (result[option.category] ||= []).push(option); return result; }, {});
  return <label className="block text-xs font-semibold text-ink">Clinical specialty<select required value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded border border-line bg-paper px-3 py-2.5 text-xs outline-none focus:border-pine focus:ring-2 focus:ring-pine/20"><option value="">Select specialty</option>{Object.entries(groups).map(([category, categoryOptions]) => <optgroup key={category} label={category}>{categoryOptions.map((option) => <option key={option.name} value={option.name}>{option.name}</option>)}</optgroup>)}</select></label>;
}
