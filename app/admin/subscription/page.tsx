"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Building2, CreditCard, Loader2, Save, Settings2, Gauge } from "lucide-react";
import { formatDate } from "@/lib/date-format";

export default function SubscriptionPage() {
  const [organizations, setOrganizations] = useState<
    { id: string; name: string }[]
  >([]);
  const [organizationLoadError, setOrganizationLoadError] = useState<
    string | null
  >(null);
  const [organizationId, setOrganizationId] = useState("");
  const [plans, setPlans] = useState<any[]>([]);
  const [subscription, setSubscription] = useState<any>(null);
  const [selectedPlan, setSelectedPlan] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isPaying, setIsPaying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [quota, setQuota] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"current" | "catalog" | "quotas">("current");
  const [editingPlan, setEditingPlan] = useState<any>(null);
  const [planForm, setPlanForm] = useState({ name: "", sortOrder: 0, monthlyCaseLimit: "", monthlyAudioMinutes: "", monthlyAiTokens: "", monthlyAssetLimit: "", monthlyPrice: "", currency: "INR", billingInterval: "monthly", setupFee: "", isCustom: false, overagePolicy: "" });

  useEffect(() => {
    fetch("/api/admin/organizations")
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Unable to load organizations.");
        return data;
      })
      .then(async (data) => {
        let orgs = data.organizations || [];
        if (orgs.length === 0) {
          const fallbackResponse = await fetch("/api/organizations");
          const fallbackData = await fallbackResponse.json();
          if (fallbackResponse.ok) orgs = fallbackData.organizations || [];
        }
        setOrganizations(orgs);
        if (orgs[0]) setOrganizationId(orgs[0].id);
        else {
          setOrganizationLoadError(
            "No organizations are available for subscription management.",
          );
          setIsLoading(false);
        }
      })
      .catch((error: Error) => {
        setOrganizationLoadError(error.message);
        setIsLoading(false);
      });
  }, []);

  useEffect(() => {
    async function load() {
      if (!organizationId) return;
      const cacheKey = `macula:subscription:${organizationId}`;
      try {
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
          const cachedData = JSON.parse(cached) as {
            data: any;
            cachedAt: number;
          };
          if (Date.now() - cachedData.cachedAt < 60_000) {
            setPlans(cachedData.data.plans || []);
            setSubscription(cachedData.data.subscription);
            setQuota(cachedData.data.quota);
            setSelectedPlan(
              cachedData.data.subscription?.planId ||
                cachedData.data.plans?.[0]?.id ||
                "",
            );
            setIsLoading(false);
          }
        }
      } catch {
        // Ignore unavailable or invalid browser cache.
      }
      const data = await (
        await fetch(`/api/admin/subscription?orgId=${organizationId}`)
      ).json();
      setPlans(data.plans || []);
      setSubscription(data.subscription);
      setQuota(data.quota);
      setSelectedPlan(data.subscription?.planId || data.plans?.[0]?.id || "");
      try {
        sessionStorage.setItem(
          cacheKey,
          JSON.stringify({ data, cachedAt: Date.now() }),
        );
      } catch {
        /* Ignore storage limits. */
      }
      setIsLoading(false);
    }
    load().catch(() => setIsLoading(false));
  }, [organizationId]);

  const save = async () => {
    setIsSaving(true);
    setMessage(null);
    const response = await fetch("/api/admin/subscription", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId,
        planId: selectedPlan,
        status: "ACTIVE",
      }),
    });
    const data = await response.json();
    setIsSaving(false);
    if (!response.ok)
      return setMessage(data.error || "Unable to save subscription.");
    setSubscription(data.subscription);
    setMessage("Subscription plan saved.");
  };

  const payWithRazorpay = async () => {
    const plan = plans.find((item) => item.id === selectedPlan);
    if (!plan || plan.isCustom || plan.monthlyPrice == null) return setMessage("Select a paid online plan first.");
    setIsPaying(true);
    setMessage(null);
    try {
      const orderResponse = await fetch("/api/admin/subscription/razorpay/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, planId: selectedPlan }),
      });
      const order = await orderResponse.json();
      if (!orderResponse.ok) throw new Error(order.error || "Unable to start Razorpay checkout.");
      if (!(window as any).Razorpay) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "https://checkout.razorpay.com/v1/checkout.js";
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("Unable to load Razorpay Checkout."));
          document.body.appendChild(script);
        });
      }
      const checkout = new (window as any).Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: "Accumedia",
        description: `${order.planName} subscription`,
        order_id: order.orderId,
        handler: async (payment: Record<string, string>) => {
          const verifyResponse = await fetch("/api/admin/subscription/razorpay/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ organizationId, planId: selectedPlan, ...payment }),
          });
          const verified = await verifyResponse.json();
          if (!verifyResponse.ok) throw new Error(verified.error || "Payment verification failed.");
          setSubscription(verified.subscription);
          setIsPaying(false);
          setMessage("Payment verified and subscription activated.");
        },
        modal: { ondismiss: () => setIsPaying(false) },
        theme: { color: "#0f766e" },
      });
      checkout.on("payment.failed", (failure: { error?: { description?: string } }) => {
        setMessage(failure.error?.description || "Razorpay payment failed.");
        setIsPaying(false);
      });
      checkout.open();
    } catch (error: any) {
      setMessage(error.message || "Unable to complete Razorpay checkout.");
      setIsPaying(false);
    }
  };

  const savePlanDefinition = async () => {
    const response = await fetch("/api/admin/subscription", {
      method: editingPlan ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editingPlan ? { action: "update_plan", planId: editingPlan.id, ...planForm } : planForm),
    });
    const data = await response.json();
    if (!response.ok) return setMessage(data.error || "Unable to save plan definition.");
    setPlans((current) => editingPlan ? current.map((plan) => plan.id === data.plan.id ? data.plan : plan) : [...current, data.plan]);
    setEditingPlan(null);
    setPlanForm({ name: "", sortOrder: 0, monthlyCaseLimit: "", monthlyAudioMinutes: "", monthlyAiTokens: "", monthlyAssetLimit: "", monthlyPrice: "", currency: "INR", billingInterval: "monthly", setupFee: "", isCustom: false, overagePolicy: "" });
    setMessage("Plan definition saved.");
  };

  const editPlan = (plan: any) => {
    setEditingPlan(plan);
    setPlanForm({ name: plan.name, sortOrder: plan.sortOrder || 0, monthlyCaseLimit: plan.monthlyCaseLimit ?? "", monthlyAudioMinutes: plan.monthlyAudioMinutes ?? "", monthlyAiTokens: plan.monthlyAiTokens ?? "", monthlyAssetLimit: plan.monthlyAssetLimit ?? "", monthlyPrice: plan.monthlyPrice ?? "", currency: plan.currency || "INR", billingInterval: plan.billingInterval || "monthly", setupFee: plan.setupFee ?? "", isCustom: Boolean(plan.isCustom), overagePolicy: plan.overagePolicy || "" });
  };

  const lifecycle = async (action: "cancel" | "renew" | "activate") => {
    const response = await fetch("/api/admin/subscription", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, action }),
    });
    const data = await response.json();
    if (!response.ok)
      return setMessage(data.error || "Unable to update subscription.");
    setSubscription(data.subscription);
    const quotaResponse = await fetch(
      `/api/admin/subscription?orgId=${organizationId}`,
    );
    const quotaData = await quotaResponse.json();
    setQuota(quotaData.quota);
    setMessage(`Subscription ${action}d.`);
  };

  return (
    <main className="readable-route ml-0 mr-auto max-w-5xl space-y-6 p-6 md:p-8">
      <header>
        <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-pine">
          <Link href="/" className="flex items-center gap-1 hover:underline">
            <ArrowLeft className="h-3 w-3" /> Dashboard
          </Link>
          <span>/</span>
          <span>Subscription</span>
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            Subscription &amp; Quotas
          </h1>
          <p className="mt-0.5 text-xs text-muted">
            Configure plan limits before billing and overage enforcement are
            connected.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted" />
          <label className="sr-only" htmlFor="subscription-organization">
            Organization
          </label>
          <select
            id="subscription-organization"
            value={organizationId}
            onChange={(event) => {
              setIsLoading(true);
              setOrganizationId(event.target.value);
            }}
            disabled={organizations.length === 0}
            className="rounded border border-line bg-surface px-3 py-1.5 text-xs text-ink focus:border-pine focus:outline-none"
          >
            <option value="" disabled>
              {organizations.length
                ? "Select organization"
                : "Loading organizations…"}
            </option>
            {organizations.map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.name}
              </option>
            ))}
          </select>
        </div>
        {organizationLoadError && (
          <div className="mt-3 rounded border border-brick/30 bg-brick-tint p-3 text-xs text-brick">
            {organizationLoadError}
          </div>
        )}
      </header>
      <nav aria-label="Subscription sections" className="flex gap-1 overflow-x-auto rounded-lg border border-line bg-surface p-1">
        {([
          ["current", "Current plan", CreditCard],
          ["catalog", "Plan catalog", Settings2],
          ["quotas", "Quota usage", Gauge],
        ] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded px-3 py-2 text-xs font-semibold transition ${activeTab === key ? "bg-pine text-white" : "text-muted hover:bg-paper hover:text-ink"}`}
          >
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </nav>
      {activeTab === "catalog" && !isLoading && plans.length > 0 && (
        <section className="rounded-lg border border-line bg-surface p-6">
          <h2 className="text-sm font-bold text-ink">RFP commercial plans</h2>
          <p className="mt-1 text-xs text-muted">
            Monthly pricing and quota policy for the selected organisation.
          </p>
          <div className="mt-4 overflow-x-auto rounded border border-line">
            <table className="w-full min-w-[680px] text-left text-xs">
              <thead className="bg-paper text-[10px] uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Cases/month</th>
                  <th className="px-4 py-3">Price</th>
                  <th className="px-4 py-3">Setup fee</th>
                  <th className="px-4 py-3">Overage policy</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {plans.map((plan) => (
                  <tr key={`commercial-${plan.id}`}>
                    <td className="px-4 py-3 font-semibold text-ink">
                      {plan.name}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {plan.monthlyCaseLimit ?? "Custom"}
                    </td>
                    <td className="px-4 py-3 font-semibold text-pine">
                      {plan.isCustom
                        ? "Custom pricing"
                        : `${plan.currency} ${Number(plan.monthlyPrice || 0).toLocaleString()} / ${plan.billingInterval}`}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {plan.setupFee == null
                        ? "Custom"
                        : `${plan.currency} ${Number(plan.setupFee).toLocaleString()}`}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {plan.overagePolicy || "Not configured"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {activeTab === "current" && (isLoading ? (
        <div className="rounded-lg border border-line bg-surface p-12 text-center text-sm text-muted">
          <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-pine" />
          Loading subscription…
        </div>
      ) : (
        <section className="rounded-lg border border-line bg-surface p-6">
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-pine" />
            <h2 className="text-sm font-bold text-ink">Current plan</h2>
          </div>
          <p className="mt-1 text-xs text-muted">
            Status: {subscription?.status || "Not configured"} · Period ends{" "}
            {subscription?.currentPeriodEnd
              ? formatDate(subscription.currentPeriodEnd)
              : "—"}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
            {quota &&
              Object.entries({
                Cases: quota.cases,
                "Audio minutes": quota.audioMinutes,
                "AI tokens": quota.aiTokens,
                Assets: quota.assets,
              }).map(([label, value]: [string, any]) => (
                <div
                  key={label}
                  className="rounded border border-line bg-paper p-3"
                >
                  <p className="text-[10px] uppercase text-muted">{label}</p>
                  <p className="mt-1 text-sm font-bold text-ink">
                    {value.used.toLocaleString()} / {value.limit ?? "∞"}
                  </p>
                </div>
              ))}
          </div>
          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
            {plans.map((plan) => (
              <button
                type="button"
                key={plan.id}
                onClick={() => setSelectedPlan(plan.id)}
                className={`rounded-lg border p-4 text-left ${selectedPlan === plan.id ? "border-pine bg-pine-tint" : "border-line bg-paper"}`}
              >
                <p className="text-sm font-bold text-ink">{plan.name}</p>
                <p className="mt-2 text-xs text-muted">
                  {plan.monthlyCaseLimit ?? "Unlimited"} cases ·{" "}
                  {plan.monthlyAudioMinutes ?? "Unlimited"} audio minutes ·{" "}
                  {plan.monthlyAiTokens ?? "Unlimited"} AI tokens
                </p>
              </button>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!selectedPlan || isSaving}
              onClick={save}
              className="flex items-center gap-2 rounded-lg bg-pine px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" />
              {isSaving ? "Saving…" : "Save plan"}
            </button>
            <button
              type="button"
              disabled={!selectedPlan || isSaving || isPaying || plans.find((plan) => plan.id === selectedPlan)?.isCustom || plans.find((plan) => plan.id === selectedPlan)?.monthlyPrice == null}
              onClick={payWithRazorpay}
              className="flex items-center gap-2 rounded-lg border border-pine bg-pine-tint px-4 py-2 text-xs font-semibold text-pine-dark disabled:opacity-50"
            >
              <CreditCard className="h-3.5 w-3.5" />
              {isPaying ? "Opening checkout…" : "Pay with Razorpay"}
            </button>
            <button
              type="button"
              onClick={() => lifecycle("renew")}
              className="rounded-lg border border-line px-3 py-2 text-xs font-semibold text-ink"
            >
              Renew period
            </button>
            <button
              type="button"
              onClick={() =>
                lifecycle(
                  subscription?.status === "CANCELLED" ? "activate" : "cancel",
                )
              }
              className="rounded-lg border border-brick/30 bg-brick-tint px-3 py-2 text-xs font-semibold text-brick"
            >
              {subscription?.status === "CANCELLED" ? "Activate" : "Cancel"}
            </button>
          </div>
          {message && <p className="mt-3 text-xs text-muted">{message}</p>}
        </section>
      ))}
      {activeTab === "catalog" && <section className="rounded-lg border border-line bg-surface p-6">
        <h2 className="text-sm font-bold text-ink">Plan catalog administration</h2>
        <p className="mt-1 text-xs text-muted">Create and update plan pricing, content limits, AI limits, and overage policy.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {([['name','Plan name'],['monthlyCaseLimit','Cases/month'],['monthlyAudioMinutes','Audio minutes'],['monthlyAiTokens','AI tokens'],['monthlyAssetLimit','Assets/month'],['monthlyPrice','Monthly price'],['setupFee','Setup fee'],['overagePolicy','Overage policy']] as const).map(([field,label]) => (
            <label key={field} className={field === 'overagePolicy' ? 'sm:col-span-2 lg:col-span-4 text-xs font-semibold text-ink' : 'text-xs font-semibold text-ink'}>{label}<input value={String(planForm[field])} onChange={(event) => setPlanForm((current) => ({ ...current, [field]: event.target.value }))} className="mt-1 w-full rounded border border-line bg-paper px-3 py-2 text-xs" /></label>
          ))}
          <label className="text-xs font-semibold text-ink">Currency<select value={planForm.currency} onChange={(event) => setPlanForm((current) => ({ ...current, currency: event.target.value }))} className="mt-1 w-full rounded border border-line bg-paper px-3 py-2 text-xs"><option>INR</option><option>USD</option><option>EUR</option></select></label>
          <label className="text-xs font-semibold text-ink">Billing interval<select value={planForm.billingInterval} onChange={(event) => setPlanForm((current) => ({ ...current, billingInterval: event.target.value }))} className="mt-1 w-full rounded border border-line bg-paper px-3 py-2 text-xs"><option>monthly</option><option>yearly</option></select></label>
          <label className="flex items-center gap-2 self-end pb-2 text-xs font-semibold text-ink"><input type="checkbox" checked={planForm.isCustom} onChange={(event) => setPlanForm((current) => ({ ...current, isCustom: event.target.checked }))} /> Custom pricing</label>
        </div>
        <div className="mt-4 flex gap-2"><button type="button" onClick={savePlanDefinition} disabled={!planForm.name.trim()} className="rounded bg-pine px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{editingPlan ? "Update plan" : "Create plan"}</button>{editingPlan && <button type="button" onClick={() => setEditingPlan(null)} className="rounded border border-line px-4 py-2 text-xs font-semibold text-ink">Cancel</button>}</div>
        <div className="mt-5 divide-y divide-line border-t border-line">{plans.map((plan) => <div key={`edit-${plan.id}`} className="flex items-center justify-between py-3 text-xs"><span className="font-semibold text-ink">{plan.name}</span><button type="button" onClick={() => editPlan(plan)} className="text-pine hover:underline">Edit</button></div>)}</div>
      </section>}
      {activeTab === "quotas" && <section className="rounded-lg border border-line bg-surface p-6">
        <h2 className="text-sm font-bold text-ink">Current quota usage</h2>
        <p className="mt-1 text-xs text-muted">Usage against the selected organisation&apos;s assigned plan.</p>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          {quota && Object.entries({ Cases: quota.cases, "Audio minutes": quota.audioMinutes, "AI tokens": quota.aiTokens, Assets: quota.assets }).map(([label, value]: [string, any]) => (
            <div key={label} className="rounded border border-line bg-paper p-4"><p className="text-[10px] uppercase text-muted">{label}</p><p className="mt-2 text-lg font-bold text-ink">{value.used.toLocaleString()} / {value.limit ?? "∞"}</p></div>
          ))}
        </div>
      </section>}
    </main>
  );
}
