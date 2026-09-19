"use client";

import { FormEvent, useEffect, useState } from "react";
import { ArrowRight, LockKeyhole, ShieldCheck } from "lucide-react";
import BrandLogo from "@/components/BrandLogo";

const DEMO_ACCOUNTS = [
  { label: "Super Admin", value: "superadmin@macula.health", password: "MaculaAdmin@2026!", detail: "Full governance access" },
  { label: "Organization Administrator", value: "admin@hospital.in", password: "MaculaAdmin@2026!", detail: "Manipal Hospital Retina Institute" },
  { label: "Physician", value: "doctor@hospital.in", password: "MaculaDoctor@2026!", detail: "Clinical operations" },
  { label: "Organization Administrator", value: "role-admin@bangalore-hospital.test", password: "MaculaTest@2026!", detail: "Bangalore Hospital role test" },
  { label: "Attending RMP", value: "role-rmp@bangalore-hospital.test", password: "MaculaTest@2026!", detail: "Bangalore Hospital role test" },
  { label: "Compliance Officer", value: "role-compliance@bangalore-hospital.test", password: "MaculaTest@2026!", detail: "Bangalore Hospital role test" },
  { label: "Publishing Editor", value: "role-publishing@bangalore-hospital.test", password: "MaculaTest@2026!", detail: "Bangalore Hospital role test" },
  { label: "Auditor", value: "role-auditor@bangalore-hospital.test", password: "MaculaTest@2026!", detail: "Bangalore Hospital role test" },
];

const LOGIN_VISUALS = [
  {
    eyebrow: "01 / Capture",
    title: "A clear starting point",
    detail: "Clinician narratives enter the workspace as source material for review.",
    image: "/workflow-01.png",
  },
  {
    eyebrow: "02 / Structure",
    title: "A record built for people",
    detail: "The narrative is organized into a readable Master Clinical Record.",
    image: "/workflow-02.png",
  },
  {
    eyebrow: "03 / Review",
    title: "Governance before release",
    detail: "Safety flags, RMP oversight, and approval gates stay visible throughout.",
    image: "/workflow-03.png",
  },
] as const;

