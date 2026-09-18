"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ShieldAlert,
  ArrowLeft,
  Building2,
  Save,
  Pencil,
  X,
  Play,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Terminal,
  RefreshCw,
  Sparkles,
  Layers,
  History,
} from "lucide-react";
import { formatDateTime } from "@/lib/date-format";

interface ChannelDefinition {
  id: string;
  channelKey: string;
  displayName: string;
  targetAudience: string;
  systemPrompt: string;
  isActive: boolean;
  source: "global" | "organization";
  globalSystemPrompt: string;
  globalPromptVersion: number;
  organizationSystemPrompt: string | null;
  organizationPromptVersion: number | null;
  promptVersion: number;
  resetToGlobal?: boolean;
}
interface GovernedPrompt {
  promptKey: string;
  name: string;
  description: string;
  content: string;
  version: number;
  source: "global" | "organization";
  globalContent: string;
  globalVersion: number;
  organizationContent: string | null;
  organizationVersion: number | null;
  history: { id: string; version: number; source: "global" | "organization"; isActive: boolean; createdAt: string }[];
  resetToGlobal?: boolean;
}
interface Organization {
  id: string;
  name: string;
}
interface PromptAuditEvent {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  detail: string | null;
  metadata: { scope?: string; promptKey?: string; channelKey?: string; changedFields?: string[] } | null;
  createdAt: string;
  actorName: string | null;
}

const PROMPT_STAGE_HELP: Record<string, string> = {
  ASR_TRANSCRIPTION: "Stage 1 speech-to-text guidance. Used for Whisper transcription to preserve clinical wording without summarizing or inventing facts.",
  MASTER_SYNTHESIS: "Used after clinical refinement to create the structured Master Clinical Record and its DPDP/NMC safety audit.",
  CLINICAL_REFINER: "Used after speech-to-text to correct medical terminology and structure without adding clinical facts.",
  SEO_KEYWORDS: "Used after Master Clinical Record synthesis to create the approved keyword strategy consumed by SEO publishing assets.",
  IMAGE_GENERATION: "Used when an approved case requests a generated educational image for a publishing channel.",
  IMAGE_SAFETY: "Used after image generation or upload to detect faces, readable identifiers, and other public-use risks.",
};

const GOVERNED_PROMPT_GROUPS = [
  {
    title: "Case Ingestion",
    description: "Prompts used to transform dictated clinical input into the approved Master Clinical Record.",
    promptKeys: ["ASR_TRANSCRIPTION", "CLINICAL_REFINER", "MASTER_SYNTHESIS"],
  },
  {
    title: "Asset Creation",
    description: "Prompts used to create publishing strategy, images, and publication-ready assets from an approved case.",
    promptKeys: ["SEO_KEYWORDS", "IMAGE_GENERATION", "IMAGE_SAFETY"],
  },
] as const;

