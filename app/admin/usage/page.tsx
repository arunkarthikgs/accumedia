"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, BarChart3, Building2, Clock3, Cpu, DollarSign, FileText, Loader2, Mic, Search, Share2, Sparkles } from "lucide-react";
import type { ComponentType } from "react";

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
  case: { id: string; title: string } | null;
  metadata?: Record<string, unknown> | null;
};

const OPERATION_DETAILS: Record<string, { label: string; description: string; icon: ComponentType<{ className?: string }> }> = {
  speech_to_text: { label: "Speech to text", description: "Converts an uploaded audio recording into a sanitized transcript.", icon: Mic },
  video_speech_to_text: { label: "Video speech to text", description: "Extracts audio from a source video and transcribes it for clinical review.", icon: Mic },
  clinical_refinement: { label: "Clinical refinement", description: "Corrects terminology, punctuation, and formatting without inventing clinical facts.", icon: Sparkles },
  master_record_synthesis: { label: "Master record synthesis", description: "Builds the structured Master Clinical Record and compliance audit from the refined narrative.", icon: FileText },
  seo_keyword_generation: { label: "SEO keyword generation", description: "Creates a separate keyword strategy for search-oriented educational content.", icon: Search },
  channel_asset_generation: { label: "Publishing asset generation", description: "Creates one approved-channel output such as a video script, article, post, or blog.", icon: Share2 },
};

function activityDetail(log: UsageLog) {
  const metadata = log.metadata || {};
  if (log.operation === "channel_asset_generation") {
    const assetName = metadata.channelKey || metadata.outputType;
    return assetName ? `Asset: ${String(assetName).replaceAll("_", " ")}` : "Publishing asset generated";
  }
  if (log.operation === "seo_keyword_generation") return "SEO keyword strategy generated";
  if (log.operation === "clinical_refinement") return "Sanitized clinical narrative refined";
  if (log.operation === "master_record_synthesis") return "Master Clinical Record and compliance audit generated";
  if (log.operation === "speech_to_text" || log.operation === "video_speech_to_text") return `Transcript generated${log.case ? ` for ${log.case.title}` : ""}`;
  return log.case ? `Case: ${log.case.title}` : "System activity";
}

