"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, CalendarClock, CheckCircle2, CircleAlert, Loader2, Send, XCircle } from "lucide-react";

type Job = {
  id: string;
  platform: string;
  status: string;
  scheduledAt: string | null;
  publishedAt: string | null;
  failureReason: string | null;
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

  useEffect(() => {
    async function loadJobs() {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/admin/publishing?status=${status}`);
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
  }, [status]);

  return (
    <main className="readable-route ml-0 mr-auto max-w-5xl space-y-6 p-6 md:p-8">
      <header>
        <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-pine"><Link href="/" className="flex items-center gap-1 hover:underline"><ArrowLeft className="h-3 w-3" /> Dashboard</Link><span>/</span><span>Publishing</span></div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-2xl font-bold tracking-tight text-ink">Publishing Jobs</h1><p className="mt-1 text-xs text-muted">Queued and scheduled distribution work across connected platforms.</p></div><select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink"><option value="ALL">All statuses</option><option value="QUEUED">Queued</option><option value="PUBLISHED">Published</option><option value="FAILED">Failed</option><option value="CANCELLED">Cancelled</option></select></div>
      </header>

      {error && <div className="rounded-lg border border-brick/30 bg-brick-tint p-3 text-sm text-brick">{error}</div>}
      <section className="overflow-hidden rounded-lg border border-line bg-surface">
        {isLoading ? <div className="p-12 text-center text-sm text-muted"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-pine" />Loading publishing jobs…</div> : <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-paper text-[10px] uppercase tracking-wide text-muted"><tr><th className="px-5 py-3">Platform</th><th className="px-5 py-3">Case</th><th className="px-5 py-3">Asset</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Schedule</th><th className="px-5 py-3">Connector</th></tr></thead><tbody className="divide-y divide-line">{jobs.map((job) => <tr key={job.id}><td className="px-5 py-4 font-semibold capitalize text-ink">{job.platform}</td><td className="px-5 py-4 text-ink">{job.case.title}</td><td className="px-5 py-4 text-muted">{job.asset.channelName}</td><td className="px-5 py-4"><span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold ${STATUS_STYLES[job.status] || "bg-slate-100 text-muted"}`}>{job.status === "PUBLISHED" ? <CheckCircle2 className="h-3 w-3" /> : job.status === "FAILED" ? <XCircle className="h-3 w-3" /> : job.status === "QUEUED" ? <CalendarClock className="h-3 w-3" /> : <CircleAlert className="h-3 w-3" />}{job.status}</span></td><td className="px-5 py-4 text-muted">{job.scheduledAt ? new Date(job.scheduledAt).toLocaleString() : "Immediate"}</td><td className="px-5 py-4 text-ochre"><Send className="mr-1 inline h-3.5 w-3.5" />Not configured</td></tr>)}{jobs.length === 0 && <tr><td colSpan={6} className="px-5 py-12 text-center text-muted">No publishing jobs yet.</td></tr>}</tbody></table></div>}
      </section>
    </main>
  );
}
