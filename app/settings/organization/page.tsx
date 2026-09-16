"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function OrgSettingsPage() {
  const [org, setOrg] = useState<any>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<
    "details" | "brand" | "content" | "advanced" | "commercial"
  >("details");
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [plans, setPlans] = useState<any[]>([]);
  const [subscription, setSubscription] = useState<any>(null);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [planMessage, setPlanMessage] = useState<string | null>(null);
  useEffect(() => {
    const selectedOrgId =
      new URLSearchParams(window.location.search).get("orgId") || "";
    fetch("/api/admin/organizations")
      .then((response) => response.json())
      .then((data) => {
        const items = data.organizations || [];
        setOrganizations(items);
        setIsSuperAdmin(Boolean(data.isSuperAdmin));
        setOrg(
          items.find((item: any) => item.id === selectedOrgId) ||
            items[0] ||
            null,
        );
      });
  }, []);
  useEffect(() => {
    if (!org?.id || !isSuperAdmin) return;
    fetch(`/api/admin/subscription?orgId=${encodeURIComponent(org.id)}`)
      .then((response) => response.json())
      .then((data) => {
        setPlans(data.plans || []);
        setSubscription(data.subscription);
        setSelectedPlanId(data.subscription?.planId || "");
      })
      .catch(() => undefined);
  }, [org?.id, isSuperAdmin]);
  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const hospitalPhotoUrls = String(values.hospitalPhotoUrls || "")
      .split("\n")
      .map((url) => url.trim())
      .filter(Boolean);
    const response = await fetch("/api/admin/organizations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId: org.id,
        ...values,
        hospitalPhotoUrls,
      }),
    });
    const data = await response.json();
    setMessage(
      response.ok
        ? "Organization profile saved."
        : data.error || "Unable to save organization profile.",
    );
    if (response.ok) setOrg(data.organization);
  };
  const savePlan = async () => {
    const response = await fetch("/api/admin/subscription", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId: org.id,
        planId: selectedPlanId,
        status: "ACTIVE",
      }),
    });
    const data = await response.json();
    setPlanMessage(
      response.ok
        ? "Commercial plan saved."
        : data.error || "Unable to save commercial plan.",
    );
    if (response.ok) setSubscription(data.subscription);
  };

  return (
    <div className="readable-route max-w-3xl space-y-6">
      <div>
        <Link
          href="/admin/organizations"
          className="text-xs font-semibold text-pine hover:underline"
        >
          ← Hospital Networks
        </Link>
        <h1 className="text-2xl font-extrabold text-ink tracking-tight">
          Organisation Profile
        </h1>
        <p className="text-xs text-muted mt-1">
          Configure hospital identity, branding, content preferences, and
          medical disclaimers.
        </p>
      </div>

      <form
        key={org?.id || "empty"}
        onSubmit={save}
        className="bg-surface rounded-lg border border-line p-6 space-y-5"
      >
        <div
          className="flex gap-1 overflow-x-auto border-b border-line pb-1"
          role="tablist"
          aria-label="Organisation profile sections"
        >
          {(
            [
              ["details", "Organisation details"],
              ["brand", "Brand identity"],
              ["content", "Content preferences"],
              ["advanced", "Advanced configuration"],
              ...(isSuperAdmin ? [["commercial", "Commercial plan"]] : []),
            ] as const
          ).map(([tab, label]) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              onClick={() => setActiveTab(tab as typeof activeTab)}
              className={`whitespace-nowrap border-b-2 px-3 py-2 text-xs font-semibold transition ${activeTab === tab ? "border-pine text-pine" : "border-transparent text-muted hover:text-ink"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className={activeTab === "details" ? "space-y-5" : "hidden"}>
          <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-1">
            Hospital / Organization
          </label>
          <select
            value={org?.id || ""}
            onChange={(event) => {
              const next = organizations.find(
                (item) => item.id === event.target.value,
              );
              setOrg(next || null);
              window.history.replaceState(
                null,
                "",
                `/settings/organization?orgId=${event.target.value}`,
              );
            }}
            className="w-full text-xs p-3 rounded-lg border border-line bg-paper text-ink"
          >
            <option value="" disabled>
              Select a hospital
            </option>
            {organizations.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-muted">
              Address
              <input
                name="location"
                defaultValue={org?.location || ""}
                placeholder="Street, city, state, country"
                className="mt-1 w-full text-xs p-3 rounded-lg border border-line bg-paper text-ink"
              />
            </label>
            <label className="block text-xs font-bold uppercase tracking-wider text-muted">
              Website
              <input
                name="websiteUrl"
                type="url"
                defaultValue={org?.websiteUrl || ""}
                placeholder="https://hospital.example"
                className="mt-1 w-full text-xs p-3 rounded-lg border border-line bg-paper text-ink"
              />
            </label>
            <label className="block text-xs font-bold uppercase tracking-wider text-muted">
              Contact email
              <input
                name="contactEmail"
                type="email"
                defaultValue={org?.contactEmail || ""}
                placeholder="communications@hospital.example"
                className="mt-1 w-full text-xs p-3 rounded-lg border border-line bg-paper text-ink"
              />
            </label>
            <label className="block text-xs font-bold uppercase tracking-wider text-muted">
              Contact phone
              <input
                name="contactPhone"
                defaultValue={org?.contactPhone || ""}
                placeholder="+91 ..."
                className="mt-1 w-full text-xs p-3 rounded-lg border border-line bg-paper text-ink"
              />
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {(
              [
                "linkedinUrl",
                "facebookUrl",
                "instagramUrl",
                "xUrl",
                "youtubeUrl",
              ] as const
            ).map((field) => (
              <label
                key={field}
                className="block text-xs font-bold uppercase tracking-wider text-muted"
              >
                {field.replace("Url", " URL")}
                <input
                  name={field}
                  type="url"
                  defaultValue={org?.[field] || ""}
                  placeholder="https://..."
                  className="mt-1 w-full text-xs p-3 rounded-lg border border-line bg-paper text-ink"
                />
              </label>
            ))}
          </div>
        </div>
        <div className={activeTab === "brand" ? "space-y-5" : "hidden"}>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-1">
              Primary brand colour
            </label>
            <div className="flex items-center gap-3">
              <input
                name="brandingHex"
                type="color"
                defaultValue={org?.brandingHex || "#0f766e"}
                className="h-9 w-9 rounded border"
              />
              <span className="text-xs font-mono text-muted">
                {org?.brandingHex || "#0f766e"}
              </span>
            </div>
          </div>
          <label className="block text-xs font-bold uppercase tracking-wider text-muted">
            Logo URL
            <input
              name="logoUrl"
              defaultValue={org?.logoUrl || ""}
              placeholder="https://.../logo.png"
              className="mt-1 w-full text-xs p-3 rounded-lg border border-line bg-paper text-ink"
            />
          </label>
          <label className="block text-xs font-bold uppercase tracking-wider text-muted">
            Brand typeface
            <input
              name="brandFont"
              defaultValue={org?.brandFont || "Arial"}
              placeholder="Arial or a web-safe font"
              className="mt-1 w-full text-xs p-3 rounded-lg border border-line bg-paper text-ink"
            />
          </label>
          <label className="block text-xs font-bold uppercase tracking-wider text-muted">
            Brand tagline
            <input
              name="brandTagline"
              defaultValue={org?.brandTagline || ""}
              placeholder="Short public-facing descriptor"
              className="mt-1 w-full text-xs p-3 rounded-lg border border-line bg-paper text-ink"
            />
          </label>
          <label className="block text-xs font-bold uppercase tracking-wider text-muted">
            Hospital image URLs
            <textarea
              name="hospitalPhotoUrls"
              rows={2}
              defaultValue={
                Array.isArray(org?.hospitalPhotoUrls)
                  ? org.hospitalPhotoUrls.join("\n")
                  : ""
              }
              placeholder="One image URL per line"
              className="mt-1 w-full text-xs p-3 rounded-lg border border-line bg-paper text-ink"
            />
          </label>
        </div>
        <div className={activeTab === "content" ? "space-y-5" : "hidden"}>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-1">
              Medical disclaimer
            </label>
            <textarea
              rows={3}
              name="defaultDisclaimer"
              defaultValue={
                org?.defaultDisclaimer ||
                "This clinical content is educational only and does not constitute formal medical advice. Consult a registered medical practitioner."
              }
              className="w-full text-xs p-3 rounded-lg border border-line bg-paper text-ink"
            />
          </div>
          <label className="block text-xs font-bold uppercase tracking-wider text-muted">
            Preferred writing tone
            <input
              name="preferredTone"
              defaultValue={org?.preferredTone || ""}
              placeholder="Warm, educational, clinically precise"
              className="mt-1 w-full text-xs p-3 rounded-lg border border-line bg-paper text-ink"
            />
          </label>
          <label className="block text-xs font-bold uppercase tracking-wider text-muted">
            Default call to action
            <textarea
              name="callToAction"
              rows={2}
              defaultValue={org?.callToAction || ""}
              placeholder="Book an appointment through the hospital reception."
              className="mt-1 w-full text-xs p-3 rounded-lg border border-line bg-paper text-ink"
            />
          </label>
        </div>
        <div className={activeTab === "advanced" ? "space-y-5" : "hidden"}>
          <label className="block text-xs font-bold uppercase tracking-wider text-muted">
            Default speech recognition engine
            <select
              name="preferredAsrModel"
              defaultValue={org?.preferredAsrModel || "whisper-1"}
              className="mt-1 w-full text-xs p-3 rounded-lg border border-line bg-paper text-ink"
            >
              <option value="whisper-1">OpenAI Whisper-1</option>
              <option value="deepgram-nova-3-medical">
                Deepgram Nova-3 Medical
              </option>
              <option value="faster-whisper-self-hosted">
                Faster-Whisper (Self-Hosted)
              </option>
            </select>
          </label>
          <label className="block text-xs font-bold uppercase tracking-wider text-muted">
            Custom clinical prompt
            <textarea
              name="customSystemPrompt"
              rows={5}
              defaultValue={org?.customSystemPrompt || ""}
              placeholder="Optional organisation-specific clinical instructions"
              className="mt-1 w-full rounded border border-line bg-paper p-3 font-mono text-xs text-ink"
            />
          </label>
        </div>
        {isSuperAdmin && (
          <div className={activeTab === "commercial" ? "space-y-5" : "hidden"}>
            <div>
              <h2 className="text-sm font-bold text-ink">
                RFP commercial plan
              </h2>
              <p className="mt-1 text-xs text-muted">
                Commercial plan assignment is managed only by Super Admin.
              </p>
            </div>
            <select
              value={selectedPlanId}
              onChange={(event) => setSelectedPlanId(event.target.value)}
              className="w-full rounded border border-line bg-paper p-3 text-xs text-ink"
            >
              <option value="">Select commercial plan</option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name} ·{" "}
                  {plan.isCustom
                    ? "Custom pricing"
                    : `${plan.currency} ${Number(plan.monthlyPrice || 0).toLocaleString()} / ${plan.billingInterval}`}{" "}
                  · {plan.monthlyCaseLimit ?? "Custom"} cases/month
                </option>
              ))}
            </select>
            {subscription && (
              <p className="text-xs text-muted">
                Current status: {subscription.status} · Period ends{" "}
                {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
              </p>
            )}
            <button
              type="button"
              disabled={!selectedPlanId}
              onClick={savePlan}
              className="rounded bg-pine px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              Save commercial plan
            </button>
            {planMessage && <p className="text-xs text-muted">{planMessage}</p>}
          </div>
        )}
        <button
          type="submit"
          disabled={!org}
          className="rounded bg-pine px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          Save brand settings
        </button>
        {message && <p className="text-xs text-muted">{message}</p>}
      </form>
    </div>
  );
}
