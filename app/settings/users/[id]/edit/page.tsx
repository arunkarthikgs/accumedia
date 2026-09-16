"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Loader2, UserCircle } from "lucide-react";

type UserRecord = { id: string; name: string; email: string; registrationNo?: string | null; specialty?: string | null; qualifications?: string | null; designation?: string | null; profilePhotoUrl?: string | null; organization?: { id: string; name: string } };

export default function EditUserPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const organizationId = searchParams.get("organizationId") || "";
  const [user, setUser] = useState<UserRecord | null>(null);
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [form, setForm] = useState({ name: "", email: "", password: "", registrationNo: "", specialty: "", qualifications: "", designation: "", profilePhotoUrl: "" });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/users${organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : ""}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load user.");
        const found = (data.users || []).find((item: UserRecord) => item.id === params.id);
        if (!found) throw new Error("User not found in this organisation.");
        setUser(found);
        setForm({ name: found.name, email: found.email, password: "", registrationNo: found.registrationNo || "", specialty: found.specialty || "", qualifications: found.qualifications || "", designation: found.designation || "", profilePhotoUrl: found.profilePhotoUrl || "" });
      })
      .catch((requestError: Error) => setError(requestError.message));
    fetch("/api/specialties", { credentials: "same-origin" }).then((response) => response.json()).then((data) => setSpecialties((data.specialties || []).map((item: { name: string }) => item.name))).catch(() => undefined);
  }, [params.id, organizationId]);

  const update = (field: keyof typeof form, value: string) => setForm((current) => ({ ...current, [field]: value }));
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/users", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: params.id, ...form }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to update user.");
      router.push(`/settings/users?organizationId=${encodeURIComponent(data.user.organizationId || organizationId)}`);
    } catch (requestError: any) {
      setError(requestError.message || "Unable to update user.");
    } finally {
      setIsSaving(false);
    }
  };

  return <main className="readable-route min-h-full bg-paper p-6 text-ink md:p-8"><div className="mx-auto max-w-3xl space-y-6">
    <header><Link href={`/settings/users${organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : ""}`} className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-pine hover:underline"><ArrowLeft className="h-3 w-3" /> Physicians &amp; Medical Staff</Link><div className="flex items-center gap-2"><UserCircle className="h-5 w-5 text-pine" /><h1 className="text-2xl font-bold tracking-tight">Edit User Profile</h1></div><p className="mt-1 text-sm text-muted">Update the user’s professional profile and login details.</p></header>
    {error && <div className="rounded border border-brick/30 bg-brick-tint px-4 py-3 text-xs font-medium text-brick">{error}</div>}
    {!user && !error && <div className="card p-8 text-center text-sm text-muted">Loading user profile...</div>}
    {user && <form onSubmit={submit} className="card space-y-5 p-6">
      <div className="rounded border border-line bg-paper px-3 py-2 text-xs text-muted">Organisation: <strong className="text-ink">{user.organization?.name || "Current organisation"}</strong></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="User name" required value={form.name} onChange={(value) => update("name", value)} placeholder="Dr. A. Sharma" />
        <Field label="Email / User ID" required type="email" value={form.email} onChange={(value) => update("email", value)} placeholder="physician@hospital.org" />
        <Field label="New password" type="password" value={form.password} onChange={(value) => update("password", value)} placeholder="Leave blank to keep current password" />
        <Field label="Medical council registration number" value={form.registrationNo} onChange={(value) => update("registrationNo", value)} placeholder="Registration number" />
        <label className="block text-xs font-semibold text-ink">Clinical specialty<select required value={form.specialty} onChange={(event) => update("specialty", event.target.value)} className="mt-1 w-full rounded border border-line bg-paper px-3 py-2.5 text-xs outline-none focus:border-pine focus:ring-2 focus:ring-pine/20"><option value="">Select specialty</option>{specialties.map((specialty) => <option key={specialty} value={specialty}>{specialty}</option>)}{form.specialty && !specialties.includes(form.specialty) && <option value={form.specialty}>{form.specialty} (legacy)</option>}</select></label>
        <Field label="Qualifications" value={form.qualifications} onChange={(value) => update("qualifications", value)} placeholder="MBBS, MD, FRCS" />
        <Field label="Designation" value={form.designation} onChange={(value) => update("designation", value)} placeholder="Consultant Cardiologist" />
        <Field label="Profile photo URL" type="url" value={form.profilePhotoUrl} onChange={(value) => update("profilePhotoUrl", value)} placeholder="https://.../doctor.jpg" />
      </div>
      <div className="flex justify-end gap-3 border-t border-line pt-5"><Link href={`/settings/users${organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : ""}`} className="rounded border border-line bg-surface px-4 py-2.5 text-xs font-semibold text-ink hover:border-pine">Cancel</Link><button type="submit" disabled={isSaving} className="inline-flex items-center gap-2 rounded bg-pine px-5 py-2.5 text-xs font-semibold text-white hover:bg-pine-dark disabled:opacity-50">{isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}{isSaving ? "Saving changes..." : "Save changes"}</button></div>
    </form>}
  </div></main>;
}

function Field({ label, value, onChange, placeholder, type = "text", required = false }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; type?: string; required?: boolean }) {
  return <label className="block text-xs font-semibold text-ink">{label}{required ? " *" : ""}<input required={required} minLength={type === "password" && value ? 12 : undefined} type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="mt-1 w-full rounded border border-line bg-paper px-3 py-2.5 text-xs outline-none focus:border-pine focus:ring-2 focus:ring-pine/20" /></label>;
}