export default function CompliancePromptsAdminPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");
  const [currentUser, setCurrentUser] = useState<any>(null);

  // Form State
  const [governedPrompts, setGovernedPrompts] = useState<GovernedPrompt[]>([]);
  const [selectedPromptKey, setSelectedPromptKey] = useState("MASTER_SYNTHESIS");
  const [editingPromptKey, setEditingPromptKey] = useState<string | null>(null);
  const [editingChannelKey, setEditingChannelKey] = useState<string | null>(null);
  const [editScope, setEditScope] = useState<"organization" | "global">("organization");
  const [canEditGlobal, setCanEditGlobal] = useState(false);
  const [channels, setChannels] = useState<ChannelDefinition[]>([]);
  const [promptAuditTrail, setPromptAuditTrail] = useState<PromptAuditEvent[]>([]);

  // Testing Sandbox State
  const [activeTab, setActiveTab] = useState<"governed" | "channels">("governed");
  const [testInput, setTestInput] = useState(
    "Patient 45yo male presents with severe epigastric pain radiating to back since 6 hours. Hx of alcohol intake. BP 130/80, PR 102. Serum amylase 840, lipase 1200. USG abdomen shows bulky pancreas. Started on IV fluids, analgesics."
  );
  const [testOutput, setTestOutput] = useState("");
  const [testStats, setTestStats] = useState<{ executionTimeMs: number; tokensUsed: number } | null>(null);

  // Async States
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const changeEditScope = (scope: "organization" | "global") => {
    setEditScope(scope);
    setEditingPromptKey(null);
    setEditingChannelKey(null);
    setGovernedPrompts((current) => current.map((prompt) => ({
      ...prompt,
      content: scope === "global" ? prompt.globalContent : prompt.organizationContent || prompt.globalContent,
      version: scope === "global" ? prompt.globalVersion : prompt.organizationVersion || prompt.globalVersion,
      source: scope === "global" || !prompt.organizationContent ? "global" : "organization",
    })));
    setChannels((current) => current.map((channel) => ({
      ...channel,
      systemPrompt: scope === "global" ? channel.globalSystemPrompt : channel.organizationSystemPrompt || channel.globalSystemPrompt,
      promptVersion: scope === "global" ? channel.globalPromptVersion : channel.organizationPromptVersion || channel.globalPromptVersion,
      source: scope === "global" || !channel.organizationSystemPrompt ? "global" : "organization",
    })));
  };

  const applyPromptData = (data: any, scope: "organization" | "global") => {
    setGovernedPrompts((data.governedPrompts || []).map((prompt: GovernedPrompt) => ({
      ...prompt,
      content: scope === "global" ? prompt.globalContent : prompt.organizationContent || prompt.globalContent,
      version: scope === "global" ? prompt.globalVersion : prompt.organizationVersion || prompt.globalVersion,
      source: scope === "global" || !prompt.organizationContent ? "global" : "organization",
    })));
    setCanEditGlobal(Boolean(data.canEditGlobal));
    setChannels((data.channelDefinitions || []).map((channel: ChannelDefinition) => ({
      ...channel,
      systemPrompt: scope === "global" ? channel.globalSystemPrompt : channel.organizationSystemPrompt || channel.globalSystemPrompt,
      promptVersion: scope === "global" ? channel.globalPromptVersion : channel.organizationPromptVersion || channel.globalPromptVersion,
      source: scope === "global" || !channel.organizationSystemPrompt ? "global" : "organization",
    })));
    setPromptAuditTrail(data.promptAuditTrail || []);
  };

  useEffect(() => {
    async function init() {
      try {
        const [userRes, sessionRes] = await Promise.all([fetch("/api/users"), fetch("/api/auth/me")]);
        if (sessionRes.ok) setCurrentUser((await sessionRes.json()).user || null);
        if (userRes.ok) {
          const data = await userRes.json();
          const users = data.users || [];

          const orgMap = new Map<string, Organization>();
          users.forEach((u: any) => {
            if (u.organization) {
              orgMap.set(u.organization.id, {
                id: u.organization.id,
                name: u.organization.name,
              });
            }
          });

          const orgList = Array.from(orgMap.values());
          setOrganizations(orgList);
          if (orgList.length > 0) {
            setSelectedOrgId(orgList[0].id);
          }
        }
      } catch (err) {
        console.error("Init failed:", err);
      }
    }
    init();
  }, []);

  useEffect(() => {
    if (!selectedOrgId) return;

    async function loadPrompts() {
      setIsLoading(true);
      setStatusMessage(null);
      try {
        const res = await fetch(`/api/compliance/prompts?orgId=${selectedOrgId}`);
        const json = await res.json();
        if (res.ok && json.data) {
          applyPromptData(json.data, "organization");
        } else {
          setStatusMessage({ type: "error", text: json.error || "Failed to load prompts" });
        }
      } catch (err: any) {
        setStatusMessage({ type: "error", text: err.message || "Network error loading prompts" });
      } finally {
        setIsLoading(false);
      }
    }
    loadPrompts();
  }, [selectedOrgId]);

  const handleSavePrompts = async () => {
    setIsSaving(true);
    setStatusMessage(null);

    try {
      const res = await fetch("/api/compliance/prompts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgId: selectedOrgId,
          scope: editScope,
          governedPrompts: governedPrompts.map(({ promptKey, content, resetToGlobal }) => ({ promptKey, content, resetToGlobal })),
          channels: channels.map(({ resetToGlobal, ...channel }) => ({ ...channel, resetToGlobal })),
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to save prompts");

      setStatusMessage({
        type: "success",
        text: "Changes saved and published to PostgreSQL live database.",
      });
      const refreshed = await fetch(`/api/compliance/prompts?orgId=${selectedOrgId}`);
      const refreshedJson = await refreshed.json();
      if (refreshed.ok && refreshedJson.data) applyPromptData(refreshedJson.data, editScope);
    } catch (err: any) {
      setStatusMessage({ type: "error", text: err.message || "Failed to save prompts" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestPrompt = async () => {
    setIsTesting(true);
    setTestOutput("");
    setTestStats(null);

    let activePrompt = governedPrompts.find((prompt) => prompt.promptKey === selectedPromptKey)?.content || "";
    if (activeTab === "channels" && channels.length > 0) activePrompt = channels[0].systemPrompt;

    try {
      const res = await fetch("/api/compliance/prompts/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          promptType: activeTab,
          systemPrompt: activePrompt,
          testInput,
          temperature: 0.1,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Execution failed");

      setTestOutput(json.output);
      setTestStats({
        executionTimeMs: json.executionTimeMs,
        tokensUsed: json.tokensUsed,
      });
    } catch (err: any) {
      setTestOutput(`Error running test: ${err.message}`);
    } finally {
      setIsTesting(false);
    }
  };

  const selectedGovernedPrompt = governedPrompts.find((prompt) => prompt.promptKey === selectedPromptKey) || governedPrompts[0];
  const updateSelectedPrompt = (content: string) => {
    setGovernedPrompts((current) => current.map((prompt) => prompt.promptKey === selectedGovernedPrompt?.promptKey ? { ...prompt, content, resetToGlobal: false } : prompt));
  };
  const resetSelectedPrompt = () => {
    if (!selectedGovernedPrompt || editScope === "global") return;
    setGovernedPrompts((current) => current.map((prompt) => prompt.promptKey === selectedGovernedPrompt.promptKey ? { ...prompt, content: prompt.globalContent, source: "global", resetToGlobal: true } : prompt));
  };

  return (
    <div className="readable-route min-h-screen bg-slate-50 text-slate-900">
      {/* Top Bar */}
      <header className="border-b border-slate-200 bg-white px-8 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Dashboard
            </Link>
            <div className="h-4 w-px bg-slate-200" />
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-teal-600" />
              <div>
                <h1 className="text-base font-bold text-slate-900">AI Prompt Management &amp; Governance</h1>
                <p className="text-[11px] text-slate-500">Manage global defaults, organization overrides, channel prompts, versions, testing, and audit history.</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {currentUser && (
              <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                Operator: <strong className="font-semibold">{currentUser.name}</strong> ({currentUser.isSuperAdmin ? "Super Admin" : currentUser.role?.name || "Administrator"})
              </span>
            )}

            <button
              type="button"
              onClick={handleSavePrompts}
              disabled={isSaving || isLoading}
              className="flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-teal-700 disabled:opacity-50 transition"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              <span>{editScope === "global" ? "Publish Global Defaults" : "Save Organization Overrides"}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl p-8 space-y-6">
        {/* Status Alerts */}
        {statusMessage && (
          <div
            className={`flex items-center gap-2.5 rounded-xl border p-4 text-xs font-semibold ${
              statusMessage.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {statusMessage.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            ) : (
              <AlertCircle className="h-4 w-4 text-red-600" />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* Organization Picker */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div>
            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
              <Building2 className="h-4 w-4 text-teal-600" /> Organization Rulebook Context
            </label>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Prompts and statutory disclaimers are scoped per hospital network for multi-tenancy isolation.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-80">
            <select
              value={selectedOrgId}
              onChange={(e) => { setSelectedOrgId(e.target.value); setEditScope("organization"); setEditingPromptKey(null); setEditingChannelKey(null); }}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-800 focus:border-teal-500 focus:bg-white focus:outline-hidden"
            >
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-2 rounded-lg border border-slate-200 bg-slate-50 p-1 text-[11px] font-semibold">
              <button type="button" onClick={() => changeEditScope("organization")} className={`rounded px-2 py-1.5 ${editScope === "organization" ? "bg-white text-teal-700 shadow-xs" : "text-slate-500"}`}>Organization overrides</button>
              <button type="button" disabled={!canEditGlobal} onClick={() => changeEditScope("global")} title={canEditGlobal ? "Edit defaults inherited by every organization" : "Only Super Admin can edit global defaults"} className={`rounded px-2 py-1.5 ${editScope === "global" ? "bg-white text-teal-700 shadow-xs" : "text-slate-500"} disabled:cursor-not-allowed disabled:opacity-40`}>Global defaults</button>
            </div>
          </div>
        </div>

        {/* Two-Column Editor & Interactive Sandbox */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Prompt Navigation & Code Editors */}
          <div className="lg:col-span-7 space-y-4">
            <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xs">
              <button type="button" onClick={() => setActiveTab("governed")} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${activeTab === "governed" ? "bg-teal-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}><Sparkles className="h-3.5 w-3.5" /> Governed AI Prompts ({governedPrompts.length})</button>
              <button type="button" onClick={() => setActiveTab("channels")} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${activeTab === "channels" ? "bg-teal-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}><Layers className="h-3.5 w-3.5" /> Channel Prompts ({channels.length})</button>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
              {activeTab === "governed" && selectedGovernedPrompt && (
                <div className="space-y-4">
                  {GOVERNED_PROMPT_GROUPS.map((group) => {
                    const groupPrompts = group.promptKeys
                      .map((promptKey) => governedPrompts.find((prompt) => prompt.promptKey === promptKey))
                      .filter(Boolean) as GovernedPrompt[];
                    if (groupPrompts.length === 0) return null;
                    return (
                      <section key={group.title} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                        <div className="mb-3">
                          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-800">{group.title}</h2>
                          <p className="mt-1 text-[11px] text-slate-500">{group.description}</p>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {groupPrompts.map((prompt) => <button key={prompt.promptKey} type="button" onClick={() => setSelectedPromptKey(prompt.promptKey)} className={`rounded-lg border bg-white p-3 text-left ${selectedGovernedPrompt.promptKey === prompt.promptKey ? "border-teal-500 bg-teal-50" : "border-slate-200 hover:border-teal-300"}`}><span className="block text-xs font-bold text-slate-800">{prompt.name}</span><span className="mt-1 block text-[10px] text-slate-500">v{prompt.version} · {prompt.source === "organization" ? "Organization override" : "Global default"}</span></button>)}
                        </div>
                      </section>
                    );
                  })}
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-sm font-bold text-slate-900">{selectedGovernedPrompt.name}</h3><p className="mt-1 text-xs text-slate-600">{selectedGovernedPrompt.description}</p></div><div className="flex items-center gap-2"><span className="rounded bg-white px-2 py-1 text-[10px] font-semibold text-teal-700">{editScope === "global" ? "Global default" : selectedGovernedPrompt.source === "organization" ? "Organization override" : "Inherited global default"} · v{selectedGovernedPrompt.version}</span>{editingPromptKey === selectedGovernedPrompt.promptKey ? <button type="button" onClick={() => setEditingPromptKey(null)} className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-600 hover:border-teal-500"><X className="h-3 w-3" /> Cancel edit</button> : <button type="button" onClick={() => setEditingPromptKey(selectedGovernedPrompt.promptKey)} className="inline-flex items-center gap-1 rounded border border-teal-200 bg-white px-2 py-1 text-[10px] font-semibold text-teal-700 hover:bg-teal-50"><Pencil className="h-3 w-3" /> Edit prompt</button>}</div></div>
                    <div className="mt-3 rounded border border-teal-200 bg-teal-50 p-3 text-xs text-teal-900"><strong>Used during:</strong> {PROMPT_STAGE_HELP[selectedGovernedPrompt.promptKey]}</div>
                  </div>
                  {editingPromptKey === selectedGovernedPrompt.promptKey ? <textarea rows={18} autoFocus value={selectedGovernedPrompt.content} onChange={(event) => updateSelectedPrompt(event.target.value)} className="w-full rounded-xl border border-teal-400 bg-slate-900 p-4 font-mono text-xs leading-relaxed text-teal-300 focus:border-teal-500 focus:outline-hidden" /> : <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-100 p-4 font-mono text-xs leading-relaxed text-slate-700">{selectedGovernedPrompt.content}</pre>}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-[11px] text-slate-500">History: {selectedGovernedPrompt.history.map((entry) => `v${entry.version} ${entry.source}`).join(" · ")}</span>
                    {editScope === "organization" && <button type="button" onClick={resetSelectedPrompt} className="flex items-center gap-1.5 rounded border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-teal-500"><RefreshCw className="h-3.5 w-3.5" /> Reset to global default</button>}
                  </div>
                </div>
              )}

              {activeTab === "channels" && (
                <div className="space-y-4">
                  <div className="rounded border border-teal-200 bg-teal-50 p-3 text-xs text-teal-900"><strong>Used during:</strong> After case approval, each prompt adapts the Master Clinical Record for one publishing format, audience, and duration.</div>
                  {channels.map((channel, index) => <div key={channel.channelKey} className="rounded-xl border border-slate-200 bg-slate-50/50 p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><span className="text-xs font-bold text-slate-800">{channel.displayName}</span><span className="ml-2 text-[10px] text-slate-500">{channel.channelKey} · Target: {channel.targetAudience}</span></div><div className="flex items-center gap-2"><span className="rounded bg-white px-2 py-1 text-[10px] font-semibold text-teal-700">{editScope === "global" ? "Global default" : channel.source === "organization" ? "Organization override" : "Inherited global default"} · v{channel.promptVersion}</span>{editingChannelKey === channel.channelKey ? <button type="button" onClick={() => setEditingChannelKey(null)} className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-600 hover:border-teal-500"><X className="h-3 w-3" /> Cancel edit</button> : <button type="button" onClick={() => setEditingChannelKey(channel.channelKey)} className="inline-flex items-center gap-1 rounded border border-teal-200 bg-white px-2 py-1 text-[10px] font-semibold text-teal-700 hover:bg-teal-50"><Pencil className="h-3 w-3" /> Edit prompt</button>}</div></div>{editingChannelKey === channel.channelKey ? <textarea rows={6} autoFocus value={channel.systemPrompt} onChange={(event) => { const updated = [...channels]; updated[index] = { ...channel, systemPrompt: event.target.value, resetToGlobal: false }; setChannels(updated); }} className="mt-3 w-full rounded-lg border border-teal-400 bg-slate-900 p-3 font-mono text-xs text-teal-300" /> : <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-100 p-3 font-mono text-xs leading-relaxed text-slate-700">{channel.systemPrompt}</pre>}{editScope === "organization" && <div className="mt-2 text-right"><button type="button" onClick={() => { const updated = [...channels]; updated[index] = { ...channel, systemPrompt: channel.globalSystemPrompt, source: "global", resetToGlobal: true }; setChannels(updated); }} className="text-[11px] font-semibold text-teal-700 hover:underline">Reset to global default</button></div>}</div>)}
                </div>
              )}
            </div>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs" aria-label="Prompt audit trail">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2"><History className="h-4 w-4 text-teal-600" /><h2 className="text-sm font-bold text-slate-900">Recent prompt changes</h2></div>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Last {promptAuditTrail.length}</span>
              </div>
              {promptAuditTrail.length === 0 ? <p className="mt-3 text-xs text-slate-500">No prompt changes have been recorded for this organization.</p> : <div className="mt-3 divide-y divide-slate-100">{promptAuditTrail.slice(0, 12).map((event) => <div key={event.id} className="py-3"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-semibold text-slate-800">{event.metadata?.promptKey || event.metadata?.channelKey || event.targetType.replaceAll("_", " ")}</span><span className="text-[10px] text-slate-400">{formatDateTime(event.createdAt)}</span></div><p className="mt-1 text-[11px] text-slate-600">{event.detail || event.action.replaceAll("_", " ")}</p><p className="mt-1 text-[10px] text-slate-400">{event.actorName || "System"} · {event.metadata?.scope || "organization"} scope · {event.action.replaceAll("_", " ").toLowerCase()}</p></div>)}</div>}
            </section>
          </div>

          {/* Right Column: Live Testing Sandbox */}
          <div className="lg:col-span-5 space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Terminal className="h-4 w-4 text-teal-600" />
                  <h3 className="text-xs font-bold text-slate-900">Sandbox Test Harness</h3>
                </div>
                <button
                  type="button"
                  onClick={handleTestPrompt}
                  disabled={isTesting || !testInput.trim()}
                  className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-teal-700 disabled:opacity-50 transition"
                >
                  {isTesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5 fill-current" />}
                  <span>Run Test</span>
                </button>
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-600">
                  Sample Clinical Dictation Input
                </label>
                <textarea
                  rows={4}
                  value={testInput}
                  onChange={(e) => setTestInput(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-800 focus:border-teal-500 focus:bg-white focus:outline-hidden"
                />
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-[11px] font-semibold text-slate-600">
                    Live Model Output Preview
                  </label>
                  {testStats && (
                    <span className="text-[10px] text-slate-400 font-mono">
                      {testStats.executionTimeMs}ms · {testStats.tokensUsed} tokens
                    </span>
                  )}
                </div>
                <div className="min-h-[260px] rounded-xl border border-slate-200 bg-slate-900 p-4 font-mono text-xs text-emerald-300 whitespace-pre-wrap overflow-y-auto">
                  {isTesting ? (
                    <div className="flex h-48 flex-col items-center justify-center gap-2 text-slate-500">
                      <Loader2 className="h-5 w-5 animate-spin text-teal-500" />
                      <span>Executing candidate prompt with GPT-4o...</span>
                    </div>
                  ) : testOutput ? (
                    testOutput
                  ) : (
                    <span className="text-slate-600">Click "Run Test" to simulate output with the active prompt.</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
