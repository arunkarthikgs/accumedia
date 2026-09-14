"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, FileText, History, Loader2, Pencil, ShieldAlert, XCircle } from "lucide-react";
import ImagesPanel from "@/components/ImagesPanel";

type ReviewCase = {
  id: string;
  title: string;
  status: string;
  mccrApprovedAt: string | null;
  rawInput: string;
  masterRecord: Record<string, unknown>;
  safetyAudit: Record<string, unknown>;
  physician: { name: string; specialty: string | null };
  organization: { name: string };
  recordings: { rawTranscript: string | null; transcribedText: string | null; transcriptionAgent: string | null }[];
  safetyFlags: { id: string; flagType: string; detail: string; confidence: string }[];
  assets: { id: string; channelName: string; status: string; content: unknown; validationWarnings: string[] | null }[];
  sources?: { id: string; fileName: string; sourceType: string; status: string; processingError: string | null }[];
};

export default function CaseReviewPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [reviewCase, setReviewCase] = useState<ReviewCase | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isActing, setIsActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEditingRecord, setIsEditingRecord] = useState(false);
  const [recordDraft, setRecordDraft] = useState("");
  const [versions, setVersions] = useState<{ id: string; version: number; changeType: string; createdAt: string; masterRecord: Record<string, unknown> }[]>([]);
  const [auditEvents, setAuditEvents] = useState<{ id: string; action: string; detail: string | null; createdAt: string; actor: { name: string } | null }[]>([]);

  useEffect(() => {
    async function loadCase() {
      try {
        const response = await fetch("/api/admin/cases?status=ALL");
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load case.");
        const found = data.cases?.find((item: ReviewCase) => item.id === params.id);
        if (!found) throw new Error("Case not found.");
        setReviewCase(found);
        setRecordDraft(JSON.stringify(found.masterRecord, null, 2));
        const versionsResponse = await fetch(`/api/cases/${params.id}/versions`);
        const versionsData = await versionsResponse.json();
        if (versionsResponse.ok) setVersions(versionsData.versions || []);
        const auditResponse = await fetch(`/api/cases/${params.id}/audit`);
        const auditData = await auditResponse.json();
        if (auditResponse.ok) setAuditEvents(auditData.events || []);
      } catch (requestError: any) {
        setError(requestError.message || "Unable to load case.");
      } finally {
        setIsLoading(false);
      }
    }
    loadCase();
  }, [params.id]);

  const saveRecord = async () => {
    try {
      const masterRecord = JSON.parse(recordDraft);
      const response = await fetch(`/api/cases/${params.id}/versions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "manual_edit", masterRecord }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to save the clinical record.");
      setReviewCase((current) => current ? { ...current, masterRecord: data.case.masterRecord, status: data.case.status } : current);
      setIsEditingRecord(false);
      const historyResponse = await fetch(`/api/cases/${params.id}/versions`);
      const historyData = await historyResponse.json();
      if (historyResponse.ok) setVersions(historyData.versions || []);
      const auditResponse = await fetch(`/api/cases/${params.id}/audit`);
      const auditData = await auditResponse.json();
      if (auditResponse.ok) setAuditEvents(auditData.events || []);
    } catch (actionError: any) {
      setError(actionError.message || "Unable to save the clinical record.");
    }
  };

  const restoreVersion = async (versionId: string) => {
    if (!window.confirm("Restore this version? The current record will be preserved in version history.")) return;
    const response = await fetch(`/api/cases/${params.id}/versions`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "restore", versionId }),
    });
    const data = await response.json();
    if (!response.ok) { setError(data.error || "Unable to restore version."); return; }
    setReviewCase((current) => current ? { ...current, masterRecord: data.case.masterRecord, status: data.case.status } : current);
    setRecordDraft(JSON.stringify(data.case.masterRecord, null, 2));
    setError(null);
    const historyResponse = await fetch(`/api/cases/${params.id}/versions`);
    const historyData = await historyResponse.json();
    if (historyResponse.ok) setVersions(historyData.versions || []);
    const auditResponse = await fetch(`/api/cases/${params.id}/audit`);
    const auditData = await auditResponse.json();
    if (auditResponse.ok) setAuditEvents(auditData.events || []);
  };

  const approveCase = async () => {
    setIsActing(true);
    setError(null);
    try {
      const response = await fetch(`/api/cases/${params.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvedBy: "Attending physician" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Approval failed.");
      router.push("/admin/cases");
    } catch (actionError: any) {
      setError(actionError.message || "Approval failed.");
    } finally {
      setIsActing(false);
    }
  };

  const rejectCase = async () => {
    const reason = window.prompt("Enter the reason for rejecting this case:");
    if (!reason?.trim()) return;
    setIsActing(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/cases", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId: params.id, status: "REJECTED", rejectionReason: reason.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Rejection failed.");
      router.push("/admin/cases");
    } catch (actionError: any) {
      setError(actionError.message || "Rejection failed.");
    } finally {
      setIsActing(false);
    }
  };

  if (isLoading) return <main className="p-8 text-sm text-muted">Loading case review…</main>;
  if (!reviewCase) return <main className="p-8 text-sm text-brick">{error || "Case not found."}</main>;

  const recording = reviewCase.recordings[0];
  const narrative = recording?.transcribedText || recording?.rawTranscript || reviewCase.rawInput;
  const openFlags = reviewCase.safetyFlags || [];

  return (
    <main className="readable-route ml-0 mr-auto max-w-5xl space-y-6 p-6 md:p-8">
      <header>
        <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-pine">
          <Link href="/admin/cases" className="flex items-center gap-1 hover:underline"><ArrowLeft className="h-3 w-3" /> Case Management</Link>
          <span>/</span><span>Review</span>
        </div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-ink">{reviewCase.title}</h1>
            <p className="mt-1 text-xs text-muted">{reviewCase.organization.name} · {reviewCase.physician.name} · {reviewCase.physician.specialty || "General Medicine"}</p>
          </div>
          <div className="flex gap-2">
            <button disabled={isActing} onClick={rejectCase} className="flex items-center gap-1.5 rounded-lg border border-brick/30 bg-brick-tint px-3 py-2 text-xs font-semibold text-brick disabled:opacity-50"><XCircle className="h-3.5 w-3.5" /> Reject</button>
            <button disabled={isActing || openFlags.length > 0 || reviewCase.status === "APPROVED"} onClick={approveCase} className="flex items-center gap-1.5 rounded-lg bg-pine px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{isActing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}{reviewCase.status === "APPROVED" ? "Approved" : "Approve case"}</button>
          </div>
        </div>
      </header>

      {error && <div className="rounded-lg border border-brick/30 bg-brick-tint p-3 text-sm text-brick">{error}</div>}
      {openFlags.length > 0 && <section className="rounded-lg border border-ochre/40 bg-ochre-tint p-5"><h2 className="flex items-center gap-2 text-sm font-bold text-ochre"><ShieldAlert className="h-4 w-4" /> Safety review required</h2><p className="mt-1 text-xs text-ochre">Resolve all open flags in the Safety Queue before approval.</p><div className="mt-3 space-y-2">{openFlags.map((flag) => <div key={flag.id} className="rounded border border-ochre/30 bg-surface p-3 text-xs text-ink"><strong>{flag.flagType}</strong> · {flag.detail}</div>)}</div><Link href={`/admin/safety-queue?caseId=${reviewCase.id}`} className="mt-3 inline-flex text-xs font-semibold text-ochre underline">Open Safety Queue</Link></section>}

      <section className="rounded-lg border border-line bg-surface p-5"><h2 className="flex items-center gap-2 text-sm font-bold text-ink"><FileText className="h-4 w-4 text-pine" /> Clinician-reviewed narrative</h2><p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-ink">{narrative || "No narrative available."}</p>{recording?.transcriptionAgent && <p className="mt-4 text-[11px] font-mono text-muted">Transcribed by {recording.transcriptionAgent}</p>}</section>
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2"><div className="rounded-lg border border-line bg-surface p-5"><div className="flex items-center justify-between"><h2 className="text-sm font-bold text-ink">Master Clinical Record</h2>{!isEditingRecord && <button onClick={() => setIsEditingRecord(true)} className="flex items-center gap-1 rounded border border-line px-2 py-1 text-[11px] font-semibold text-ink hover:border-pine"><Pencil className="h-3 w-3" /> Edit</button>}</div>{isEditingRecord ? <><textarea value={recordDraft} onChange={(event) => setRecordDraft(event.target.value)} className="mt-3 h-72 w-full rounded border border-line bg-paper p-3 font-mono text-xs leading-6 text-ink focus:border-pine focus:outline-none" /><div className="mt-2 flex gap-2"><button onClick={saveRecord} className="rounded bg-pine px-3 py-1.5 text-xs font-semibold text-white">Save record</button><button onClick={() => { setIsEditingRecord(false); setRecordDraft(JSON.stringify(reviewCase.masterRecord, null, 2)); }} className="rounded border border-line px-3 py-1.5 text-xs font-semibold text-ink">Cancel</button></div></> : <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap text-xs leading-6 text-muted">{JSON.stringify(reviewCase.masterRecord, null, 2)}</pre>}</div><div className="rounded-lg border border-line bg-surface p-5"><h2 className="text-sm font-bold text-ink">Compliance audit</h2><pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap text-xs leading-6 text-muted">{JSON.stringify(reviewCase.safetyAudit, null, 2)}</pre></div></section>
      <section className="rounded-lg border border-line bg-surface p-5"><h2 className="flex items-center gap-2 text-sm font-bold text-ink"><History className="h-4 w-4 text-pine" /> Version history</h2>{versions.length === 0 ? <p className="mt-2 text-xs text-muted">No saved versions yet.</p> : <div className="mt-3 space-y-2">{versions.map((version) => <div key={version.id} className="flex items-center justify-between border-b border-line py-2 text-xs"><span><strong className="text-ink">v{version.version}</strong> · {version.changeType} · {new Date(version.createdAt).toLocaleString()}</span><button onClick={() => restoreVersion(version.id)} className="rounded border border-line px-2 py-1 font-semibold text-ink hover:border-pine">Restore</button></div>)}</div>}</section>
      <section className="rounded-lg border border-line bg-surface p-5"><h2 className="text-sm font-bold text-ink">Immutable audit trail</h2>{auditEvents.length === 0 ? <p className="mt-2 text-xs text-muted">No review events recorded yet.</p> : <div className="mt-3 space-y-2">{auditEvents.map((event) => <div key={event.id} className="border-b border-line py-2 text-xs"><div className="flex justify-between gap-3"><strong className="text-ink">{event.action}</strong><span className="text-muted">{new Date(event.createdAt).toLocaleString()}</span></div><p className="mt-1 text-muted">{event.detail || "Recorded governance event"}{event.actor ? ` · ${event.actor.name}` : " · System"}</p></div>)}</div>}</section>
      <section className="rounded-lg border border-line bg-surface p-5"><h2 className="text-sm font-bold text-ink">Source and publication review</h2><div className="mt-3 space-y-2 text-xs">{(reviewCase.sources || []).map((source) => <div key={source.id} className="flex items-center justify-between border-b border-line py-2"><span className="text-ink">{source.fileName} <span className="text-muted">({source.sourceType})</span></span><span className={source.status === "READY" ? "text-sage" : source.status === "FAILED" ? "text-brick" : "text-ochre"}>{source.status}{source.processingError ? ` · ${source.processingError}` : ""}</span></div>)}<Link href={`/cases/${reviewCase.id}/assets`} className="mt-3 inline-flex rounded bg-pine px-3 py-1.5 font-semibold text-white">Review assets and images</Link></div></section>
      <ImagesPanel caseId={reviewCase.id} mccrApproved={Boolean(reviewCase.mccrApprovedAt)} />
      <section className="rounded-lg border border-line bg-surface p-5"><h2 className="text-sm font-bold text-ink">Generated assets</h2><p className="mt-1 text-xs text-muted">{reviewCase.assets.length} assets currently attached to this case.</p><div className="mt-3 space-y-2">{reviewCase.assets.map((asset) => <div key={asset.id} className="flex items-center justify-between rounded border border-line bg-paper px-3 py-2 text-xs"><span className="font-medium text-ink">{asset.channelName}</span><span className={asset.status === "REVIEW" ? "text-ochre" : "text-muted"}>{asset.status}{asset.validationWarnings?.length ? ` · ${asset.validationWarnings.length} validation warning(s)` : ""}</span></div>)}</div></section>
    </main>
  );
}
