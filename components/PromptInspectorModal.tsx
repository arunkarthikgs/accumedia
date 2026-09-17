"use client";

import { useState, useEffect } from "react";
import {
  X,
  Copy,
  Check,
  Code2,
  Database,
  Terminal,
  Cpu,
  Layers,
  FileCode,
  Loader2,
} from "lucide-react";

interface PromptInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  orgId: string;
  recordingId?: string;
  asrModel?: string;
}

export default function PromptInspectorModal({
  isOpen,
  onClose,
  orgId,
  recordingId,
  asrModel,
}: PromptInspectorModalProps) {
  const [activeTab, setActiveTab] = useState<"prompts" | "database" | "json">("prompts");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    async function fetchDiagnostics() {
      setLoading(true);
      try {
        const url = `/api/diagnostics/prompts-properties?orgId=${orgId || ""}${
          recordingId ? `&recordingId=${recordingId}` : ""
        }${
          asrModel ? `&model=${encodeURIComponent(asrModel)}` : ""
        }`;
        const res = await fetch(url);
        const result = await res.json();
        if (res.ok) {
          setData(result);
        }
      } catch (err) {
        console.error("Failed to load prompt diagnostics:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchDiagnostics();
  }, [isOpen, orgId, recordingId, asrModel]);

  if (!isOpen) return null;

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-xs">
      <div className="flex h-[88vh] w-full max-w-4xl flex-col rounded-lg border border-line bg-surface shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-pine-tint text-pine">
              <Cpu className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-ink">
                AI Prompts & Database Properties Inspector
              </h3>
              <p className="text-[11px] text-muted">
                Audit trail for regulatory verification, prompt debugging, and metadata tracking
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-muted hover:bg-paper hover:text-ink transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-line bg-paper px-6 pt-2">
          <button
            type="button"
            onClick={() => setActiveTab("prompts")}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-semibold transition ${
              activeTab === "prompts"
                ? "border-pine text-pine"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            <Terminal className="h-3.5 w-3.5" /> AI Prompts & Agents
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("database")}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-semibold transition ${
              activeTab === "database"
                ? "border-pine text-pine"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            <Database className="h-3.5 w-3.5" /> Database Properties
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("json")}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-semibold transition ${
              activeTab === "json"
                ? "border-pine text-pine"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            <Code2 className="h-3.5 w-3.5" /> Raw JSON Snapshot
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 text-xs">
          {loading ? (
            <div className="flex h-64 flex-col items-center justify-center gap-2 text-muted">
              <Loader2 className="h-6 w-6 animate-spin text-pine" />
              <span>Fetching live prompts and database properties...</span>
            </div>
          ) : !data ? (
            <p className="text-muted">No properties available for this entity.</p>
          ) : (
            <>
              {/* TAB 1: AI PROMPTS */}
              {activeTab === "prompts" && (
                <div className="space-y-5">
                  {/* Whisper Prompt */}
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="font-semibold text-slate-800">
                        Stage 1: ASR Speech-to-Text Prompt ({data.prompts?.asrTranscriptionPrompt?.agent})
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          copyToClipboard(data.prompts?.asrTranscriptionPrompt?.prompt, "asr")
                        }
                        className="flex items-center gap-1 text-[11px] text-teal-700 hover:underline"
                      >
                        {copiedKey === "asr" ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                        {copiedKey === "asr" ? "Copied" : "Copy"}
                      </button>
                    </div>
                    <pre className="rounded-lg bg-slate-900 p-3 font-mono text-[11px] text-slate-100 whitespace-pre-wrap">
                      {data.prompts?.asrTranscriptionPrompt?.prompt || "No prompt text is used by this engine."}
                    </pre>
                    <p className="mt-2 text-[11px] text-muted">
                      {data.prompts?.asrTranscriptionPrompt?.note}
                    </p>
                  </div>

                  {/* LLM Clinical Refiner Prompt */}
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <div>
                        <span className="font-semibold text-slate-800">
                          Stage 2: LLM Clinical Refinement ({data.prompts?.clinicalRefinerPrompt?.agent})
                        </span>
                        <span className="ml-2 rounded-md bg-teal-100 px-1.5 py-0.5 text-[10px] font-mono text-teal-800">
                          temperature: {data.prompts?.clinicalRefinerPrompt?.temperature}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          copyToClipboard(
                            data.prompts?.clinicalRefinerPrompt?.systemPrompt,
                            "refiner"
                          )
                        }
                        className="flex items-center gap-1 text-[11px] text-teal-700 hover:underline"
                      >
                        {copiedKey === "refiner" ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                        {copiedKey === "refiner" ? "Copied" : "Copy"}
                      </button>
                    </div>
                    <pre className="rounded-lg bg-slate-900 p-3 font-mono text-[11px] text-slate-100 whitespace-pre-wrap leading-relaxed">
                      {data.prompts?.clinicalRefinerPrompt?.systemPrompt}
                    </pre>
                  </div>

                  {/* Organization Prompt */}
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="font-semibold text-slate-800">
                        Organization System Instructions & Disclaimer
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          copyToClipboard(
                            data.prompts?.organizationSystemPrompt?.systemPrompt,
                            "org_prompt"
                          )
                        }
                        className="flex items-center gap-1 text-[11px] text-teal-700 hover:underline"
                      >
                        {copiedKey === "org_prompt" ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                        {copiedKey === "org_prompt" ? "Copied" : "Copy"}
                      </button>
                    </div>
                    <pre className="rounded-lg bg-slate-900 p-3 font-mono text-[11px] text-slate-100 whitespace-pre-wrap">
                      {data.prompts?.organizationSystemPrompt?.systemPrompt}
                    </pre>
                    <p className="mt-2 text-[11px] text-slate-500 font-medium">
                      Mandatory Statutory Disclaimer: <span className="italic text-slate-700">{data.prompts?.organizationSystemPrompt?.disclaimer}</span>
                    </p>
                  </div>
                </div>
              )}

              {/* TAB 2: DATABASE PROPERTIES */}
              {activeTab === "database" && (
                <div className="space-y-6">
                  {/* Audio Recording DB Table */}
                  <div>
                    <h4 className="mb-2 flex items-center gap-1.5 font-bold text-slate-800">
                      <FileCode className="h-3.5 w-3.5 text-teal-600" /> PostgreSQL Table: `audio_recordings`
                    </h4>
                    {data.databaseProperties?.audioRecording ? (
                      <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white font-mono text-[11px]">
                        {Object.entries(data.databaseProperties.audioRecording).map(([k, v]) => (
                          <div key={k} className="flex flex-col sm:flex-row sm:items-center justify-between p-2.5 hover:bg-slate-50">
                            <span className="font-semibold text-slate-600">{k}</span>
                            <span className="max-w-md truncate text-slate-900 text-right">
                              {typeof v === "object" && v !== null ? JSON.stringify(v) : String(v ?? "null")}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-slate-400">
                        No audio recording submitted yet. Submit or record an audio file to view active database columns.
                      </div>
                    )}
                  </div>

                  {/* Organization DB Table */}
                  <div>
                    <h4 className="mb-2 flex items-center gap-1.5 font-bold text-slate-800">
                      <Layers className="h-3.5 w-3.5 text-teal-600" /> PostgreSQL Table: `organizations`
                    </h4>
                    {data.databaseProperties?.organization ? (
                      <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white font-mono text-[11px]">
                        {Object.entries(data.databaseProperties.organization)
                          .filter(([k]) => k !== "channelDefinitions" && k !== "complianceRules")
                          .map(([k, v]) => (
                            <div key={k} className="flex flex-col sm:flex-row sm:items-center justify-between p-2.5 hover:bg-slate-50">
                              <span className="font-semibold text-slate-600">{k}</span>
                              <span className="max-w-md truncate text-slate-900 text-right">
                                {String(v ?? "null")}
                              </span>
                            </div>
                          ))}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-slate-400">
                        No organization selected.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 3: RAW JSON */}
              {activeTab === "json" && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => copyToClipboard(JSON.stringify(data, null, 2), "raw_json")}
                    className="absolute right-4 top-4 flex items-center gap-1 rounded-md bg-slate-800 px-2.5 py-1 text-[10px] font-semibold text-slate-200 hover:bg-slate-700"
                  >
                    {copiedKey === "raw_json" ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                    {copiedKey === "raw_json" ? "Copied" : "Copy JSON"}
                  </button>
                  <pre className="max-h-[60vh] overflow-y-auto rounded-xl bg-slate-900 p-4 font-mono text-[11px] text-teal-300">
                    {JSON.stringify(data, null, 2)}
                  </pre>
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-6 py-3">
          <span className="font-mono text-[10px] text-slate-400">
            Schema: PostgreSQL (nabh_staging_db.macula)
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-slate-200 px-4 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-300 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
