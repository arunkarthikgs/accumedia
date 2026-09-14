"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Scissors,
  Building2,
  Stethoscope,
  RefreshCw,
} from "lucide-react";
import StatusTag from "@/components/ui/StatusTag";

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
    physician?: { name: string } | null;
  };
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

export default function SafetyQueuePage() {
  const [flags, setFlags] = useState<Flag[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState("ALL");
  const [isLoading, setIsLoading] = useState(true);
  const [actingOnId, setActingOnId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/organizations")
      .then((r) => r.json())
      .then((d) => setOrganizations(d.organizations || []))
      .catch(() => {});
  }, []);

  const loadFlags = async () => {
    setIsLoading(true);
    try {
      const caseId = new URLSearchParams(window.location.search).get("caseId");
      const url = `/api/safety-flags?status=OPEN${selectedOrgId !== "ALL" ? `&orgId=${selectedOrgId}` : ""}${caseId ? `&caseId=${caseId}` : ""}`;
      const res = await fetch(url);
      const data = await res.json();
      setFlags(data.flags || []);
    } catch (err) {
      console.error("Failed to load safety flags:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadFlags();
  }, [selectedOrgId]);

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
              onClick={loadFlags}
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
                    <div className="flex items-center gap-2 mb-1.5">
                      <StatusTag tone={CONFIDENCE_TONE[f.confidence] || "ochre"}>{f.confidence} confidence</StatusTag>
                      <span className="text-[10px] font-medium text-muted uppercase tracking-wide">{f.flagType.replace("_", " ")}</span>
                    </div>
                    <p className="text-sm text-ink">{f.detail}</p>
                    <div className="mt-2 flex items-center gap-3 text-[11px] text-muted">
                      <Link href={`/cases/${f.case.id}/review`} className="flex items-center gap-1 hover:text-pine">
                        <Stethoscope className="h-3 w-3" /> {f.case.title}
                      </Link>
                      {f.case.physician?.name && <span>· {f.case.physician.name}</span>}
                    </div>
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
    </div>
  );
}
