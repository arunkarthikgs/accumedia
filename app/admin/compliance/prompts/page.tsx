"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ShieldAlert,
  ArrowLeft,
  Building2,
  Save,
  Play,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Terminal,
  FileCheck,
  Cpu,
  RefreshCw,
  Sparkles,
  Sliders,
  Layers,
} from "lucide-react";

interface ChannelDefinition {
  id: string;
  channelKey: string;
  displayName: string;
  targetAudience: string;
  systemPrompt: string;
  isActive: boolean;
}

interface Organization {
  id: string;
  name: string;
}

export default function CompliancePromptsAdminPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");
  const [currentUser, setCurrentUser] = useState<any>(null);

  // Form State
  const [customSystemPrompt, setCustomSystemPrompt] = useState("");
  const [defaultDisclaimer, setDefaultDisclaimer] = useState("");
  const [clinicalRefinerPrompt, setClinicalRefinerPrompt] = useState("");
  const [channels, setChannels] = useState<ChannelDefinition[]>([]);

  // Testing Sandbox State
  const [activeTab, setActiveTab] = useState<"synthesizer" | "refiner" | "disclaimer" | "channels">("synthesizer");
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

  useEffect(() => {
    async function init() {
      try {
        const userRes = await fetch("/api/users");
        if (userRes.ok) {
          const data = await userRes.json();
          const users = data.users || [];
          // Pick the first compliance officer or admin as default operator
          const officer = users.find((u: any) => u.role === "COMPLIANCE_OFFICER" || u.role === "ADMIN") || users[0];
          setCurrentUser(officer);

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
          setCustomSystemPrompt(json.data.customSystemPrompt || "");
          setDefaultDisclaimer(json.data.defaultDisclaimer || "");
          setClinicalRefinerPrompt(json.data.clinicalRefinerPrompt || "");
          setChannels(json.data.channelDefinitions || []);
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
          userId: currentUser?.id,
          customSystemPrompt,
          defaultDisclaimer,
          channels,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to save prompts");

      setStatusMessage({
        type: "success",
        text: "Changes saved and published to PostgreSQL live database.",
      });
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

    let activePrompt = customSystemPrompt;
    if (activeTab === "refiner") activePrompt = clinicalRefinerPrompt;
    else if (activeTab === "disclaimer") activePrompt = `Append the following disclaimer to clinical text: "${defaultDisclaimer}"`;
    else if (activeTab === "channels" && channels.length > 0) activePrompt = channels[0].systemPrompt;

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

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
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
              <h1 className="text-base font-bold text-slate-900">
                Statutory Compliance & AI Prompt Control Center
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {currentUser && (
              <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                Auditor: <strong className="font-semibold">{currentUser.name}</strong> ({currentUser.role || "ADMIN"})
              </span>
            )}

            <button
              type="button"
              onClick={handleSavePrompts}
              disabled={isSaving || isLoading}
              className="flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-teal-700 disabled:opacity-50 transition"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              <span>Save & Publish Prompts</span>
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
          <select
            value={selectedOrgId}
            onChange={(e) => setSelectedOrgId(e.target.value)}
            className="w-full sm:w-80 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-800 focus:border-teal-500 focus:bg-white focus:outline-hidden"
          >
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
        </div>

        {/* Two-Column Editor & Interactive Sandbox */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Prompt Navigation & Code Editors */}
          <div className="lg:col-span-7 space-y-4">
            {/* Category Tabs */}
            <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xs">
              <button
                type="button"
                onClick={() => setActiveTab("synthesizer")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  activeTab === "synthesizer"
                    ? "bg-teal-600 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <Sparkles className="h-3.5 w-3.5" /> Clinical Synthesizer
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("refiner")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  activeTab === "refiner"
                    ? "bg-teal-600 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <Cpu className="h-3.5 w-3.5" /> Stage 2 Refiner
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("disclaimer")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  activeTab === "disclaimer"
                    ? "bg-teal-600 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <FileCheck className="h-3.5 w-3.5" /> NMC Disclaimer
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("channels")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  activeTab === "channels"
                    ? "bg-teal-600 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <Layers className="h-3.5 w-3.5" /> Channel Prompts
              </button>
            </div>

            {/* Tab Editor Views */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-3">
              {activeTab === "synthesizer" && (
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-bold text-slate-800">
                        Master Clinical Synthesizer System Prompt
                      </h3>
                      <p className="text-[11px] text-slate-500">
                        Controls formatting into 5-part master records and enforces DPDP PHI redaction rules.
                      </p>
                    </div>
                    <span className="rounded-md bg-teal-50 px-2 py-0.5 text-[10px] font-mono text-teal-800 border border-teal-200">
                      model: gpt-4o
                    </span>
                  </div>
                  <textarea
                    rows={16}
                    value={customSystemPrompt}
                    onChange={(e) => setCustomSystemPrompt(e.target.value)}
                    placeholder="Enter Master Synthesizer System Prompt..."
                    className="w-full rounded-xl border border-slate-200 bg-slate-900 p-4 font-mono text-xs leading-relaxed text-teal-300 focus:border-teal-500 focus:outline-hidden"
                  />
                </div>
              )}

              {activeTab === "refiner" && (
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-bold text-slate-800">
                        Clinical Speech-to-Text Refiner Prompt
                      </h3>
                      <p className="text-[11px] text-slate-500">
                        Instructs the model on correcting pharmacological nomenclature without altering clinical intent.
                      </p>
                    </div>
                    <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-mono text-amber-800 border border-amber-200">
                      temperature: 0.1
                    </span>
                  </div>
                  <textarea
                    rows={16}
                    value={clinicalRefinerPrompt}
                    onChange={(e) => setClinicalRefinerPrompt(e.target.value)}
                    placeholder="Enter Clinical Refiner Prompt..."
                    className="w-full rounded-xl border border-slate-200 bg-slate-900 p-4 font-mono text-xs leading-relaxed text-amber-300 focus:border-teal-500 focus:outline-hidden"
                  />
                </div>
              )}

              {activeTab === "disclaimer" && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-xs font-bold text-slate-800">
                      Mandatory NMC Statutory Disclaimer
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Appended to all public and educational assets to satisfy NMC Medical Ethics Regulations.
                    </p>
                  </div>
                  <textarea
                    rows={6}
                    value={defaultDisclaimer}
                    onChange={(e) => setDefaultDisclaimer(e.target.value)}
                    placeholder="Enter statutory disclaimer..."
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 p-4 font-mono text-xs text-slate-800 focus:border-teal-500 focus:bg-white focus:outline-hidden"
                  />
                </div>
              )}

              {activeTab === "channels" && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-xs font-bold text-slate-800">
                      Channel-Specific Generation Prompts
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Defines the tone, vocabulary, and audience level for downstream publishing formats.
                    </p>
                  </div>
                  {channels.map((ch, idx) => (
                    <div key={ch.id} className="rounded-xl border border-slate-200 p-4 space-y-2 bg-slate-50/50">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-xs text-slate-800">
                          {ch.displayName} ({ch.channelKey})
                        </span>
                        <span className="text-[10px] text-slate-500">Target: {ch.targetAudience}</span>
                      </div>
                      <textarea
                        rows={5}
                        value={ch.systemPrompt}
                        onChange={(e) => {
                          const updated = [...channels];
                          updated[idx].systemPrompt = e.target.value;
                          setChannels(updated);
                        }}
                        className="w-full rounded-lg border border-slate-200 bg-slate-900 p-3 font-mono text-xs text-teal-300 focus:outline-hidden"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
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
