"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  Plus,
  Edit2,
  RefreshCw,
  Layers,
  FileText,
  Users,
  Search,
  CheckCircle2,
  AlertCircle,
  X,
  Sparkles,
  ShieldCheck,
  Server,
  Cloud,
  Palette,
} from "lucide-react";

interface OrganizationItem {
  id: string;
  name: string;
  slug: string;
  brandingHex: string | null;
  preferredAsrModel: string;
  customSystemPrompt: string | null;
  defaultDisclaimer: string;
  logoUrl?: string | null;
  brandFont?: string | null;
  brandTagline?: string | null;
  location?: string | null;
  websiteUrl?: string | null;
  linkedinUrl?: string | null;
  facebookUrl?: string | null;
  instagramUrl?: string | null;
  xUrl?: string | null;
  youtubeUrl?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  preferredTone?: string | null;
  callToAction?: string | null;
  hospitalPhotoUrls?: string[] | null;
  createdAt: string;
  _count: {
    users: number;
    cases: number;
    recordings: number;
  };
}

const ASR_MODELS = [
  {
    id: "whisper-1",
    name: "OpenAI Whisper-1",
    badge: "Cloud ASR",
    color: "bg-blue-50 text-blue-700 border-blue-200",
    description: "Multilingual, resilient to accents, standard cloud deployment.",
  },
  {
    id: "deepgram-nova-3-medical",
    name: "Deepgram Nova-3 Medical",
    badge: "Medical-Tuned",
    color: "bg-purple-50 text-purple-700 border-purple-200",
    description: "Trained on pharmacological databases, low latency clinical dictation.",
  },
  {
    id: "faster-whisper-self-hosted",
    name: "Faster-Whisper (Self-Hosted)",
    badge: "On-Prem / Private VPC",
    color: "bg-emerald-50 text-emerald-700 border-emerald-200",
    description: "Zero external transmission, compliant with Indian DPDP data sovereignty.",
  },
];

const ORGANIZATION_PROFILE_FIELDS = [
  { key: "location", label: "Location", placeholder: "City, state, country", type: "text" },
  { key: "websiteUrl", label: "Website URL", placeholder: "https://hospital.example", type: "url" },
  { key: "contactEmail", label: "Contact email", placeholder: "communications@hospital.example", type: "email" },
  { key: "contactPhone", label: "Contact phone", placeholder: "+91 ...", type: "tel" },
  { key: "linkedinUrl", label: "LinkedIn profile URL", placeholder: "https://linkedin.com/company/...", type: "url" },
  { key: "facebookUrl", label: "Facebook page URL", placeholder: "https://facebook.com/...", type: "url" },
  { key: "instagramUrl", label: "Instagram profile URL", placeholder: "https://instagram.com/...", type: "url" },
  { key: "xUrl", label: "X profile URL", placeholder: "https://x.com/...", type: "url" },
  { key: "youtubeUrl", label: "YouTube channel URL", placeholder: "https://youtube.com/@...", type: "url" },
  { key: "preferredTone", label: "Preferred writing tone", placeholder: "Warm, educational, clinically precise", type: "text" },
] as const;

