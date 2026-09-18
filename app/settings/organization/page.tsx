"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BriefcaseBusiness,
  Building2,
  FileText,
  Palette,
  Save,
  Settings2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const profileTabs: Array<{
  key: "details" | "brand" | "content" | "advanced" | "commercial";
  label: string;
  icon: LucideIcon;
}> = [
  { key: "details", label: "Organisation details", icon: Building2 },
  { key: "brand", label: "Brand identity", icon: Palette },
  { key: "content", label: "Content preferences", icon: FileText },
  { key: "advanced", label: "Advanced configuration", icon: Settings2 },
  { key: "commercial", label: "Commercial plan", icon: BriefcaseBusiness },
];

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
  const [isUploadingHospitalPhoto, setIsUploadingHospitalPhoto] = useState(false);
  const saveButtonLabel: Record<typeof activeTab, string> = {
    details: "Save organisation details",
    brand: "Save brand settings",
    content: "Save content preferences",
    advanced: "Save advanced configuration",
    commercial: "Save organisation profile",
  };
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
  const uploadHospitalPhoto = async (file: File) => {
    setIsUploadingHospitalPhoto(true);
    const form = new FormData();
    form.append("file", file);
    form.append("target", "hospital");
    form.append("organizationId", org.id);
    try {
      const response = await fetch("/api/profile-media/upload", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to upload hospital photo.");
      setOrg((current: any) => ({ ...current, hospitalPhotoUrls: data.hospitalPhotoUrls }));
      setMessage("Hospital photo uploaded. Save the brand settings to keep other changes.");
    } catch (error: any) {
      setMessage(error.message || "Unable to upload hospital photo.");
    } finally {
      setIsUploadingHospitalPhoto(false);
    }
  };

  return (
    <div className="readable-route max-w-6xl space-y-6">
      <div>
        <Link
          href="/admin/organizations"
          className="inline-flex items-center gap-1 text-xs font-semibold text-pine hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Hospital Networks
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
          {profileTabs
            .filter(({ key }) => key !== "commercial" || isSuperAdmin)
            .map(({ key: tab, label, icon: Icon }) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              onClick={() => setActiveTab(tab as typeof activeTab)}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-xs font-semibold transition ${activeTab === tab ? "border-pine text-pine" : "border-transparent text-muted hover:text-ink"}`}
            >
              <Icon className="h-3.5 w-3.5" />
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
          <label className="block text-xs font-bold uppercase tracking-wider text-muted">
            Upload hospital photograph
            <input type="file" accept="image/*" disabled={isUploadingHospitalPhoto || !org} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadHospitalPhoto(file); event.currentTarget.value = ""; }} className="mt-1 block w-full rounded-lg border border-line bg-paper p-2 text-xs text-ink" />
            <span className="mt-1 block text-[10px] font-normal normal-case tracking-normal text-muted">Images up to 8 MB. Uploaded photos are added to the hospital image library.</span>
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
              rows={14}
              defaultValue={org?.customSystemPrompt || ""}
              placeholder="Optional organisation-specific clinical instructions"
              className="mt-1 min-h-[360px] w-full rounded border border-line bg-paper p-3 font-mono text-xs leading-relaxed text-ink"
            />
          </label>
        </div>
        {isSuperAdmin && (
          <div className={activeTab === "commercial" ? "space-y-5" : "hidden"}>
            <div>
              <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
                <BriefcaseBusiness className="h-4 w-4 text-pine" />
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
              className="inline-flex items-center gap-1.5 rounded bg-pine px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" />
              Save commercial plan
            </button>
            {planMessage && <p className="text-xs text-muted">{planMessage}</p>}
          </div>
        )}
        {activeTab !== "commercial" && (
          <button
            type="submit"
            disabled={!org}
            className="inline-flex items-center gap-1.5 rounded bg-pine px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" />
            {saveButtonLabel[activeTab]}
          </button>
        )}
        {message && <p className="text-xs text-muted">{message}</p>}
      </form>
    </div>
  );
}
