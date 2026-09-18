"use client";

import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import BrandLogo from "@/components/BrandLogo";

export default function ResetPasswordPage() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const response = await fetch("/api/auth/password-reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password, confirmPassword }) });
    const data = await response.json();
    if (!response.ok) return setError(data.error || "Unable to set password.");
    setMessage("Password set successfully. You can now sign in.");
    window.setTimeout(() => router.push("/login"), 1000);
  };
  return <main className="min-h-screen bg-paper"><header className="flex items-center justify-between border-b border-line bg-surface px-6 py-4 md:px-10"><Link href="/login" aria-label="Accumedia sign in"><BrandLogo compact /></Link><Link href="/login" className="rounded border border-line bg-paper px-3 py-2 text-xs font-semibold text-ink hover:border-pine hover:text-pine">Sign in</Link></header><div className="flex items-center justify-center p-6 md:p-10"><form onSubmit={submit} className="w-full max-w-md space-y-5 rounded-lg border border-line bg-surface p-6"><h1 className="text-xl font-bold text-ink">Set your Accumedia password</h1><p className="text-xs text-muted">Choose a password of at least 8 characters for your account.</p>{error && <p className="rounded border border-brick/30 bg-brick-tint p-3 text-xs text-brick">{error}</p>}{message && <p className="rounded border border-pine/30 bg-pine-tint p-3 text-xs text-pine">{message}</p>}<label className="block text-xs font-semibold text-ink">New password<input required minLength={8} type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 w-full rounded border border-line bg-paper px-3 py-2.5 text-xs" /></label><label className="block text-xs font-semibold text-ink">Confirm password<input required minLength={8} type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="mt-1 w-full rounded border border-line bg-paper px-3 py-2.5 text-xs" /></label><button type="submit" disabled={!token} className="w-full rounded bg-pine px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-50">Set password</button><Link href="/login" className="block text-center text-xs font-semibold text-pine hover:underline">Back to sign in</Link></form></div></main>;
}