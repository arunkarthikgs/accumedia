"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Scissors,
  Building2,
  RefreshCw,
} from "lucide-react";
import StatusTag from "@/components/ui/StatusTag";
import { fetchJsonOnce } from "@/lib/client-fetch";

interface Flag {
  id: string;
  flagType: string;
  detail: string;
  confidence: string;
  status: string;
  createdAt: string;
  case: {
    id: string;
    title: string;
    organizationId: string;
    organizationName?: string | null;
    physician?: { name: string } | null;
  } | null;
  imageAsset?: { id: string; channel: string; sourceType: string; phiReviewStatus: string; safetyFindings?: unknown } | null;
}

interface Organization {
  id: string;
  name: string;
}

const CONFIDENCE_TONE: Record<string, "brick" | "ochre" | "muted"> = {
  high: "brick",
  medium: "ochre",
  low: "muted",
};

type ImageSafetyFinding = {
  type?: string;
  detail?: string;
  confidence?: string;
};

function imageSafetyFindings(value: unknown): ImageSafetyFinding[] {
  if (!value || typeof value !== "object") return [];
  const findings = (value as { findings?: unknown }).findings;
  return Array.isArray(findings)
    ? findings.filter((finding): finding is ImageSafetyFinding => Boolean(finding) && typeof finding === "object")
    : [];
}