export default function LoginPage() {
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [forgotPassword, setForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeVisual, setActiveVisual] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveVisual((current) => (current + 1) % LOGIN_VISUALS.length);
    }, 5600);
    return () => window.clearInterval(timer);
  }, []);

  const continueToWorkspace = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    let navigationStarted = false;

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, password }),
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Login failed.");
        return;
      }
      navigationStarted = true;
      window.location.replace(`/?from=login&t=${Date.now()}`);
    } catch (requestError) {
      setError(requestError instanceof DOMException && requestError.name === "AbortError"
        ? "Sign-in timed out. Please try again."
        : "Unable to reach the sign-in service.");
    } finally {
      window.clearTimeout(timeout);
      if (!navigationStarted) setIsSubmitting(false);
    }
  };

  const requestPasswordReset = async () => {
    if (!resetEmail.trim()) {
      setError("Enter your account email to request a password reset.");
      return;
    }
    setIsResetting(true);
    setError(null);
    setResetMessage(null);
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resetEmail }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Unable to request a password reset.");
        return;
      }
      setResetMessage(data.message);
    } catch {
      setError("Unable to reach the password reset service.");
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <main className="min-h-screen bg-paper text-ink lg:grid lg:grid-cols-[1.08fr_0.92fr]">
      <section className="relative hidden overflow-hidden bg-pine-dark p-12 text-white lg:flex lg:flex-col lg:justify-start">
        <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,.12)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.12)_1px,transparent_1px)] [background-size:48px_48px]" />
        <div className="relative">
          <BrandLogo invert />

          {error && <div className="mb-4 rounded-lg border border-brick/30 bg-brick-tint p-3 text-xs text-brick">{error}</div>}
        </div>

        <div className="relative mt-12 max-w-xl py-6">
          <p className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-pine-tint">
            <span className="h-px w-8 bg-pine-tint" />
            A governed clinical workflow
          </p>
          <h1 className="max-w-2xl text-4xl font-bold leading-tight" style={{ fontFamily: "var(--font-serif)" }}>
            From narrative to reviewable record.
          </h1>
          <p className="mt-3 max-w-lg text-sm leading-6 text-pine-tint">
            A secure workspace for turning clinician input into structured records that remain under human and compliance review.
          </p>

          <div className="relative mt-5 max-w-2xl overflow-hidden rounded-2xl border border-white/15 bg-slate-950/60 p-3 shadow-2xl backdrop-blur-xl">
            <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-emerald-400/10 blur-3xl" />
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-400/15 text-emerald-300">
                  <ShieldCheck className="h-4 w-4" />
                </span>
                Secure clinical workflow
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-300">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-60" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-300" />
                </span>
                Human review required
              </span>
            </div>

            <div className="relative mt-3 overflow-hidden rounded-xl border border-white/10 bg-slate-900/80">
              <div key={activeVisual} className="login-visual-fade">
                <img
                  src={LOGIN_VISUALS[activeVisual].image}
                  alt={LOGIN_VISUALS[activeVisual].title}
                  className="block aspect-video w-full object-cover"
                />
                <div className="border-t border-white/10 px-3 py-2">
                  <p className="text-[10px] font-mono uppercase tracking-[0.14em] text-emerald-300">
                    {LOGIN_VISUALS[activeVisual].eyebrow}
                  </p>
                  <p className="mt-1 text-[10px] leading-4 text-slate-400">{LOGIN_VISUALS[activeVisual].detail}</p>
                </div>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-center gap-1.5" aria-label="Workflow preview slides">
              {LOGIN_VISUALS.map((visual, index) => (
                <button
                  key={visual.eyebrow}
                  type="button"
                  aria-label={`Show ${visual.eyebrow}`}
                  onClick={() => setActiveVisual(index)}
                  className={`h-1.5 rounded-full transition-all ${activeVisual === index ? "w-7 bg-emerald-300" : "w-1.5 bg-slate-600 hover:bg-slate-400"}`}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="relative mt-auto flex items-center justify-between border-t border-white/20 pt-5 text-[11px] text-pine-tint">
          <span>Secure clinical workspace</span>
          <span>v1.0</span>
        </div>

        <style jsx global>{`
          @keyframes login-fade-in {
            from { opacity: 0; transform: translateY(5px); }
            to { opacity: 1; transform: translateY(0); }
          }

          .login-visual-fade {
            animation: login-fade-in 700ms ease-out both;
          }

          @media (prefers-reduced-motion: reduce) {
            .login-visual-fade { animation: none; }
          }
        `}</style>
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
            {error && (
              <div role="alert" className="rounded-lg border border-brick/30 bg-brick-tint p-3 text-xs font-medium text-brick">
                {error}
              </div>
            )}
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
                <button
                  type="button"
                  onClick={() => {
                    setResetEmail(userId.includes("@") ? userId : "");
                    setForgotPassword((current) => !current);
                    setResetMessage(null);
                    setError(null);
                  }}
                  className="text-xs font-semibold text-pine hover:text-pine-dark"
                >
                  Forgot password?
                </button>
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
            {forgotPassword && (
              <div className="rounded-lg border border-line bg-pine-tint/40 p-4">
                <p className="text-xs leading-5 text-muted">Enter your account email and we&apos;ll send a secure reset link.</p>
                <input
                  value={resetEmail}
                  onChange={(event) => setResetEmail(event.target.value)}
                  type="email"
                  placeholder="you@hospital.org"
                  autoComplete="email"
                  required
                  className="mt-3 w-full rounded-lg border border-line bg-surface px-3.5 py-3 text-sm text-ink outline-none transition placeholder:text-muted/70 focus:border-pine focus:ring-4 focus:ring-pine-tint"
                />
                <button type="button" onClick={() => void requestPasswordReset()} disabled={isResetting} className="mt-3 w-full rounded-lg border border-pine px-4 py-3 text-sm font-semibold text-pine transition hover:bg-pine hover:text-white disabled:opacity-50">
                  {isResetting ? "Sending…" : "Send reset link"}
                </button>
                {resetMessage && <p role="status" className="mt-3 text-xs leading-5 text-pine">{resetMessage}</p>}
              </div>
            )}
            <button type="submit" disabled={isSubmitting} className="flex w-full items-center justify-center gap-2 rounded-lg bg-pine px-4 py-3 text-sm font-semibold text-white transition hover:bg-pine-dark disabled:opacity-50">
              {isSubmitting ? "Signing in…" : "Continue"}
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          <div className="my-8 flex items-center gap-3 text-[11px] uppercase tracking-[0.14em] text-muted">
            <span className="h-px flex-1 bg-line" />
            Demo and role-test access
            <span className="h-px flex-1 bg-line" />
          </div>

          <div className="space-y-2">
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account.value}
                type="button"
                onClick={() => {
                  setUserId(account.value);
                  setPassword(account.password);
                }}
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
            Use an approved workspace account. Shortcuts populate the test credentials for local evaluation.
          </p>
        </div>
      </section>
    </main>
  );
}
