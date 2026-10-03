"use client";

import { FormEvent, useEffect, useState } from "react";
import { ArrowRight, Eye, EyeOff, LockKeyhole } from "lucide-react";
import BrandLogo from "@/components/BrandLogo";

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
  const [showPassword, setShowPassword] = useState(false);
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
    <main className="grid min-h-screen place-items-center bg-paper px-5 py-8 text-ink sm:px-8 lg:px-10">
      <div className="mx-auto grid w-full max-w-[1180px] grid-cols-1 items-stretch gap-6 lg:grid-cols-[minmax(0,1.674fr)_minmax(360px,1fr)]">
      <section className="order-1 flex min-h-[620px] items-center bg-surface px-6 py-10 sm:px-10 lg:order-2 lg:min-h-0 lg:px-10 xl:px-12">
        <div className="mx-auto w-full max-w-[440px]">
          <BrandLogo compact />

          <div className="mb-8 mt-12">
            <div className="mb-4 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-pine">
              <LockKeyhole className="h-3.5 w-3.5" />
              Secure clinical workspace
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-ink" style={{ fontFamily: "var(--font-serif)" }}>
              Sign in
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted">
              Sign in to manage clinical cases and review queues.
            </p>
          </div>

          <form onSubmit={continueToWorkspace} className="space-y-5">
            {error && (
              <div role="alert" className="rounded-lg border border-brick/30 bg-brick-tint p-3 text-xs font-medium text-brick">
                {error}
              </div>
            )}
            <div>
              <label htmlFor="login-user-id" className="mb-2 block text-xs font-semibold text-ink">User ID or email</label>
              <input
                id="login-user-id"
                name="userId"
                value={userId}
                onChange={(event) => setUserId(event.target.value)}
                placeholder="you@hospital.org"
                autoComplete="username"
                required
                className="w-full rounded border border-line bg-surface px-3.5 py-3 text-sm text-ink outline-none transition placeholder:text-muted/70 focus:border-pine focus:ring-4 focus:ring-pine-tint"
              />
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label htmlFor="login-password" className="text-xs font-semibold text-ink">Password</label>
                <button
                  type="button"
                  aria-expanded={forgotPassword}
                  onClick={() => {
                    setResetEmail(userId.includes("@") ? userId : "");
                    setForgotPassword((current) => !current);
                    setResetMessage(null);
                    setError(null);
                  }}
                  className="text-xs font-semibold text-pine hover:text-pine-dark"
                >
                  Forgot credentials?
                </button>
              </div>
              <div className="relative">
                <input
                  id="login-password"
                  name="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  required
                  className="w-full rounded border border-line bg-surface px-3.5 py-3 pr-12 text-sm text-ink outline-none transition placeholder:text-muted/70 focus:border-pine focus:ring-4 focus:ring-pine-tint"
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((visible) => !visible)}
                  className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted hover:text-ink"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            {forgotPassword && (
              <div className="rounded border border-line bg-pine-tint/40 p-4">
                <p className="text-xs leading-5 text-muted">Enter your account email and we&apos;ll send a secure reset link.</p>
                <input
                  value={resetEmail}
                  onChange={(event) => setResetEmail(event.target.value)}
                  type="email"
                  placeholder="you@hospital.org"
                  autoComplete="email"
                  required
                  aria-label="Account email for password reset"
                  className="mt-3 w-full rounded border border-line bg-surface px-3.5 py-3 text-sm text-ink outline-none transition placeholder:text-muted/70 focus:border-pine focus:ring-4 focus:ring-pine-tint"
                />
                <button type="button" onClick={() => void requestPasswordReset()} disabled={isResetting} className="mt-3 w-full rounded border border-pine px-4 py-3 text-sm font-semibold text-pine transition hover:bg-pine hover:text-white disabled:opacity-50">
                  {isResetting ? "Sending…" : "Send reset link"}
                </button>
                {resetMessage && <p role="status" className="mt-3 text-xs leading-5 text-pine">{resetMessage}</p>}
              </div>
            )}
            <button type="submit" disabled={isSubmitting} className="flex w-full items-center justify-center gap-2 rounded bg-pine px-4 py-3 text-sm font-semibold text-white transition hover:bg-pine-dark disabled:opacity-50">
              {isSubmitting ? "Signing in…" : "Sign in"}
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          <p className="mt-8 border-t border-line pt-5 text-xs leading-5 text-muted">
            Clinical records are protected, and access and review actions are recorded in the audit trail.
          </p>
        </div>
      </section>

      <section aria-label="Clinical workflow examples" className="relative order-2 flex h-[360px] flex-col justify-end overflow-hidden rounded-[28px] bg-slate-950 px-7 py-8 text-white sm:px-10 sm:py-10 lg:order-1 lg:h-[660px] lg:px-10 lg:py-10 xl:px-12">
        <img
          key={activeVisual}
          src={LOGIN_VISUALS[activeVisual].image}
          alt={LOGIN_VISUALS[activeVisual].title}
          className="login-visual-fade absolute left-[11%] top-[5%] h-[43%] w-[78%] rounded-lg border border-white/15 bg-slate-950/70 p-2 object-contain object-center lg:left-[8%] lg:top-[6%] lg:h-[64%] lg:w-[84%] lg:rounded-xl lg:p-3"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/95 via-slate-950/25 to-slate-950/10" />
        <div className="relative max-w-2xl pb-12">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-white/75">
            {LOGIN_VISUALS[activeVisual].eyebrow}
          </p>
          <h2 className="max-w-xl text-3xl font-semibold leading-tight sm:text-4xl" style={{ fontFamily: "var(--font-serif)" }}>
            {LOGIN_VISUALS[activeVisual].title}
          </h2>
          <p className="mt-3 max-w-lg text-sm leading-6 text-white/80">
            {LOGIN_VISUALS[activeVisual].detail}
          </p>
        </div>
        <div className="absolute bottom-8 right-7 flex items-center gap-2 sm:right-10 lg:bottom-12 lg:right-12 xl:right-16" aria-label="Workflow slides">
          {LOGIN_VISUALS.map((visual, index) => (
            <button
              key={visual.eyebrow}
              type="button"
              aria-label={`Show ${visual.eyebrow}`}
              aria-current={activeVisual === index ? "true" : undefined}
              onClick={() => setActiveVisual(index)}
              className={`grid h-9 w-9 place-items-center border text-xs font-semibold transition ${activeVisual === index ? "border-white bg-white text-pine-dark" : "border-white/50 bg-slate-950/20 text-white hover:bg-white/15"}`}
            >
              {String(index + 1).padStart(2, "0")}
            </button>
          ))}
        </div>
      </section>
      </div>

      <style jsx global>{`
        @keyframes login-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .login-visual-fade {
          animation: login-fade-in 700ms ease-out both;
        }

        @media (prefers-reduced-motion: reduce) {
          .login-visual-fade { animation: none; }
        }
      `}</style>
    </main>
  );
}
