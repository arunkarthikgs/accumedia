"use client";

import React, { useState, useRef } from "react";
import { MasterRecord, SafetyReport } from "@/lib/types";

export default function CaseWorkflowStudio() {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [inputText, setInputText] = useState("");
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const [masterRecord, setMasterRecord] = useState<MasterRecord | null>(null);
  const [safetyReport, setSafetyReport] = useState<SafetyReport | null>(null);
  const [generatedAssets, setGeneratedAssets] = useState<any[] | null>(null);
  const [activeTab, setActiveTab] = useState<string>("LINKEDIN_LONG");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      chunksRef.current = [];
      setRecordingDuration(0);

      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setAudioBlob(blob);
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      timerRef.current = setInterval(() => setRecordingDuration((d) => d + 1), 1000);
    } catch {
      alert("Microphone access denied or unavailable.");
    }
  };

  const stopVoiceRecording = () => {
    mediaRecorderRef.current?.stop();
    if (timerRef.current) clearInterval(timerRef.current);
    setIsRecording(false);
  };

  const runSynthesis = async () => {
    setIsSynthesizing(true);
    const fd = new FormData();
    if (audioBlob) fd.append("audio", audioBlob);
    if (inputText) fd.append("text", inputText);

    try {
      const res = await fetch("/api/cases/synthesize", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMasterRecord(data.masterRecord);
      setSafetyReport(data.safetyAudit);
    } catch (err: any) {
      alert(err.message || "Synthesis failed");
    } finally {
      setIsSynthesizing(false);
    }
  };

  const runAssetGeneration = async () => {
    if (!masterRecord || !safetyReport) return;
    setIsGenerating(true);
    try {
      const res = await fetch("/api/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ masterRecord, safetyReport, transcript: inputText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setGeneratedAssets(data.assets);
      setActiveTab(data.assets[0]?.assetType || "LINKEDIN_LONG");
    } catch (err: any) {
      alert(err.message || "Asset generation failed");
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const currentAsset = generatedAssets?.find((a) => a.assetType === activeTab);

  return (
    <div className="space-y-8 pb-16">
      {/* Visual Workflow Steps Bar */}
      <div className="bg-surface rounded-lg border border-line p-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-center gap-3.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-pine text-white font-bold text-sm shadow-sm">
              1
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted">Step 1</p>
              <h4 className="text-sm font-semibold text-ink">Clinical Ingestion</h4>
            </div>
          </div>
          <div className="flex items-center gap-3.5">
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-bold text-sm shadow-sm transition-colors ${
              masterRecord ? "bg-pine text-white shadow-sm" : "bg-paper text-muted"
            }`}>
              2
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted">Step 2</p>
              <h4 className="text-sm font-semibold text-ink">Compliance & Safety Gate</h4>
            </div>
          </div>
          <div className="flex items-center gap-3.5">
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-bold text-sm shadow-sm transition-colors ${
              generatedAssets ? "bg-pine text-white shadow-sm" : "bg-paper text-muted"
            }`}>
              3
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted">Step 3</p>
              <h4 className="text-sm font-semibold text-ink">Omnichannel Deliverables</h4>
            </div>
          </div>
        </div>
      </div>

      {/* 1. Ingestion Phase */}
      <section className="bg-surface rounded-lg border border-line p-7">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-line pb-5 mb-6">
          <div>
            <h3 className="text-lg font-bold text-ink">1. Case Capture & Intake</h3>
            <p className="text-xs text-muted mt-0.5">Dictate or paste clinical notes from your OPD or surgical log</p>
          </div>
          
          <div className="flex items-center gap-3">
            {!isRecording ? (
              <button
                onClick={startVoiceRecording}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-pine-tint text-pine hover:bg-pine-tint font-semibold text-xs transition border border-pine/20"
              >
                <span className="h-2.5 w-2.5 rounded-full bg-pine animate-pulse" />
                Record Voice Case
              </button>
            ) : (
              <button
                onClick={stopVoiceRecording}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brick text-white hover:bg-brick font-semibold text-xs shadow-sm animate-pulse"
              >
                <span className="h-2 w-2 rounded-sm bg-white" />
                Stop Recording ({formatTimer(recordingDuration)})
              </button>
            )}
            {audioBlob && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sage-tint text-sage text-xs font-medium border border-sage/20">
                ✓ Audio Buffered
              </span>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="relative">
            <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-2">
              Clinical Narrative / Case Notes
            </label>
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Example: 63yo male presented with sudden painless vision drop in right eye (OD 6/60). Dilated fundus exam revealed Central Retinal Vein Occlusion (CRVO) with diffuse macular edema. Initiated anti-VEGF injection immediately. At 4 weeks, BCVA improved to 6/12. Key takeaway: Early anti-VEGF intervention in acute CRVO saves visual acuity..."
              rows={5}
              className="w-full text-sm text-ink placeholder-muted p-4 bg-paper border border-line rounded-lg focus:bg-surface focus:border-pine focus:ring-4 focus:ring-pine-tint outline-none transition duration-150 leading-relaxed"
            />
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={runSynthesis}
              disabled={isSynthesizing || (!audioBlob && !inputText.trim())}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-pine hover:bg-pine-dark disabled:bg-line disabled:cursor-not-allowed text-white text-xs font-semibold shadow-sm transition"
            >
              {isSynthesizing ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  De-identifying PHI & Synthesizing...
                </>
              ) : (
                <>Proceed to Compliance Gate &rarr;</>
              )}
            </button>
          </div>
        </div>
      </section>

      {/* 2. Safety Audit & Master Record Gate */}
      {masterRecord && safetyReport && (
        <section className="bg-white rounded-2xl border-2 border-emerald-500/80 p-7 shadow-lg shadow-emerald-50/50 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-5">
            <div>
              <div className="flex items-center gap-2.5">
                <h3 className="text-lg font-bold text-slate-900">2. Clinical Safety & Master Record</h3>
                <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                  safetyReport.isCompliant ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                }`}>
                  {safetyReport.isCompliant ? "Safe Harbor Verified" : "Flags Sanitized"}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">Automated screening against DPDP & NMC medical advertising guidelines</p>
            </div>

            <button
              onClick={runAssetGeneration}
              disabled={isGenerating}
              className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 text-white text-xs font-bold shadow-md shadow-emerald-200 transition"
            >
              {isGenerating ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Generating 6 Assets...
                </>
              ) : (
                <>✓ Sign-Off & Generate All Deliverables</>
              )}
            </button>
          </div>

          {safetyReport.phiDetected.length > 0 && (
            <div className="rounded-xl bg-amber-50/80 border border-amber-200/80 p-4 space-y-2">
              <span className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                Protected Health Information (PHI) Redacted:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {safetyReport.phiDetected.map((p, i) => (
                  <div key={i} className="bg-white/80 p-2.5 rounded-lg border border-amber-200/50 text-slate-700">
                    <span className="font-semibold text-amber-900 uppercase text-[10px] tracking-wide block mb-0.5">{p.category}</span>
                    <span className="line-through text-slate-400 mr-2">&quot;{p.flaggedSnippet}&quot;</span>
                    <span className="text-emerald-700 font-medium">&rarr; {p.remediation}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Diagnosis</span>
              <p className="text-sm font-semibold text-slate-900">{masterRecord.primaryDiagnosis}</p>
              <span className="text-xs text-slate-500 font-medium">{masterRecord.specialty}</span>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Target Audience</span>
              <p className="text-sm font-semibold text-slate-900">{masterRecord.targetAudience}</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Core Takeaway</span>
              <p className="text-xs text-slate-800 leading-relaxed font-medium">{masterRecord.coreEducationalMessage}</p>
            </div>
          </div>
        </section>
      )}

      {/* 3. Omnichannel Delivery Studio */}
      {generatedAssets && (
        <section className="bg-white rounded-2xl border border-slate-200/80 p-7 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-5">
            <div>
              <h3 className="text-lg font-bold text-slate-900">3. Omnichannel Asset Studio</h3>
              <p className="text-xs text-slate-500 mt-0.5">Ready-to-publish educational content across 6 medical channels</p>
            </div>
          </div>

          {/* Asset Tabs */}
          <div className="flex gap-2 border-b border-slate-200/70 overflow-x-auto pb-3 text-xs">
            {[
              { key: "LINKEDIN_LONG", label: "LinkedIn Article" },
              { key: "VIDEO_SCRIPT", label: "Video Teleprompter" },
              { key: "LINKEDIN_SHORT", label: "LinkedIn Carousel" },
              { key: "FACEBOOK", label: "Facebook Patient Post" },
              { key: "X_TWITTER", label: "X / Twitter Thread" },
              { key: "BLOG_SEO", label: "SEO Blog Post" },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2 rounded-xl font-bold transition whitespace-nowrap ${
                  activeTab === tab.key
                    ? "bg-slate-900 text-white shadow-sm"
                    : "bg-slate-100/70 text-slate-600 hover:bg-slate-200/60"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Viewer + Social Card Preview */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-3">
              <div className="flex items-center justify-between bg-slate-50 px-4 py-2.5 rounded-xl border border-slate-200/60">
                <span className="text-xs font-bold text-slate-600">Payload Details</span>
                <button
                  onClick={() =>
                    copyToClipboard(
                      JSON.stringify(currentAsset?.contentPayload, null, 2),
                      activeTab
                    )
                  }
                  className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 transition"
                >
                  {copiedKey === activeTab ? "✓ Copied!" : "Copy Content"}
                </button>
              </div>

              <div className="p-5 bg-slate-900 text-slate-100 rounded-xl border border-slate-800 text-xs font-mono overflow-auto max-h-[440px] leading-relaxed shadow-inner">
                <pre>{JSON.stringify(currentAsset?.contentPayload, null, 2)}</pre>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between bg-slate-50 px-4 py-2.5 rounded-xl border border-slate-200/60">
                <span className="text-xs font-bold text-slate-600">Programmatic Social Card</span>
                <span className="text-[11px] font-medium text-slate-400">1200x630</span>
              </div>
              <div className="rounded-xl border border-slate-200 overflow-hidden shadow-sm bg-slate-100">
                <img
                  src={`/api/og?title=${encodeURIComponent(
                    masterRecord?.primaryDiagnosis || "Clinical Case"
                  )}&doctor=Dr.+Priya+Karthikeyan&specialty=${encodeURIComponent(
                    masterRecord?.specialty || "Ophthalmology"
                  )}`}
                  alt="Dynamic Social Card Preview"
                  className="w-full h-auto object-cover"
                />
              </div>
              <p className="text-[11px] text-slate-400 text-center">
                Edge-generated automatically from case metadata
              </p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