export default function UsagePage() {
  const [organizations, setOrganizations] = useState<{ id: string; name: string }[]>([]);
  const [organizationId, setOrganizationId] = useState("");
  const [operationFilter, setOperationFilter] = useState("ALL");
  const [caseSearch, setCaseSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 50, total: 0, totalPages: 0 });
  const [logs, setLogs] = useState<UsageLog[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/organizations").then((response) => response.json()).then((data) => {
      const orgs = data.organizations || [];
      setOrganizations(orgs);
      if (orgs[0]) setOrganizationId(orgs[0].id);
      else setError("No organization is configured.");
    }).catch(() => setError("Unable to load organizations."));
  }, []);

  useEffect(() => {
    async function loadUsage() {
      if (!organizationId) return;
      try {
        const usageResponse = await fetch(`/api/admin/usage?orgId=${organizationId}&operation=${operationFilter}&caseSearch=${encodeURIComponent(caseSearch)}&from=${fromDate}&to=${toDate}&page=${page}&pageSize=50`);
        const usageData = await usageResponse.json();
        if (!usageResponse.ok) throw new Error(usageData.error || "Unable to load usage.");
        setLogs(usageData.logs || []);
        setSummary(usageData.summary);
        setPagination(usageData.pagination || { page, pageSize: 50, total: 0, totalPages: 0 });
      } catch (loadError: any) {
        setError(loadError.message || "Unable to load usage.");
      } finally {
        setIsLoading(false);
      }
    }
    loadUsage();
  }, [organizationId, operationFilter, caseSearch, fromDate, toDate, page]);

  const totalTokens = (summary?._sum?.inputTokens || 0) + (summary?._sum?.outputTokens || 0);
  const audioSeconds = summary?._sum?.audioSeconds || 0;
  const estimatedCost = Number(summary?._sum?.estimatedCostUsd || 0);

  return (
    <main className="usage-page readable-route ml-0 mr-auto flex max-w-7xl flex-col space-y-6 p-6 md:p-8">
      <header className="contents">
        <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-pine">
          <Link href="/" className="flex items-center gap-1 hover:underline"><ArrowLeft className="h-3 w-3" /> Dashboard</Link>
          <span>/</span><span>AI Usage</span>
        </div>
        <div><h1 className="text-2xl font-bold tracking-tight text-ink">AI Usage &amp; Cost Tracking</h1><p className="mt-0.5 text-xs text-muted">Usage ledger for the selected organization.</p></div>
        <div className="mt-4 flex flex-wrap items-center gap-2"><Building2 className="h-4 w-4 text-muted" /><label className="sr-only" htmlFor="usage-organization">Organization</label><select id="usage-organization" value={organizationId} onChange={(event) => { setIsLoading(true); setPage(1); setOrganizationId(event.target.value); }} className="rounded border border-line bg-surface px-3 py-1.5 text-xs text-ink focus:border-pine focus:outline-none"><option value="" disabled>Select organization</option>{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select><label className="sr-only" htmlFor="usage-case-search">Search case title</label><input id="usage-case-search" value={caseSearch} onChange={(event) => { setPage(1); setCaseSearch(event.target.value); }} placeholder="Search case" className="rounded border border-line bg-surface px-3 py-1.5 text-xs text-ink placeholder:text-muted focus:border-pine focus:outline-none" /><label className="sr-only" htmlFor="usage-operation">AI operation category</label><select id="usage-operation" value={operationFilter} onChange={(event) => { setIsLoading(true); setPage(1); setOperationFilter(event.target.value); }} className="rounded border border-line bg-surface px-3 py-1.5 text-xs text-ink focus:border-pine focus:outline-none"><option value="ALL">All AI operations</option><option value="speech_to_text">Speech to text</option><option value="video_speech_to_text">Video speech to text</option><option value="clinical_refinement">Clinical refinement</option><option value="master_record_synthesis">Master record synthesis</option><option value="seo_keyword_generation">SEO keyword generation</option><option value="channel_asset_generation">Publishing asset generation</option></select><label className="text-xs text-muted">From<input type="date" value={fromDate} onChange={(event) => { setPage(1); setFromDate(event.target.value); }} className="ml-1 rounded border border-line bg-surface px-2 py-1.5 text-xs text-ink" /></label><label className="text-xs text-muted">To<input type="date" value={toDate} onChange={(event) => { setPage(1); setToDate(event.target.value); }} className="ml-1 rounded border border-line bg-surface px-2 py-1.5 text-xs text-ink" /></label></div>
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
            <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-paper text-[10px] uppercase tracking-wide text-muted"><tr><th className="px-5 py-3">Case</th><th className="px-5 py-3">Operation</th><th className="px-5 py-3">Activity</th><th className="px-5 py-3">Provider / model</th><th className="px-5 py-3">Tokens</th><th className="px-5 py-3">Time</th></tr></thead><tbody className="divide-y divide-line">{logs.map((log) => { const detail = OPERATION_DETAILS[log.operation] || { label: log.operation.replaceAll("_", " "), description: "AI operation recorded by the application.", icon: Cpu }; const OperationIcon = detail.icon; return <tr key={log.id}><td className="max-w-xs px-5 py-3 font-medium text-ink">{log.case ? <Link href={`/cases/${log.case.id}/review`} className="hover:text-pine hover:underline">{log.case.title}</Link> : <span className="text-muted">System operation</span>}</td><td className="px-5 py-3 font-medium text-ink"><span className="flex items-center gap-2" title={detail.description}><OperationIcon className="h-3.5 w-3.5 text-pine" aria-label={detail.description} />{detail.label}</span></td><td className="max-w-sm px-5 py-3 text-muted">{activityDetail(log)}</td><td className="px-5 py-3 text-muted">{log.provider} · {log.model}</td><td className="px-5 py-3 text-muted">{((log.inputTokens || 0) + (log.outputTokens || 0)).toLocaleString()}</td><td className="px-5 py-3 text-muted">{new Date(log.createdAt).toLocaleString()}</td></tr>; })}{logs.length === 0 && <tr><td colSpan={6} className="px-5 py-10 text-center text-muted">No AI usage recorded yet.</td></tr>}</tbody></table></div>
          </section>
        </>
      )}
    </main>
  );
}
