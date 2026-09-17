"use client";

import { useEffect, useState } from "react";
import { Save, RotateCcw, ShieldCheck, AlertCircle, Loader2 } from "lucide-react";

export default function AdminPromptSettingsPage() {
  const [promptText, setPromptText] = useState("");
  const [defaultPrompt, setDefaultPrompt] = useState("");
  const [isCustom, setIsCustom] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings/prompt")
      .then((res) => res.json())
      .then((data) => {
        setPromptText(data.activePrompt);
        setDefaultPrompt(data.defaultPrompt);
        setIsCustom(data.isCustom);
        setCanEdit(data.canEdit);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/settings/prompt", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: promptText, resetToDefault: false }),
      });
      if (!res.ok) throw new Error("Failed to save prompt.");
      setIsCustom(true);
      setStatusMessage("Compliance system prompt updated in database.");
    } catch (err: any) {
      setStatusMessage(err.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm("Revert to statutory Indian DPDP and NMC base prompt?")) return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings/prompt", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resetToDefault: true }),
      });
      if (!res.ok) throw new Error("Failed to reset.");
      setPromptText(defaultPrompt);
      setIsCustom(false);
      setStatusMessage("Reverted to base regulatory prompt.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center text-slate-500 text-sm">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading prompt configuration...
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto py-10 px-4 space-y-6">
      <div className="border-b pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Compliance Prompt Configuration</h1>
          <p className="text-sm text-slate-600">
            Configure system prompt instructions for statutory de-identification and clinical synthesis.
          </p>
        </div>
        <span
          className={`text-xs font-semibold px-3 py-1 rounded-full ${
            isCustom ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
          }`}
        >
          {isCustom ? "Custom Policy Active" : "Default Statutory Policy"}
        </span>
      </div>

      {statusMessage && (
        <div className="p-3 bg-teal-50 border border-teal-200 text-teal-800 text-sm rounded-lg flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      <div className="bg-white border rounded-xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <label className="text-sm font-semibold text-slate-800">Prompt Instructions</label>
          {canEdit && (
            <div className="flex gap-2">
              <button
                onClick={handleReset}
                disabled={saving || !isCustom}
                className="flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Revert to Default
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 bg-teal-700 hover:bg-teal-800 text-white px-4 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save Changes
              </button>
            </div>
          )}
        </div>

        <textarea
          rows={22}
          value={promptText}
          readOnly={!canEdit}
          onChange={(e) => setPromptText(e.target.value)}
          className={`w-full border rounded-lg p-3 text-slate-800 font-mono text-xs leading-relaxed focus:ring-2 focus:ring-teal-600 focus:outline-none ${
            !canEdit ? "bg-slate-50 cursor-not-allowed" : ""
          }`}
        />

        <div className="p-3 bg-slate-50 rounded-lg text-xs text-slate-500 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
          <span>
            <strong>Statutory Notice:</strong> Local regex filters (phone numbers, ABHA IDs, Aadhaar, PIN codes) execute deterministically prior to LLM submission regardless of prompt modifications.
          </span>
        </div>
      </div>
    </div>
  );
}
