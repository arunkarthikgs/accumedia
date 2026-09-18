"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ShieldCheck, Plus, ArrowLeft, Trash2, Sliders, Radio } from "lucide-react";

export default function RulesSettingsPage() {
  const [rules, setRules] = useState<any[]>([]);
  const [channels, setChannels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [ruleForm, setRuleForm] = useState({
    ruleType: "DPDP_REDACTION",
    patternOrCheck: "",
    description: "",
    severity: "BLOCKER",
  });

  const [channelForm, setChannelForm] = useState({
    channelKey: "",
    displayName: "",
    targetAudience: "PEER",
    systemPrompt: "",
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/rules");
      if (res.ok) {
        const data = await res.json();
        setRules(data.rules || []);
        setChannels(data.channels || []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const submitRule = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetch("/api/admin/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "RULE", data: ruleForm }),
    });
    setRuleForm({ ruleType: "DPDP_REDACTION", patternOrCheck: "", description: "", severity: "BLOCKER" });
    loadData();
  };

  const submitChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetch("/api/admin/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "CHANNEL", data: channelForm }),
    });
    setChannelForm({ channelKey: "", displayName: "", targetAudience: "PEER", systemPrompt: "" });
    loadData();
  };

  return (
    <div className="readable-route min-h-screen bg-paper p-8 text-ink">
      <div className="mx-auto max-w-6xl space-y-8">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-pine">
            <Link href="/" className="flex items-center gap-1 hover:underline">
              <ArrowLeft className="h-3 w-3" /> Dashboard
            </Link>
            <span>/</span>
            <span>Settings</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            Dynamic Compliance Guardrails &amp; Channels
          </h1>
          <p className="text-xs text-muted">
            All synthesis prompts, redaction rules, and distribution targets are managed centrally and updated safely.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Section: Regulatory Rules */}
          <div className="rounded-lg border border-line bg-surface p-6 space-y-6">
            <div className="flex items-center gap-2 border-b border-line pb-3">
              <ShieldCheck className="h-5 w-5 text-pine" />
              <h2 className="text-base font-bold text-ink">Compliance &amp; DPDP Redaction Rules</h2>
            </div>

            <form onSubmit={submitRule} className="space-y-3 bg-paper p-4 rounded-lg border border-line">
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={ruleForm.ruleType}
                  onChange={(e) => setRuleForm({ ...ruleForm, ruleType: e.target.value })}
                  className="rounded-lg border border-line p-2 text-xs bg-surface"
                >
                  <option value="DPDP_REDACTION">DPDP Regex Redaction</option>
                  <option value="NMC_PROHIBITION">NMC Ethics Prohibition</option>
                </select>
                <select
                  value={ruleForm.severity}
                  onChange={(e) => setRuleForm({ ...ruleForm, severity: e.target.value })}
                  className="rounded-lg border border-line p-2 text-xs bg-surface"
                >
                  <option value="BLOCKER">Blocker</option>
                  <option value="WARNING">Warning</option>
                </select>
              </div>
              <input
                type="text"
                required
                placeholder="Pattern / Regex / Flagged terms"
                value={ruleForm.patternOrCheck}
                onChange={(e) => setRuleForm({ ...ruleForm, patternOrCheck: e.target.value })}
                className="w-full rounded-lg border border-line p-2 text-xs font-mono bg-surface"
              />
              <input
                type="text"
                required
                placeholder="Rule description & guidance"
                value={ruleForm.description}
                onChange={(e) => setRuleForm({ ...ruleForm, description: e.target.value })}
                className="w-full rounded-lg border border-line p-2 text-xs bg-surface"
              />
              <button
                type="submit"
                className="w-full rounded-lg bg-pine py-2 text-xs font-semibold text-white hover:bg-pine-dark"
              >
                Add Compliance Rule
              </button>
            </form>

            <div className="space-y-2">
              {rules.map((r) => (
                <div key={r.id} className="p-3 rounded-lg border border-slate-200 bg-white text-xs flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-800">{r.ruleType}</span>
                      <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 text-[10px]">
                        {r.severity}
                      </span>
                    </div>
                    <p className="font-mono text-slate-600 text-[11px] mt-1">{r.patternOrCheck}</p>
                    <p className="text-slate-400 text-[11px]">{r.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section: Channels */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <Radio className="h-5 w-5 text-teal-600" />
              <h2 className="text-base font-bold text-slate-900">Output Channels &amp; LLM Prompts</h2>
            </div>

            <form onSubmit={submitChannel} className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  required
                  placeholder="CHANNEL_KEY (e.g. BLOG_POST)"
                  value={channelForm.channelKey}
                  onChange={(e) => setChannelForm({ ...channelForm, channelKey: e.target.value.toUpperCase().replace(/\s+/g, '_') })}
                  className="rounded-lg border border-slate-200 p-2 text-xs font-mono bg-white"
                />
                <select
                  value={channelForm.targetAudience}
                  onChange={(e) => setChannelForm({ ...channelForm, targetAudience: e.target.value })}
                  className="rounded-lg border border-slate-200 p-2 text-xs bg-white"
                >
                  <option value="PEER">Peer / RMP</option>
                  <option value="PATIENT">Patient Public</option>
                  <option value="ACADEMIC">Academic / CME</option>
                </select>
              </div>
              <input
                type="text"
                required
                placeholder="Channel Display Name"
                value={channelForm.displayName}
                onChange={(e) => setChannelForm({ ...channelForm, displayName: e.target.value })}
                className="w-full rounded-lg border border-slate-200 p-2 text-xs bg-white"
              />
              <textarea
                rows={3}
                required
                placeholder="System Prompt Instructions for GPT-4o synthesis..."
                value={channelForm.systemPrompt}
                onChange={(e) => setChannelForm({ ...channelForm, systemPrompt: e.target.value })}
                className="w-full rounded-lg border border-slate-200 p-2 text-xs bg-white"
              />
              <button
                type="submit"
                className="w-full rounded-lg bg-teal-600 py-2 text-xs font-semibold text-white hover:bg-teal-700"
              >
                Register Channel Prompt in DB
              </button>
            </form>

            <div className="space-y-2">
              {channels.map((ch) => (
                <div key={ch.id} className="p-3 rounded-lg border border-slate-200 bg-white text-xs">
                  <div className="flex justify-between items-center">
                    <h4 className="font-bold text-slate-800">{ch.displayName}</h4>
                    <span className="font-mono text-[10px] text-slate-400">{ch.channelKey}</span>
                  </div>
                  <p className="text-slate-500 text-[11px] mt-1 line-clamp-2">{ch.systemPrompt}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
