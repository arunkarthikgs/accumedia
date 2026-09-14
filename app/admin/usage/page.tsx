"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, BarChart3, Clock3, Cpu, DollarSign, Loader2 } from "lucide-react";

type UsageLog = {
  id: string;
  operation: string;
  provider: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  audioSeconds: number | null;
  estimatedCostUsd: string | number | null;
  createdAt: string;
};

export default function UsagePage() {
  const [organizationId, setOrganizationId] = useState("");
  const [logs, setLogs] = useState<UsageLog[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadUsage() {
      try {
        const organizationsResponse = await fetch("/api/admin/organizations");
        const organizationsData = await organizationsResponse.json();
        const firstOrganization = organizationsData.organizations?.[0];
        if (!firstOrganization) throw new Error("No organization is configured.");
        setOrganizationId(firstOrganization.id);

        const usageResponse = await fetch(`/api/admin/usage?orgId=${firstOrganization.id}`);
        const usageData = await usageResponse.json();
        if (!usageResponse.ok) throw new Error(usageData.error || "Unable to load usage.");
        setLogs(usageData.logs || []);
        setSummary(usageData.summary);
      } catch (loadError: any) {
        setError(loadError.message || "Unable to load usage.");
      } finally {
        setIsLoading(false);
      }
    }
    loadUsage();
  }, []);

  const totalTokens = (summary?._sum?.inputTokens || 0) + (summary?._sum?.outputTokens || 0);
  const audioSeconds = summary?._sum?.audioSeconds || 0;
  const estimatedCost = Number(summary?._sum?.estimatedCostUsd || 0);

  return (
    <main className="readable-route ml-0 mr-auto max-w-5xl space-y-6 p-6 md:p-8">
      <header>
        <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-pine">
          <Link href="/" className="flex items-center gap-1 hover:underline"><ArrowLeft className="h-3 w-3" /> Dashboard</Link>
          <span>/</span><span>AI Usage</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">AI Usage &amp; Cost Tracking</h1>
        <p className="mt-0.5 text-xs text-muted">Usage ledger for {organizationId ? "the active organization" : "your organization"}.</p>
      </header>

      {error && <div className="rounded-lg border border-brick/30 bg-brick-tint p-3 text-sm text-brick">{error}</div>}
      {isLoading ? <div className="rounded-lg border border-line bg-surface p-12 text-center text-sm text-muted"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-pine" />Loading usage…</div> : (
        <>
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-line bg-surface p-4"><Cpu className="h-4 w-4 text-pine" /><p className="mt-3 text-2xl font-bold text-ink">{summary?._count?._all || 0}</p><p className="text-xs text-muted">AI calls</p></div>
            <div className="rounded-lg border border-line bg-surface p-4"><BarChart3 className="h-4 w-4 text-pine" /><p className="mt-3 text-2xl font-bold text-ink">{totalTokens.toLocaleString()}</p><p className="text-xs text-muted">Tokens recorded</p></div>
            <div className="rounded-lg border border-line bg-surface p-4"><Clock3 className="h-4 w-4 text-pine" /><p className="mt-3 text-2xl font-bold text-ink">{Math.round(audioSeconds / 60)}m</p><p className="text-xs text-muted">Audio processed</p></div>
            <div className="rounded-lg border border-line bg-surface p-4"><DollarSign className="h-4 w-4 text-pine" /><p className="mt-3 text-2xl font-bold text-ink">${estimatedCost.toFixed(4)}</p><p className="text-xs text-muted">Estimated cost</p></div>
          </section>

          <section className="overflow-hidden rounded-lg border border-line bg-surface">
            <div className="border-b border-line px-5 py-4"><h2 className="text-sm font-bold text-ink">Recent AI calls</h2></div>
            <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-paper text-[10px] uppercase tracking-wide text-muted"><tr><th className="px-5 py-3">Operation</th><th className="px-5 py-3">Provider / model</th><th className="px-5 py-3">Tokens</th><th className="px-5 py-3">Time</th></tr></thead><tbody className="divide-y divide-line">{logs.map((log) => <tr key={log.id}><td className="px-5 py-3 font-medium text-ink">{log.operation}</td><td className="px-5 py-3 text-muted">{log.provider} · {log.model}</td><td className="px-5 py-3 text-muted">{((log.inputTokens || 0) + (log.outputTokens || 0)).toLocaleString()}</td><td className="px-5 py-3 text-muted">{new Date(log.createdAt).toLocaleString()}</td></tr>)}{logs.length === 0 && <tr><td colSpan={4} className="px-5 py-10 text-center text-muted">No AI usage recorded yet.</td></tr>}</tbody></table></div>
          </section>
        </>
      )}
    </main>
  );
}
