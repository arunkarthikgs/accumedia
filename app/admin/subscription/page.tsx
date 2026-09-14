"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, CreditCard, Loader2, Save } from "lucide-react";

export default function SubscriptionPage() {
  const [organizationId, setOrganizationId] = useState("");
  const [plans, setPlans] = useState<any[]>([]);
  const [subscription, setSubscription] = useState<any>(null);
  const [selectedPlan, setSelectedPlan] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [quota, setQuota] = useState<any>(null);

  useEffect(() => {
    async function load() {
      const organizations = await (await fetch("/api/admin/organizations")).json();
      const first = organizations.organizations?.[0];
      if (!first) return setIsLoading(false);
      setOrganizationId(first.id);
      const data = await (await fetch(`/api/admin/subscription?orgId=${first.id}`)).json();
      setPlans(data.plans || []);
      setSubscription(data.subscription);
      setQuota(data.quota);
      setSelectedPlan(data.subscription?.planId || data.plans?.[0]?.id || "");
      setIsLoading(false);
    }
    load().catch(() => setIsLoading(false));
  }, []);

  const save = async () => {
    setIsSaving(true);
    setMessage(null);
    const response = await fetch("/api/admin/subscription", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, planId: selectedPlan, status: "ACTIVE" }),
    });
    const data = await response.json();
    setIsSaving(false);
    if (!response.ok) return setMessage(data.error || "Unable to save subscription.");
    setSubscription(data.subscription);
    setMessage("Subscription plan saved.");
  };

  const lifecycle = async (action: "cancel" | "renew" | "activate") => {
    const response = await fetch("/api/admin/subscription", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId, action }) });
    const data = await response.json();
    if (!response.ok) return setMessage(data.error || "Unable to update subscription.");
    setSubscription(data.subscription);
    const quotaResponse = await fetch(`/api/admin/subscription?orgId=${organizationId}`);
    const quotaData = await quotaResponse.json();
    setQuota(quotaData.quota);
    setMessage(`Subscription ${action}d.`);
  };

  return (
    <main className="readable-route ml-0 mr-auto max-w-5xl space-y-6 p-6 md:p-8">
      <header>
        <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-pine"><Link href="/" className="flex items-center gap-1 hover:underline"><ArrowLeft className="h-3 w-3" /> Dashboard</Link><span>/</span><span>Subscription</span></div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">Subscription &amp; Quotas</h1>
        <p className="mt-0.5 text-xs text-muted">Configure plan limits before billing and overage enforcement are connected.</p>
      </header>
      {isLoading ? <div className="rounded-lg border border-line bg-surface p-12 text-center text-sm text-muted"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-pine" />Loading subscription…</div> : <section className="rounded-lg border border-line bg-surface p-6"><div className="flex items-center gap-2"><CreditCard className="h-5 w-5 text-pine" /><h2 className="text-sm font-bold text-ink">Current plan</h2></div><p className="mt-1 text-xs text-muted">Status: {subscription?.status || "Not configured"} · Period ends {subscription?.currentPeriodEnd ? new Date(subscription.currentPeriodEnd).toLocaleDateString() : "—"}</p><div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">{quota && Object.entries({ Cases: quota.cases, "Audio minutes": quota.audioMinutes, "AI tokens": quota.aiTokens, Assets: quota.assets }).map(([label, value]: [string, any]) => <div key={label} className="rounded border border-line bg-paper p-3"><p className="text-[10px] uppercase text-muted">{label}</p><p className="mt-1 text-sm font-bold text-ink">{value.used.toLocaleString()} / {value.limit ?? "∞"}</p></div>)}</div><div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">{plans.map((plan) => <button type="button" key={plan.id} onClick={() => setSelectedPlan(plan.id)} className={`rounded-lg border p-4 text-left ${selectedPlan === plan.id ? "border-pine bg-pine-tint" : "border-line bg-paper"}`}><p className="text-sm font-bold text-ink">{plan.name}</p><p className="mt-2 text-xs text-muted">{plan.monthlyCaseLimit ?? "Unlimited"} cases · {plan.monthlyAudioMinutes ?? "Unlimited"} audio minutes · {plan.monthlyAiTokens ?? "Unlimited"} AI tokens</p></button>)}</div><div className="mt-5 flex flex-wrap gap-2"><button type="button" disabled={!selectedPlan || isSaving} onClick={save} className="flex items-center gap-2 rounded-lg bg-pine px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"><Save className="h-3.5 w-3.5" />{isSaving ? "Saving…" : "Save plan"}</button><button type="button" onClick={() => lifecycle("renew")} className="rounded-lg border border-line px-3 py-2 text-xs font-semibold text-ink">Renew period</button><button type="button" onClick={() => lifecycle(subscription?.status === "CANCELLED" ? "activate" : "cancel")} className="rounded-lg border border-brick/30 bg-brick-tint px-3 py-2 text-xs font-semibold text-brick">{subscription?.status === "CANCELLED" ? "Activate" : "Cancel"}</button></div>{message && <p className="mt-3 text-xs text-muted">{message}</p>}</section>}
    </main>
  );
}
