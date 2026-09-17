"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert, Sparkles, Loader2 } from "lucide-react";

export default function ClinicalIngestionPage() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSynthesize = async () => {
    if (!text.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/cases/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, organizationId: "DEMO_ORG_UUID" }),
      });

      if (!res.ok) throw new Error("Synthesis and compliance scan failed.");
      const { masterRecord, safetyAudit } = await res.json();

      const saveRes = await fetch("/api/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawInput: text,
          masterRecord,
          safetyAudit,
          physicianId: "DEMO_DOCTOR_UUID",
          organizationId: "DEMO_ORG_UUID",
        }),
      });

      const savedCase = await saveRes.json();
      router.push(`/cases/${savedCase.id}/review`);
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-10 px-4">
      <div className="border-b pb-4 mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Clinical Ingestion Studio</h1>
        <p className="text-sm text-slate-600">
          Paste or dictate clinical notes. Content will undergo deterministic regex sanitization and an LLM compliance audit under DPDP & NMC regulations.
        </p>
      </div>

      <div className="bg-white border rounded-xl p-6 shadow-sm space-y-4">
        <label className="block text-sm font-semibold text-slate-800">
          Raw OPD Case Transcript / Surgical Log
        </label>
        <textarea
          rows={10}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste notes with UHID, phone, symptoms, examination, anti-VEGF injection, and follow-up vision status..."
          className="w-full border rounded-lg p-3 text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-600 font-mono text-sm"
        />

        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 text-sm rounded-lg">
            <ShieldAlert className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex justify-end">
          <button
            onClick={handleSynthesize}
            disabled={loading || !text.trim()}
            className="flex items-center gap-2 bg-teal-700 hover:bg-teal-800 text-white font-medium py-2.5 px-6 rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Auditing & Synthesizing...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Run Compliance Scan & Synthesize</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