export default function AdminOrganizationsPage() {
  const [organizations, setOrganizations] = useState<OrganizationItem[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Modal Form State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState({
    id: "",
    name: "",
    slug: "",
    brandingHex: "#0f766e",
    preferredAsrModel: "whisper-1",
    customSystemPrompt: "",
    defaultDisclaimer:
      "This clinical summary is generated under NMC registered medical practitioner supervision.",
    logoUrl: "",
    brandFont: "Arial",
    brandTagline: "",
    location: "",
    websiteUrl: "",
    linkedinUrl: "",
    facebookUrl: "",
    instagramUrl: "",
    xUrl: "",
    youtubeUrl: "",
    contactEmail: "",
    contactPhone: "",
    preferredTone: "",
    callToAction: "",
    hospitalPhotoUrls: [],
  });

  const loadOrganizations = async () => {
    setErrorMessage(null);
    const cacheKey = "macula:organizations";
    let servedCache = false;
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as { organizations: OrganizationItem[]; cachedAt: number };
        if (Date.now() - parsed.cachedAt < 60_000) {
          setOrganizations(parsed.organizations || []);
          setIsLoading(false);
          servedCache = true;
        }
      }
    } catch {
      // Ignore unavailable or invalid browser cache.
    }
    if (!servedCache) setIsLoading(true);
    try {
      const res = await fetch("/api/admin/organizations", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load hospitals.");
      setOrganizations(data.organizations || []);
      setIsSuperAdmin(Boolean(data.isSuperAdmin));
      try { sessionStorage.setItem(cacheKey, JSON.stringify({ organizations: data.organizations || [], cachedAt: Date.now() })); } catch { /* Ignore storage limits. */ }
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadOrganizations();
  }, []);

  const openCreateModal = () => {
    setIsEditing(false);
    setFormData({
      id: "",
      name: "",
      slug: "",
      brandingHex: "#0f766e",
      preferredAsrModel: "whisper-1",
      customSystemPrompt:
        "You are a clinical intelligence assistant adhering strictly to NMC ethical guidelines and DPDP privacy standards.",
      defaultDisclaimer:
        "This clinical summary is generated under NMC registered medical practitioner supervision.",
      logoUrl: "", brandFont: "Arial", brandTagline: "", location: "", websiteUrl: "", linkedinUrl: "", facebookUrl: "", instagramUrl: "", xUrl: "", youtubeUrl: "", contactEmail: "", contactPhone: "", preferredTone: "", callToAction: "", hospitalPhotoUrls: [],
    });
    setIsModalOpen(true);
  };

  const openEditModal = (org: OrganizationItem) => {
    setIsEditing(true);
    setFormData({
      id: org.id,
      name: org.name,
      slug: org.slug,
      brandingHex: org.brandingHex || "#0f766e",
      preferredAsrModel: org.preferredAsrModel || "whisper-1",
      customSystemPrompt: org.customSystemPrompt || "",
      defaultDisclaimer: org.defaultDisclaimer || "",
      logoUrl: org.logoUrl || "", brandFont: org.brandFont || "Arial", brandTagline: org.brandTagline || "", location: org.location || "", websiteUrl: org.websiteUrl || "", linkedinUrl: org.linkedinUrl || "", facebookUrl: org.facebookUrl || "", instagramUrl: org.instagramUrl || "", xUrl: org.xUrl || "", youtubeUrl: org.youtubeUrl || "", contactEmail: org.contactEmail || "", contactPhone: org.contactPhone || "", preferredTone: org.preferredTone || "", callToAction: org.callToAction || "", hospitalPhotoUrls: org.hospitalPhotoUrls || [],
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setErrorMessage(null);

    try {
      const endpoint = "/api/admin/organizations";
      const method = isEditing ? "PUT" : "POST";

      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save hospital.");

      setIsModalOpen(false);
      loadOrganizations();
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const filteredOrgs = organizations.filter(
    (o) =>
      o.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.slug.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="readable-route min-h-screen bg-slate-50 text-slate-900">
      {/* Header */}
      <header className="bg-transparent px-8 pt-8">
        <div className="ml-0 mr-auto flex max-w-7xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-pine">
              <Link href="/" className="flex items-center gap-1 hover:underline">
                <ArrowLeft className="h-3 w-3" /> Dashboard
              </Link>
              <span>/</span>
              <span>Hospital Networks</span>
            </div>
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-pine" />
              <h1 className="text-2xl font-bold tracking-tight text-ink">
                Hospital Network &amp; Model Configuration
              </h1>
            </div>
            <p className="mt-0.5 text-xs text-muted">Configure organizations, clinicians, and default speech engines.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            <Link
              href="/admin/organizations/new"
              className="flex items-center gap-1.5 rounded-lg bg-pine px-3.5 py-2 text-xs font-semibold text-white hover:bg-pine-dark transition"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Hospital</span>
            </Link>

            <button
              type="button"
              onClick={loadOrganizations}
              className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink hover:border-pine transition"
            >
              <RefreshCw className="h-3.5 w-3.5 text-teal-600" /> Refresh
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="ml-0 mr-auto max-w-7xl p-8 space-y-6">
        {errorMessage && (
          <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-medium text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
            <span className="flex-1">{errorMessage}</span>
          </div>
        )}

        {/* Search & Statistics */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search hospital by name or network slug..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:border-teal-500 focus:bg-white focus:outline-hidden"
            />
          </div>

          <div className="text-xs text-slate-500 font-medium">
            Configured Hospitals:{" "}
            <strong className="text-slate-800">{filteredOrgs.length}</strong>
          </div>
        </div>

        {/* Hospitals Table */}
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-xs">
          <table className="min-w-[1120px] w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
              <tr>
                <th className="w-[250px] px-6 py-3.5">Hospital Name &amp; Slug</th>
                {isSuperAdmin && <th className="w-[250px] px-6 py-3.5">Default Speech Engine (ASR)</th>}
                <th className="w-[210px] px-6 py-3.5">Clinicians &amp; Cases</th>
                <th className="min-w-[260px] px-6 py-3.5">Statutory Disclaimer</th>
                <th className="w-[250px] px-6 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={isSuperAdmin ? 5 : 4} className="py-12 text-center text-slate-400">
                    Loading hospital networks...
                  </td>
                </tr>
              ) : filteredOrgs.length === 0 ? (
                <tr>
                  <td colSpan={isSuperAdmin ? 5 : 4} className="py-12 text-center text-slate-400">
                    No hospitals registered yet. Click &ldquo;Add Hospital&rdquo; to start.
                  </td>
                </tr>
              ) : (
                filteredOrgs.map((org) => {
                  const modelInfo = ASR_MODELS.find(
                    (m) => m.id === org.preferredAsrModel
                  ) || {
                    name: org.preferredAsrModel,
                    badge: "Custom",
                    color: "bg-slate-100 text-slate-700 border-slate-200",
                  };

                  return (
                    <tr key={org.id} className="hover:bg-slate-50/70 transition">
                      {isSuperAdmin && <td className="px-6 py-4">
                        <div className="flex items-center gap-2.5">
                          <div
                            className="h-3 w-3 rounded-full border border-slate-300 shrink-0"
                            style={{ backgroundColor: org.brandingHex || "#0f766e" }}
                          />
                          <div>
                            <div className="font-semibold text-slate-900">{org.name}</div>
                            <div className="font-mono text-[11px] text-slate-400">
                              {org.slug}
                            </div>
                          </div>
                        </div>
                      </td>}

                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold border ${modelInfo.color}`}
                          >
                            {org.preferredAsrModel === "faster-whisper-self-hosted" ? (
                              <Server className="h-3 w-3" />
                            ) : (
                              <Cloud className="h-3 w-3" />
                            )}
                            {modelInfo.name}
                          </span>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3 text-slate-500">
                          <span className="flex items-center gap-1">
                            <Users className="h-3.5 w-3.5 text-slate-400" />
                            <strong>{org._count.users}</strong> RMPs
                          </span>
                          <span className="flex items-center gap-1">
                            <FileText className="h-3.5 w-3.5 text-slate-400" />
                            <strong>{org._count.cases}</strong> Cases
                          </span>
                        </div>
                      </td>

                      <td className="px-6 py-4 max-w-xs truncate text-slate-500">
                        {org.defaultDisclaimer}
                      </td>

                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/settings/organization?orgId=${org.id}`}
                            className="inline-flex items-center gap-1 rounded-lg border border-pine/30 bg-pine-tint px-2.5 py-1 text-[11px] font-semibold text-pine hover:border-pine transition"
                          >
                            <Palette className="h-3 w-3" /> Brand &amp; Disclaimers
                          </Link>
                          <Link
                            href={`/settings/users?organizationId=${org.id}`}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 transition shadow-2xs"
                          >
                            <Users className="h-3 w-3 text-slate-500" /> Users
                          </Link>
                          <button
                            type="button"
                            onClick={() => openEditModal(org)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 transition shadow-2xs"
                          >
                            <Edit2 className="h-3 w-3 text-slate-500" /> Edit
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </main>

      {/* Modal: Add / Edit Hospital */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="flex h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-teal-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  {isEditing ? "Edit Hospital & Model Settings" : "Add New Hospital Network"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block font-semibold text-slate-700">
                    Organisation / Hospital name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="E.g., Apollo Hospitals - Bangalore"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 focus:border-teal-500 focus:bg-white focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="mb-1 block font-semibold text-slate-700">
                    Organisation slug
                  </label>
                  <input
                    type="text"
                    value={formData.slug}
                    onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                    placeholder="apollo-bangalore (optional; generated if blank)"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-mono text-slate-800 focus:border-teal-500 focus:bg-white focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <h4 className="mb-3 border-b border-slate-100 pb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">Organisation details</h4>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {ORGANIZATION_PROFILE_FIELDS.map((field) => (
                  <div key={field.key}>
                    <label className="mb-1 block font-semibold text-slate-700">{field.label}</label>
                    <input type={field.type} value={formData[field.key]} onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })} placeholder={field.placeholder} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 focus:border-teal-500 focus:bg-white focus:outline-hidden" />
                  </div>
                ))}
                </div>
              </div>
              <div>
                <h4 className="mb-3 border-b border-slate-100 pb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">Brand identity</h4>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div><label className="mb-1 block font-semibold text-slate-700">Logo URL</label><input type="url" value={formData.logoUrl} onChange={(e) => setFormData({ ...formData, logoUrl: e.target.value })} placeholder="https://.../logo.png" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs" /></div>
                  <div><label className="mb-1 block font-semibold text-slate-700">Brand typeface</label><input value={formData.brandFont} onChange={(e) => setFormData({ ...formData, brandFont: e.target.value })} placeholder="Arial or a web-safe font" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs" /></div>
                </div>
                <div className="mt-4"><label className="mb-1 block font-semibold text-slate-700">Brand tagline</label><input value={formData.brandTagline} onChange={(e) => setFormData({ ...formData, brandTagline: e.target.value })} placeholder="Short public-facing descriptor" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs" /></div>
                <div className="mt-4"><label className="mb-1 block font-semibold text-slate-700">Hospital image URLs</label><textarea rows={2} value={formData.hospitalPhotoUrls.join("\n")} onChange={(e) => setFormData({ ...formData, hospitalPhotoUrls: e.target.value.split("\n").map((url) => url.trim()).filter(Boolean) })} placeholder="One image URL per line" className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs" /></div>
              </div>

              {/* Branding Color */}
              <div>
                <label className="mb-1 block font-semibold text-slate-700">
                    Primary brand colour
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={formData.brandingHex}
                    onChange={(e) => setFormData({ ...formData, brandingHex: e.target.value })}
                    className="h-8 w-10 cursor-pointer rounded-lg border border-slate-200 p-0.5"
                  />
                  <input
                    type="text"
                    value={formData.brandingHex}
                    onChange={(e) => setFormData({ ...formData, brandingHex: e.target.value })}
                    className="w-32 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 font-mono text-xs text-slate-800 focus:border-teal-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <h4 className="mb-3 border-b border-slate-100 pb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">Content preferences</h4>
                <label className="mb-1 block font-semibold text-slate-700">Default call to action</label>
                <textarea rows={2} value={formData.callToAction} onChange={(e) => setFormData({ ...formData, callToAction: e.target.value })} placeholder="Book an appointment through the hospital reception." className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs" />
              </div>

              {/* ASR Speech Recognition Model Selection */}
              {isSuperAdmin && <div className="rounded-xl border border-teal-100 bg-teal-50/40 p-4 space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-teal-800">Advanced configuration</p>
                <label className="block font-bold text-teal-950 flex items-center gap-1.5">
                  <Layers className="h-4 w-4 text-teal-700" /> Default Speech Recognition (ASR) Engine
                </label>
                <p className="text-[11px] text-teal-800">
                  Select which model handles audio dictations for all clinicians assigned to this hospital.
                </p>

                <div className="grid grid-cols-1 gap-2 pt-1">
                  {ASR_MODELS.map((model) => {
                    const isSelected = formData.preferredAsrModel === model.id;
                    return (
                      <label
                        key={model.id}
                        className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
                          isSelected
                            ? "border-teal-500 bg-white shadow-xs"
                            : "border-slate-200 bg-white/70 hover:bg-white"
                        }`}
                      >
                        <input
                          type="radio"
                          name="preferredAsrModel"
                          value={model.id}
                          checked={isSelected}
                          onChange={() =>
                            setFormData({ ...formData, preferredAsrModel: model.id })
                          }
                          className="mt-0.5 text-teal-600 accent-teal-600"
                        />
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-slate-900">{model.name}</span>
                            <span
                              className={`rounded-md px-1.5 py-0.2 text-[10px] font-bold border ${model.color}`}
                            >
                              {model.badge}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            {model.description}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>}

              {/* Custom System Prompt */}
              <div>
                <label className="mb-1 block font-semibold text-slate-700">
                  Custom Clinical Prompt (LLM Refinement & Synthesis)
                </label>
                <textarea
                  rows={4}
                  value={formData.customSystemPrompt}
                  onChange={(e) =>
                    setFormData({ ...formData, customSystemPrompt: e.target.value })
                  }
                  placeholder="E.g., You are a clinical AI documenting for oncology. Prioritize RECIST 1.1 criteria and staging..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-800 focus:border-teal-500 focus:bg-white focus:outline-hidden"
                />
              </div>

              {/* Statutory Disclaimer */}
              <div>
                <label className="mb-1 block font-semibold text-slate-700">
                  NMC Regulatory Disclaimer (Appears on all exported summaries)
                </label>
                <textarea
                  rows={2}
                  value={formData.defaultDisclaimer}
                  onChange={(e) =>
                    setFormData({ ...formData, defaultDisclaimer: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-800 focus:border-teal-500 focus:bg-white focus:outline-hidden"
                />
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex items-center gap-1.5 rounded-xl bg-teal-600 px-5 py-2 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-50 transition shadow-xs"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>{isSaving ? "Saving Settings..." : isEditing ? "Update Hospital" : "Create Hospital"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
