"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Building2, Mail, ShieldCheck, Stethoscope, UserCircle } from "lucide-react";

type ProfileUser = {
  name: string;
  email: string;
  registrationNo: string | null;
  specialty: string | null;
  designation: string | null;
  qualifications: string | null;
  profilePhotoUrl: string | null;
  organizationName: string | null;
  role: { name: string; slug: string } | null;
  isSuperAdmin: boolean;
};

export default function MyProfilePage() {
  const [user, setUser] = useState<ProfileUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSaving, setPasswordSaving] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "same-origin" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load your profile.");
        setUser(data.user);
      })
      .catch((requestError: Error) => setError(requestError.message));
  }, []);

  const initials = (user?.name || "User").split(" ").filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  const changePassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordSaving(true);
    setPasswordError(null);
    setPasswordMessage(null);
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const response = await fetch("/api/auth/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
    const data = await response.json();
    if (response.ok) { setPasswordMessage(data.message); event.currentTarget.reset(); } else setPasswordError(data.error || "Unable to update password.");
    setPasswordSaving(false);
  };

  return (
    <main className="readable-route min-h-full bg-paper p-6 text-ink md:p-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <header>
          <Link href="/" className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-pine hover:underline">
            <ArrowLeft className="h-3 w-3" /> Dashboard
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-ink">My Profile</h1>
          <p className="mt-1 text-sm text-muted">View the account and professional details associated with your current login.</p>
        </header>

        {error && <div className="rounded border border-brick/30 bg-brick-tint px-4 py-3 text-xs font-medium text-brick">{error}</div>}
        {!user && !error && <div className="card p-8 text-center text-sm text-muted">Loading your profile...</div>}

        {user && <>
          <section className="card flex flex-col gap-5 p-6 sm:flex-row sm:items-center">
            {user.profilePhotoUrl ? <img src={user.profilePhotoUrl} alt={user.name} className="h-20 w-20 rounded-lg object-cover" /> : <div className="flex h-20 w-20 items-center justify-center rounded-lg bg-pine text-xl font-bold text-white">{initials}</div>}
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-ink">{user.name}</h2>
              <p className="mt-1 text-sm text-pine">{user.designation || user.specialty || "Clinical team member"}</p>
              <p className="mt-2 flex items-center gap-1.5 text-xs text-muted"><Mail className="h-3.5 w-3.5" /> {user.email}</p>
            </div>
          </section>

          <section className="card p-6">
            <h2 className="mb-4 flex items-center gap-2 border-b border-line pb-3 text-[11px] font-bold uppercase tracking-wider text-muted"><UserCircle className="h-4 w-4 text-pine" /> Professional details</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Detail label="Qualifications" value={user.qualifications} />
              <Detail label="Specialty" value={user.specialty} />
              <Detail label="Designation" value={user.designation} />
              <Detail label="Registration number" value={user.registrationNo} />
            </div>
          </section>

          <section className="card p-6">
            <h2 className="mb-4 flex items-center gap-2 border-b border-line pb-3 text-[11px] font-bold uppercase tracking-wider text-muted"><Building2 className="h-4 w-4 text-pine" /> Workspace access</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Detail label="Organisation" value={user.organizationName} />
              <Detail label="Role" value={user.isSuperAdmin ? "Platform Administrator" : user.role?.name || "Assigned workspace user"} />
            </div>
            <p className="mt-5 flex items-start gap-2 border-t border-line pt-4 text-xs leading-5 text-muted"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-sage" /> Your access is controlled by the organisation role and task permissions assigned to this account.</p>
          </section>
          <section className="card p-6">
            <h2 className="mb-4 flex items-center gap-2 border-b border-line pb-3 text-[11px] font-bold uppercase tracking-wider text-muted"><ShieldCheck className="h-4 w-4 text-pine" /> Security</h2>
            <form onSubmit={changePassword} className="space-y-4">
              {passwordError && <p className="rounded border border-brick/30 bg-brick-tint px-3 py-2 text-xs text-brick">{passwordError}</p>}
              {passwordMessage && <p className="rounded border border-sage/30 bg-sage-tint px-3 py-2 text-xs text-sage">{passwordMessage}</p>}
              <DetailInput label="Current password" name="currentPassword" />
              <DetailInput label="New password" name="newPassword" minLength={8} />
              <DetailInput label="Confirm new password" name="confirmPassword" minLength={8} />
              <button type="submit" disabled={passwordSaving} className="rounded bg-pine px-4 py-2 text-xs font-semibold text-white hover:bg-pine-dark disabled:opacity-50">{passwordSaving ? "Updating..." : "Update password"}</button>
            </form>
          </section>
        </>}
      </div>
    </main>
  );
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return <div><p className="text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</p><p className="mt-1 text-sm text-ink">{value || "Not provided"}</p></div>;
}

function DetailInput({ label, name, minLength }: { label: string; name: string; minLength?: number }) {
  return <label className="block text-xs font-semibold text-ink">{label}<input name={name} type="password" required minLength={minLength} autoComplete="new-password" className="mt-1 w-full rounded border border-line bg-paper px-3 py-2.5 text-xs outline-none focus:border-pine focus:ring-2 focus:ring-pine/20" /></label>;
}
