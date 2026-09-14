"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";

export default function GenerateAssetsButton({ caseId }: { caseId: string }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const generate = async () => {
    setLoading(true);
    setMessage(null);
    const response = await fetch(`/api/cases/${caseId}/assets/generate`, { method: "POST" });
    const data = await response.json();
    setLoading(false);
    if (!response.ok) {
      setMessage(data.error || "Unable to generate publishing assets.");
      return;
    }
    setMessage(`${data.assetsGenerated} publishing asset${data.assetsGenerated === 1 ? "" : "s"} generated.`);
    window.location.reload();
  };

  return <div className="flex items-center gap-2"><button type="button" onClick={generate} disabled={loading} className="flex items-center gap-1.5 rounded bg-pine px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}{loading ? "Generating publishing assets…" : "Generate missing publishing assets"}</button>{message && <span className="text-xs text-muted">{message}</span>}</div>;
}