export default function SafetyQueuePage() {
  const [flags, setFlags] = useState<Flag[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState("ALL");
  const [isLoading, setIsLoading] = useState(true);
  const [actingOnId, setActingOnId] = useState<string | null>(null);
  const [viewingFlag, setViewingFlag] = useState<Flag | null>(null);
  const [refinedText, setRefinedText] = useState<string | null>(null);
  const [isLoadingRefinedText, setIsLoadingRefinedText] = useState(false);

  const loadFlags = async (force = false) => {
    const caseId = new URLSearchParams(window.location.search).get("caseId");
    const cacheKey = `macula:safety-queue:${selectedOrgId}:${caseId || "all"}`;
    let servedCache = false;
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as { flags: Flag[]; organizations?: Organization[]; cachedAt: number };
        if (!force && Date.now() - parsed.cachedAt < 30_000) {
          setFlags(parsed.flags || []);
          setOrganizations(parsed.organizations || []);
          servedCache = true;
        }
      }
    } catch {
      // Ignore unavailable or invalid browser cache.
    }
    setIsLoading(!servedCache);
    if (servedCache && !force) return;
    try {
      const url = `/api/safety-flags?status=OPEN${selectedOrgId !== "ALL" ? `&orgId=${selectedOrgId}` : ""}${caseId ? `&caseId=${caseId}` : ""}`;
      const data = await fetchJsonOnce<{ flags: Flag[]; organizations: Organization[] }>(url);
      setFlags(data.flags || []);
      setOrganizations(data.organizations || []);
      try { sessionStorage.setItem(cacheKey, JSON.stringify({ flags: data.flags || [], organizations: data.organizations || [], cachedAt: Date.now() })); } catch { /* Ignore storage limits. */ }
    } catch (err) {
      console.error("Failed to load safety flags:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadFlags();
  }, [selectedOrgId]);

  const safetySummary = useMemo(() => {
    const byType = new Map<string, number>();
    const caseIds = new Set<string>();
    let highConfidence = 0;

    for (const flag of flags) {
      byType.set(flag.flagType, (byType.get(flag.flagType) || 0) + 1);
      if (flag.case?.id) caseIds.add(flag.case.id);
      if (flag.confidence === "high") highConfidence += 1;
    }

    return {
      affectedCases: caseIds.size,
      highConfidence,
      byType: Array.from(byType.entries()).sort(([, countA], [, countB]) => countB - countA),
    };
  }, [flags]);

  const resolve = async (flagId: string, decision: "REVIEWED_OK" | "REVIEWED_REDACTED" | "REJECTED") => {
    setActingOnId(flagId);
    try {
      const res = await fetch("/api/safety-flags", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flagId, decision, reviewedBy: "Compliance Officer" }),
      });
      if (res.ok) {
        setFlags((prev) => prev.filter((f) => f.id !== flagId));
      }
    } catch (err) {
      console.error("Failed to resolve flag:", err);
    } finally {
      setActingOnId(null);
    }
  };

  const viewRefinedText = async (flag: Flag) => {
    setViewingFlag(flag);
    setRefinedText(null);
    setIsLoadingRefinedText(true);
    try {
      const response = await fetch(`/api/safety-flags?flagId=${encodeURIComponent(flag.id)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load refined text.");
      setRefinedText(data.flags?.[0]?.case?.recordings?.[0]?.transcribedText || "No refined text is available for this safety finding.");
    } catch (error: any) {
      setRefinedText(error.message || "Unable to load refined text.");
    } finally {
      setIsLoadingRefinedText(false);
    }
  };

  return (
    <div className="readable-route min-h-screen bg-paper text-ink">
      <header className="border-b border-line bg-surface px-8 py-5">
        <div className="ml-0 mr-auto max-w-5xl">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-pine">
                <Link href="/" className="flex items-center gap-1 hover:underline">
                  <ArrowLeft className="h-3 w-3" /> Dashboard
                </Link>
                <span>/</span>
                <span>Safety Queue</span>
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-ink">Safety Review Queue</h1>
              <p className="mt-0.5 text-xs text-muted">Flagged content is never silently altered or published — every item needs an explicit decision.</p>
            </div>
            <button
              onClick={() => loadFlags(true)}
              className="flex items-center gap-1.5 self-start rounded-lg border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink hover:border-pine transition sm:self-auto"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </button>
          </div>
        </div>
      </header>

      <main className="ml-0 mr-auto max-w-5xl p-8 space-y-5">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted" />
          <select
            value={selectedOrgId}
            onChange={(e) => setSelectedOrgId(e.target.value)}
            className="rounded border border-line bg-surface px-3 py-1.5 text-xs text-ink focus:border-pine focus:outline-none"
          >
            <option value="ALL">All organizations</option>
            {organizations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>

        {!isLoading && (
          <section aria-label="Safety violation summary" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-ochre/40 bg-ochre-tint p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-ochre">Open violations</p>
              <p className="mt-1 text-2xl font-bold text-ink">{flags.length}</p>
              <p className="mt-1 text-xs text-muted">Findings still needing a human decision</p>
            </div>
            <div className="rounded-lg border border-line bg-surface p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Cases affected</p>
              <p className="mt-1 text-2xl font-bold text-ink">{safetySummary.affectedCases}</p>
              <p className="mt-1 text-xs text-muted">Clinical cases blocked by open flags</p>
            </div>
            <div className="rounded-lg border border-brick/30 bg-brick-tint p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-brick">High confidence</p>
              <p className="mt-1 text-2xl font-bold text-ink">{safetySummary.highConfidence}</p>
              <p className="mt-1 text-xs text-muted">Findings needing priority review</p>
            </div>
          </section>
        )}

        {!isLoading && safetySummary.byType.length > 0 && (
          <section className="rounded-lg border border-line bg-surface p-5" aria-label="Safety violations by type">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-ink">Violations by safety check</h2>
                <p className="mt-1 text-xs text-muted">Counts below reflect the current organization filter.</p>
              </div>
              <ShieldAlert className="h-5 w-5 text-ochre" />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {safetySummary.byType.map(([flagType, count]) => (
                <div key={flagType} className="flex items-center gap-2 rounded border border-line bg-paper px-3 py-2">
                  <span className="text-xs font-semibold text-ink">{flagType.replaceAll("_", " ")}</span>
                  <span className="rounded-full bg-ochre-tint px-2 py-0.5 text-xs font-bold text-ochre">{count}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {isLoading ? (
          <div className="card p-12 text-center text-sm text-muted">Loading open flags…</div>
        ) : flags.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line bg-surface p-12 text-center">
            <CheckCircle2 className="mx-auto h-9 w-9 text-sage mb-3" strokeWidth={1.5} />
            <p className="text-sm font-medium text-ink">No open safety flags</p>
            <p className="text-xs text-muted mt-1">Every flagged item has a recorded human decision.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {flags.map((f) => (
              <div key={f.id} className="card card-accent border-l-ochre p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    {f.case ? (
                      <Link href={`/cases/${f.case.id}/review`} className="mb-3 block rounded border border-line bg-paper px-3 py-2 hover:border-pine">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-pine">Clinical case</span>
                        <span className="mt-0.5 block text-sm font-bold text-ink">{f.case.title}</span>
                        <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
                          <span>Case #{f.case.id.slice(0, 8)}</span>
                          {f.case.organizationName && <span>{f.case.organizationName}</span>}
                          {f.case.physician?.name && <span>{f.case.physician.name}</span>}
                        </span>
                      </Link>
                    ) : (
                      <div className="mb-3 rounded border border-brick/30 bg-brick-tint px-3 py-2 text-xs font-semibold text-brick">Case association unavailable</div>
                    )}
                    <div className="flex items-center gap-2 mb-1.5">
                      <StatusTag tone={CONFIDENCE_TONE[f.confidence] || "ochre"}>{f.confidence} confidence</StatusTag>
                      <span className="text-[10px] font-medium text-muted uppercase tracking-wide">{f.flagType.replace("_", " ")}</span>
                    </div>
                    <p className="text-sm text-ink">{f.detail}</p>
                    {f.imageAsset && <p className="mt-1 text-[11px] font-medium text-ochre">Image safety finding · {f.imageAsset.channel} · {f.imageAsset.phiReviewStatus}</p>}
                                        {f.imageAsset && imageSafetyFindings(f.imageAsset.safetyFindings).length > 0 && (
                                          <div className="mt-3 rounded border border-ochre/30 bg-ochre-tint p-3">
                                            <p className="text-[10px] font-semibold uppercase tracking-wide text-ochre">Why this was flagged</p>
                                            <ul className="mt-2 space-y-2">
                                              {imageSafetyFindings(f.imageAsset.safetyFindings).map((finding, index) => (
                                                <li key={`${finding.type || "finding"}-${index}`} className="text-xs leading-5 text-ink">
                                                  <strong>{(finding.type || "Safety finding").replaceAll("_", " ")}</strong>
                                                  {finding.confidence ? <span className="text-muted"> · {finding.confidence} confidence</span> : null}
                                                  <span> · {finding.detail || "Potentially identifying content was detected."}</span>
                                                </li>
                                              ))}
                                            </ul>
                                          </div>
                                        )}
                                        {f.imageAsset && imageSafetyFindings(f.imageAsset.safetyFindings).length === 0 && (
                                          <p className="mt-2 text-xs text-muted">Detailed screening evidence is unavailable for this earlier image scan. Open the case to inspect the source image before deciding.</p>
                                        )}
                    <button
                      type="button"
                      onClick={() => viewRefinedText(f)}
                      className="mt-3 rounded border border-line bg-surface px-2.5 py-1.5 text-[11px] font-semibold text-ink hover:border-pine hover:text-pine"
                    >
                      View refined text
                    </button>
                  </div>

                  <div className="flex flex-col gap-1.5 shrink-0 w-52">
                    <button
                      disabled={actingOnId === f.id}
                      onClick={() => resolve(f.id, "REVIEWED_OK")}
                      className="flex items-center gap-1.5 rounded bg-sage px-3 py-1.5 text-[11px] font-medium text-white hover:opacity-90 disabled:opacity-50"
                    >
                      <CheckCircle2 className="h-3 w-3" /> Mark reviewed — OK
                    </button>
                    <button
                      disabled={actingOnId === f.id}
                      onClick={() => resolve(f.id, "REVIEWED_REDACTED")}
                      className="flex items-center gap-1.5 rounded border border-line bg-surface px-3 py-1.5 text-[11px] font-medium text-ink hover:border-ochre disabled:opacity-50"
                    >
                      <Scissors className="h-3 w-3" /> Needs redaction
                    </button>
                    <button
                      disabled={actingOnId === f.id}
                      onClick={() => resolve(f.id, "REJECTED")}
                      className="flex items-center gap-1.5 rounded border border-brick/30 bg-brick-tint px-3 py-1.5 text-[11px] font-medium text-brick hover:bg-brick/10 disabled:opacity-50"
                    >
                      <XCircle className="h-3 w-3" /> Reject content
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
      {viewingFlag && <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"><section role="dialog" aria-modal="true" aria-labelledby="refined-text-title" className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-line bg-surface p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-semibold uppercase tracking-wide text-ochre">Safety review evidence</p><h2 id="refined-text-title" className="mt-1 text-lg font-bold text-ink">Refined clinical narrative</h2><p className="mt-1 text-xs text-muted">{viewingFlag.case?.title || "Case association unavailable"}</p></div><button onClick={() => { setViewingFlag(null); setRefinedText(null); }} className="rounded border border-line px-3 py-1 text-xs font-semibold text-ink hover:border-pine">Close</button></div><div className="mt-5 rounded border border-ochre/30 bg-ochre-tint p-3 text-xs leading-5 text-ink"><strong>{viewingFlag.flagType.replaceAll("_", " ")}</strong> · {viewingFlag.detail}</div><div className="mt-5"><h3 className="text-xs font-bold uppercase tracking-wide text-muted">Redacted GPT refinement</h3><p className="mt-2 whitespace-pre-wrap rounded border border-line bg-paper p-4 text-sm leading-7 text-ink">{isLoadingRefinedText ? "Loading refined text..." : refinedText || "No refined text is available for this safety finding."}</p></div></section></div>}
    </div>
  );
}
