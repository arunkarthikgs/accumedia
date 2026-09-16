"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, CalendarClock, CheckCircle2, CircleAlert, Loader2, Save, Send, XCircle } from "lucide-react";

type Job = {
  id: string;
  platform: string;
  status: string;
  scheduledAt: string | null;
  publishedAt: string | null;
  failureReason: string | null;
  attemptCount: number;
  createdAt: string;
  case: { id: string; title: string };
  asset: { id: string; channelName: string; status: string };
};

const STATUS_STYLES: Record<string, string> = {
  QUEUED: "bg-ochre-tint text-ochre",
  PUBLISHED: "bg-sage-tint text-sage",
  FAILED: "bg-brick-tint text-brick",
  CANCELLED: "bg-slate-100 text-muted",
};

export default function PublishingPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [status, setStatus] = useState("ALL");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [organizations, setOrganizations] = useState<{ id: string; name: string }[]>([]);
  const [organizationId, setOrganizationId] = useState("");
  const [connections, setConnections] = useState<any[]>([]);
  const [platform, setPlatform] = useState("linkedin");
  const [accountLabel, setAccountLabel] = useState("");
  const [externalAccountId, setExternalAccountId] = useState("");
  const [secret, setSecret] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [connectionMessage, setConnectionMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadOrganization() {
      try {
        const organizationsResponse = await fetch("/api/admin/organizations");
        const organizationsData = await organizationsResponse.json();
        setOrganizations(organizationsData.organizations || []);
        const firstOrganization = organizationsData.organizations?.[0];
        if (firstOrganization) setOrganizationId(firstOrganization.id);
      } catch (loadError: any) {
        setError(loadError.message || "Unable to load organizations.");
      }
    }
    loadOrganization();
  }, []);

  useEffect(() => {
    if (!organizationId) return;
    async function loadJobs() {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/admin/publishing?orgId=${encodeURIComponent(organizationId)}&status=${status}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load publishing jobs.");
        setJobs(data.jobs || []);
      } catch (loadError: any) {
        setError(loadError.message || "Unable to load publishing jobs.");
      } finally {
        setIsLoading(false);
      }
    }
    loadJobs();
  }, [status, organizationId]);

  useEffect(() => {
    if (!organizationId) return;
    fetch(`/api/admin/publishing/connections?orgId=${organizationId}`).then((response) => response.json()).then((data) => setConnections(data.connections || [])).catch(() => undefined);
  }, [organizationId]);

  const saveConnection = async () => {
    setConnectionMessage(null);
    const body: Record<string, string> = { organizationId, platform, accountLabel, externalAccountId };
    if (platform === "cms") body.webhookUrl = secret;
    else body.accessToken = secret;
    const response = await fetch("/api/admin/publishing/connections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) return setConnectionMessage(data.error || "Unable to save connection.");
    setConnections((current) => [...current.filter((item) => item.id !== data.connection.id), data.connection]);
    setSecret("");
    setConnectionMessage("Connection saved securely.");
  };

  const processJobs = async () => {
    setIsProcessing(true);
    const response = await fetch("/api/admin/publishing/process", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId }) });
    const data = await response.json();
    setIsProcessing(false);
    if (!response.ok) setError(data.error || "Unable to process publishing jobs.");
    else window.location.reload();
  };

  const updateJob = async (jobId: string, action: "cancel" | "retry") => {
    const response = await fetch(`/api/admin/publishing/${jobId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    const data = await response.json();
    if (!response.ok) return setError(data.error || "Unable to update publishing job.");
    setJobs((current) => current.map((job) => job.id === jobId ? { ...job, ...data.job } : job));
  };

  const revokeConnection = async (connectionId: string) => {
    const response = await fetch("/api/admin/publishing/connections", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ connectionId }) });
    const data = await response.json();
    if (!response.ok) return setConnectionMessage(data.error || "Unable to revoke connection.");
    setConnections((current) => current.filter((connection) => connection.id !== connectionId));
  };

  return (
    <main className="readable-route ml-0 mr-auto max-w-5xl space-y-6 p-6 md:p-8">
      <header>
        <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-pine"><Link href="/" className="flex items-center gap-1 hover:underline"><ArrowLeft className="h-3 w-3" /> Dashboard</Link><span>/</span><span>Publishing</span></div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-2xl font-bold tracking-tight text-ink">Publishing Jobs</h1><p className="mt-1 text-xs text-muted">Queued and scheduled distribution work across connected platforms.</p></div><div className="flex gap-2"><select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink"><option value="ALL">All statuses</option><option value="QUEUED">Queued</option><option value="PUBLISHED">Published</option><option value="FAILED">Failed</option><option value="CANCELLED">Cancelled</option></select><button onClick={processJobs} disabled={!organizationId || isProcessing} className="flex items-center gap-1 rounded-lg bg-pine px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"><Send className="h-3.5 w-3.5" />{isProcessing ? "Processing…" : "Run due jobs"}</button></div></div>
      </header>

      <section className="flex items-center justify-between rounded-lg border border-line bg-surface px-4 py-3"><div><p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Hospital scope</p><p className="mt-1 text-xs text-muted">Publishing jobs and connections for the selected hospital.</p></div><select value={organizationId} onChange={(event) => setOrganizationId(event.target.value)} disabled={organizations.length <= 1} className="min-w-56 rounded border border-line bg-paper px-3 py-2 text-xs text-ink disabled:cursor-not-allowed disabled:opacity-70"><option value="" disabled>Select hospital</option>{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select></section>

      {error && <div className="rounded-lg border border-brick/30 bg-brick-tint p-3 text-sm text-brick">{error}</div>}
      <section className="rounded-lg border border-line bg-surface p-5"><div className="flex items-center justify-between"><div><h2 className="text-sm font-bold text-ink">Platform connections</h2><p className="mt-1 text-xs text-muted">OAuth credentials are encrypted before storage and refreshed automatically where supported.</p></div></div><div className="mt-4 flex flex-wrap gap-2">{connections.map((connection) => <span key={connection.id} className="inline-flex items-center gap-2 rounded border border-sage/30 bg-sage-tint px-2 py-1 text-[11px] font-semibold text-sage">{connection.platform}{connection.accountLabel ? ` · ${connection.accountLabel}` : ""} · connected<button onClick={() => revokeConnection(connection.id)} className="font-bold text-brick hover:underline">Revoke</button></span>)}{connections.length === 0 && <span className="text-xs text-muted">No active connections.</span>}</div><div className="mt-4 flex flex-wrap gap-2">{["linkedin", "facebook", "instagram", "x", "youtube"].map((provider) => <a key={provider} href={organizationId ? `/api/publishing/connect/${provider}?orgId=${organizationId}` : "#"} className="rounded border border-line bg-paper px-3 py-2 text-xs font-semibold capitalize text-ink hover:border-pine">Connect {provider}</a>)}</div><div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-5"><select value={platform} onChange={(event) => setPlatform(event.target.value)} className="rounded border border-line bg-paper px-2 py-2 text-xs"><option value="cms">CMS webhook</option><option value="linkedin">LinkedIn token</option><option value="facebook">Facebook token</option><option value="instagram">Instagram token</option><option value="x">X token</option><option value="youtube">YouTube token</option></select><input value={accountLabel} onChange={(event) => setAccountLabel(event.target.value)} placeholder="Account label" className="rounded border border-line bg-paper px-2 py-2 text-xs" /><input value={externalAccountId} onChange={(event) => setExternalAccountId(event.target.value)} placeholder="Account / page ID" className="rounded border border-line bg-paper px-2 py-2 text-xs" /><input type="password" value={secret} onChange={(event) => setSecret(event.target.value)} placeholder={platform === "cms" ? "Webhook URL" : "Access token"} className="rounded border border-line bg-paper px-2 py-2 text-xs" /><button onClick={saveConnection} disabled={!organizationId || !secret} className="flex items-center justify-center gap-1 rounded bg-pine px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"><Save className="h-3.5 w-3.5" />{platform === "cms" ? "Save webhook" : "Save token"}</button></div>{connectionMessage && <p className="mt-3 text-xs text-muted">{connectionMessage}</p>}</section>
      <section className="overflow-hidden rounded-lg border border-line bg-surface">
        {isLoading ? <div className="p-12 text-center text-sm text-muted"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-pine" />Loading publishing jobs…</div> : <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-paper text-[10px] uppercase tracking-wide text-muted"><tr><th className="px-5 py-3">Platform</th><th className="px-5 py-3">Case</th><th className="px-5 py-3">Asset</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Schedule</th><th className="px-5 py-3">Attempts</th><th className="px-5 py-3">Actions</th></tr></thead><tbody className="divide-y divide-line">{jobs.map((job) => <tr key={job.id}><td className="px-5 py-4 font-semibold capitalize text-ink">{job.platform}</td><td className="px-5 py-4 text-ink">{job.case.title}</td><td className="px-5 py-4 text-muted">{job.asset.channelName}</td><td className="px-5 py-4"><span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold ${STATUS_STYLES[job.status] || "bg-slate-100 text-muted"}`}>{job.status === "PUBLISHED" ? <CheckCircle2 className="h-3 w-3" /> : job.status === "FAILED" ? <XCircle className="h-3 w-3" /> : job.status === "QUEUED" ? <CalendarClock className="h-3 w-3" /> : <CircleAlert className="h-3 w-3" />}{job.status}</span></td><td className="px-5 py-4 text-muted">{job.scheduledAt ? new Date(job.scheduledAt).toLocaleString() : "Immediate"}</td><td className="px-5 py-4 text-muted">{job.attemptCount ?? 0}</td><td className="px-5 py-4">{job.status === "FAILED" && <button onClick={() => updateJob(job.id, "retry")} className="mr-2 font-semibold text-pine hover:underline">Retry</button>}{["QUEUED", "PROCESSING"].includes(job.status) && <button onClick={() => updateJob(job.id, "cancel")} className="font-semibold text-brick hover:underline">Cancel</button>}</td></tr>)}{jobs.length === 0 && <tr><td colSpan={7} className="px-5 py-12"><div className="mx-auto max-w-md text-center"><p className="font-semibold text-ink">No publishing jobs yet</p><p className="mt-2 text-muted">Jobs appear after you approve an individual generated asset, choose a platform, and click Queue publication in Publishing Studio.</p><Link href="/admin/cases" className="mt-4 inline-flex rounded bg-pine px-3 py-2 text-xs font-semibold text-white">Open Case Management</Link></div></td></tr>}</tbody></table></div>}
      </section>
    </main>
  );
}
