"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, FileText, LockKeyhole, ShieldCheck } from "lucide-react";
import BrandLogo from "@/components/BrandLogo";

const DEMO_ACCOUNTS = [
  { label: "Super Admin", value: "superadmin@macula.health", detail: "Full governance access" },
  { label: "Hospital Admin", value: "admin@hospital.in", detail: "Clinical operations" },
  { label: "Physician", value: "doctor@hospital.in", detail: "Clinical operations" },
];

export default function LoginPage() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const continueToWorkspace = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, password }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "Login failed.");
      setIsSubmitting(false);
      return;
    }
    router.push("/");
  };

  return (
    <main className="min-h-screen bg-paper text-ink lg:grid lg:grid-cols-[1.08fr_0.92fr]">
      <section className="relative hidden overflow-hidden bg-pine-dark p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,.12)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.12)_1px,transparent_1px)] [background-size:48px_48px]" />
        <div className="relative">
          <BrandLogo invert />

          {error && <div className="mb-4 rounded-lg border border-brick/30 bg-brick-tint p-3 text-xs text-brick">{error}</div>}
        </div>

        <div className="relative max-w-xl py-16">
          <p className="mb-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-pine-tint">
            <span className="h-px w-8 bg-pine-tint" />
            Clinical records, ready for review
          </p>
          <h1 className="max-w-2xl text-4xl font-bold leading-tight" style={{ fontFamily: "var(--font-serif)" }}>
            Turn every dictation into a record your team can trust.
          </h1>
          <p className="mt-5 max-w-lg text-sm leading-7 text-pine-tint">
            Capture medical narratives, refine the transcript, and move each case through a clear review and governance workflow.
          </p>
          <div className="mt-8 grid max-w-lg grid-cols-2 gap-3 text-xs">
            {["Audio to clinical record", "Review before publishing", "Organization-level controls", "Audit-ready case history"].map((item) => (
              <div key={item} className="flex items-start gap-2 border-t border-white/20 pt-3 text-pine-tint">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative flex items-center justify-between border-t border-white/20 pt-5 text-[11px] text-pine-tint">
          <span>Secure clinical workspace</span>
          <span>v1.0</span>
        </div>
      </section>

      <section className="flex min-h-screen items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-md">
          <div className="mb-10 lg:hidden">
            <BrandLogo compact />
          </div>

          <div className="mb-8">
            <div className="mb-4 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-pine">
              <LockKeyhole className="h-3.5 w-3.5" />
              Secure workspace access
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-ink" style={{ fontFamily: "var(--font-serif)" }}>
              Welcome back
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Sign in to continue managing clinical cases and review queues.
            </p>
          </div>

          <form onSubmit={continueToWorkspace} className="space-y-5">
            <label className="block">
              <span className="mb-2 block text-xs font-semibold text-ink">User ID or email</span>
              <input
                value={userId}
                onChange={(event) => setUserId(event.target.value)}
                placeholder="you@hospital.org"
                autoComplete="username"
                required
                className="w-full rounded-lg border border-line bg-surface px-3.5 py-3 text-sm text-ink outline-none transition placeholder:text-muted/70 focus:border-pine focus:ring-4 focus:ring-pine-tint"
              />
            </label>
            <label className="block">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-ink">Password</span>
                <button type="button" className="text-xs font-semibold text-pine hover:text-pine-dark">Forgot password?</button>
              </div>
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                placeholder="Enter your password"
                autoComplete="current-password"
                required
                className="w-full rounded-lg border border-line bg-surface px-3.5 py-3 text-sm text-ink outline-none transition placeholder:text-muted/70 focus:border-pine focus:ring-4 focus:ring-pine-tint"
              />
            </label>
            <button type="submit" disabled={isSubmitting} className="flex w-full items-center justify-center gap-2 rounded-lg bg-pine px-4 py-3 text-sm font-semibold text-white transition hover:bg-pine-dark disabled:opacity-50">
              {isSubmitting ? "Signing in…" : "Continue"}
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          <div className="my-8 flex items-center gap-3 text-[11px] uppercase tracking-[0.14em] text-muted">
            <span className="h-px flex-1 bg-line" />
            Local demo access
            <span className="h-px flex-1 bg-line" />
          </div>

          <div className="space-y-2">
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account.value}
                type="button"
                onClick={() => setUserId(account.value)}
                className="flex w-full items-center justify-between rounded-lg border border-line bg-surface px-3.5 py-3 text-left transition hover:border-pine/50 hover:bg-pine-tint"
              >
                <span>
                  <span className="block text-xs font-semibold text-ink">{account.label}</span>
                  <span className="mt-0.5 block text-[11px] text-muted">{account.detail}</span>
                </span>
                <span className="font-mono text-[11px] text-pine">{account.value}</span>
              </button>
            ))}
          </div>

          <p className="mt-8 flex items-start gap-2 text-[11px] leading-5 text-muted">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-pine" />
            Use an approved workspace account. Demo shortcuts only populate the user ID field.
          </p>
        </div>
      </section>
    </main>
  );
}
