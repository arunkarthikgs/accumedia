"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";

export default function GenerateAssetsButton({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  const generate = async () => {
    setLoading(true);
    setMessage(null);
    setIsError(false);
    setMessage("Checking your monthly publishing asset quota…");
    try {
      const response = await fetch(`/api/cases/${caseId}/assets/generate`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) {
        setIsError(true);
        setMessage(data.error || "Unable to generate publishing assets.");
        return;
      }
      setMessage(`${data.assetsGenerated} publishing asset${data.assetsGenerated === 1 ? "" : "s"} generated.`);
      router.refresh();
    } catch (error: any) {
      setIsError(true);
      setMessage(error.message || "Unable to connect to the publishing asset service.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={generate}
        disabled={loading}
        className="flex items-center gap-1.5 rounded bg-pine px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
        {loading ? "Generating publishing assets…" : "Generate missing publishing assets"}
      </button>
      {message && (
        <div
          role={isError ? "alert" : "status"}
          className={`max-w-md rounded border px-3 py-2 text-xs font-medium ${isError ? "border-brick/30 bg-brick-tint text-brick" : "border-sage/30 bg-sage-tint text-sage"}`}
        >
          {message}
        </div>
      )}
    </div>
  );
}