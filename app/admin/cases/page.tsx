"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { fetchJsonOnce } from "@/lib/client-fetch";
import { formatDate, formatDateTime } from "@/lib/date-format";
import JSZip from "jszip";
import {
  ArrowLeft,
  Building2,
  Filter,
  CheckCircle2,
  Clock,
  XCircle,
  Eye,
  FileText,
  Search,
  RefreshCw,
  ShieldCheck,
  Mic,
  Calendar,
  Download,
  CheckSquare,
  Square,
  AlertTriangle,
  X,
  History,
  ShieldAlert,
  Play,
  Pause,
  Loader2,
} from "lucide-react";
import StatusTag from "@/components/ui/StatusTag";

interface CaseItem {
  id: string;
  title: string;
  status: "PENDING_REVIEW" | "APPROVED" | "REJECTED";
  rejectionReason: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  rawInput: string;
  masterRecord?: any;
  safetyAudit?: any;
  physician: {
    id: string;
    name: string;
    specialty: string | null;
    registrationNo: string | null;
  };
  organization: {
    id: string;
    name: string;
  };
  recordings: {
    id: string;
    r2Key: string;
    durationSeconds: number;
    transcriptionStatus: string;
  }[];
  assets: {
    id: string;
    channelKey: string;
    channelName: string;
    content: any;
  }[];
  _count?: { assets: number };
  safetyFlags: {
    id: string;
    flagType: string;
    detail: string;
    confidence: string;
  }[];
}

interface Organization {
  id: string;
  name: string;
}

const STATUS_ACCENT: Record<string, string> = {
  APPROVED: "border-l-sage",
  REJECTED: "border-l-brick",
  PENDING_REVIEW: "border-l-ochre",
};

export default function AdminCasesPage() {
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>("ALL");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const [selectedCaseIds, setSelectedCaseIds] = useState<Set<string>>(
    new Set(),
  );
  const [isExporting, setIsExporting] = useState(false);

  const [activeAuditCase, setActiveAuditCase] = useState<CaseItem | null>(null);
  const [rejectionModalCase, setRejectionModalCase] = useState<CaseItem | null>(
    null,
  );
  const [rejectionInputReason, setRejectionInputReason] = useState("");
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [isLoadingAuditCase, setIsLoadingAuditCase] = useState(false);
  const [playingRecordingId, setPlayingRecordingId] = useState<string | null>(
    null,
  );
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [isLoadingPlayback, setIsLoadingPlayback] = useState(false);

  const loadCases = async () => {
    const cacheKey = `macula:case-list:${selectedOrgId}:${selectedStatus}:${fromDate}:${toDate}`;
    let servedCache = false;
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as {
          cases: CaseItem[];
          organizations?: Organization[];
          cachedAt: number;
        };
        if (Date.now() - parsed.cachedAt < 60_000) {
          setCases(parsed.cases || []);
          setOrganizations(parsed.organizations || []);
          setSelectedCaseIds(new Set());
          servedCache = true;
        }
      }
    } catch {
      // Ignore unavailable or invalid browser cache.
    }
    try {
      const organizationData = await fetchJsonOnce<{ organizations: Organization[] }>(
        "/api/admin/organizations",
        { cache: "no-store" },
      );
      setOrganizations(organizationData.organizations || []);
    } catch (organizationError) {
      console.error("Failed to load organizations:", organizationError);
    }
    setIsLoading(!servedCache);
    try {
      let url = `/api/admin/cases?status=${selectedStatus}&pageSize=10`;
      if (selectedOrgId !== "ALL") url += `&orgId=${selectedOrgId}`;
      if (fromDate) url += `&fromDate=${fromDate}`;
      if (toDate) url += `&toDate=${toDate}`;
      try {
        const data = await fetchJsonOnce<any>(url, { cache: "no-store" });
        setCases(data.cases || []);
        setOrganizations(data.organizations || []);
        try {
          sessionStorage.setItem(
            cacheKey,
            JSON.stringify({
              cases: data.cases || [],
              organizations: data.organizations || [],
              cachedAt: Date.now(),
            }),
          );
        } catch {
          /* Ignore storage limits. */
        }
        setSelectedCaseIds(new Set());
      } catch (requestError) {
        console.error("Failed to load cases:", requestError);
      }
    } catch (err) {
      console.error("Failed to load cases:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCases();
  }, [selectedOrgId, selectedStatus, fromDate, toDate]);

  const filteredCases = useMemo(() => {
    const fromTimestamp = fromDate
      ? Date.parse(`${fromDate}T00:00:00.000Z`)
      : null;
    const toTimestamp = toDate ? Date.parse(`${toDate}T23:59:59.999Z`) : null;
    return cases.filter((c) => {
      const q = searchQuery.toLowerCase();
      const createdTimestamp = Date.parse(c.createdAt);
      return (
        (fromTimestamp === null || createdTimestamp >= fromTimestamp) &&
        (toTimestamp === null || createdTimestamp <= toTimestamp) &&
        (c.title.toLowerCase().includes(q) ||
          c.physician.name.toLowerCase().includes(q) ||
          c.physician.registrationNo?.toLowerCase().includes(q) ||
          c.organization.name.toLowerCase().includes(q))
      );
    });
  }, [cases, searchQuery]);

  const toggleSelectCase = (id: string) => {
    setSelectedCaseIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openAuditCase = async (caseItem: CaseItem) => {
    setActiveAuditCase(caseItem);
    if (caseItem.safetyAudit) return;
    setIsLoadingAuditCase(true);
    try {
      const response = await fetch(`/api/cases/${caseItem.id}/review`);
      const data = await response.json();
      if (response.ok)
        setActiveAuditCase((current) =>
          current?.id === caseItem.id
            ? { ...current, safetyAudit: data.case.safetyAudit }
            : current,
        );
    } catch (error) {
      console.error("Failed to load case audit details:", error);
    } finally {
      setIsLoadingAuditCase(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedCaseIds.size === filteredCases.length) {
      setSelectedCaseIds(new Set());
    } else {
      setSelectedCaseIds(new Set(filteredCases.map((c) => c.id)));
    }
  };

  const playRecording = async (recordingId: string) => {
    if (playingRecordingId === recordingId) {
      setPlayingRecordingId(null);
      setPlaybackUrl(null);
      return;
    }

    setIsLoadingPlayback(true);
    try {
      const res = await fetch(
        `/api/audio/playback?recordingId=${encodeURIComponent(recordingId)}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to load audio.");
      setPlaybackUrl(data.url);
      setPlayingRecordingId(recordingId);
    } catch (error: any) {
      setApproveError(error.message || "Unable to load audio playback.");
    } finally {
      setIsLoadingPlayback(false);
    }
  };

  const updateCaseStatus = async (
    caseId: string,
    newStatus: "APPROVED" | "REJECTED",
    reason?: string,
  ) => {
    setIsSubmittingAction(true);
    setApproveError(null);
    try {
      const res =
        newStatus === "APPROVED"
          ? await fetch(`/api/cases/${caseId}/approve`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                approvedBy: "Chief Medical Administrator / Compliance Officer",
              }),
            })
          : await fetch("/api/admin/cases", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                caseId,
                status: newStatus,
                rejectionReason: reason || null,
                reviewedBy: "Chief Medical Administrator / Compliance Officer",
              }),
            });

      const json = await res.json();

      if (res.ok) {
        setCases((prev) =>
          prev.map((c) => (c.id === caseId ? { ...c, ...json.case } : c)),
        );
        setRejectionModalCase(null);
        setRejectionInputReason("");
      } else if (newStatus === "APPROVED") {
        const flagList = (json.openFlags || [])
          .map((f: any) => f.detail)
          .join("; ");
        setApproveError(json.error + (flagList ? ` (${flagList})` : ""));
      }
    } catch (err) {
      console.error("Failed to update status:", err);
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const handleBatchExport = async () => {
    const targetCases =
      selectedCaseIds.size > 0
        ? cases.filter((c) => selectedCaseIds.has(c.id))
        : filteredCases.filter((c) => c.status === "APPROVED");

    if (targetCases.length === 0) {
      alert("No approved or selected cases available for export.");
      return;
    }

    setIsExporting(true);
    try {
      const exportResponse = await fetch(
        "/api/admin/cases?status=ALL&includeContent=true",
      );
      const exportData = await exportResponse.json();
      if (!exportResponse.ok)
        throw new Error(exportData.error || "Unable to load export data.");
      const exportCases: CaseItem[] = exportData.cases || [];
      const exportById = new Map<string, CaseItem>(
        exportCases.map((item) => [item.id, item]),
      );
      const casesForExport = targetCases.map(
        (item) => exportById.get(item.id) || item,
      );
      const zip = new JSZip();
      const folder = zip.folder("macula_clinical_records");

      const csvHeader = [
        "Case ID",
        "Case Title",
        "Status",
        "Healthcare Organization",
        "Attending Physician",
        "NMC Registration No",
        "Audio Recording Attached",
        "Created At",
        "Reviewed By",
        "Reviewed At",
        "Rejection Reason",
      ];
      const csvRows = casesForExport.map((c) => [
        `"${c.id}"`,
        `"${c.title.replace(/"/g, '""')}"`,
        `"${c.status}"`,
        `"${c.organization.name.replace(/"/g, '""')}"`,
        `"${c.physician.name.replace(/"/g, '""')}"`,
        `"${c.physician.registrationNo || "N/A"}"`,
        `"${c.recordings.length > 0 ? "Yes" : "No"}"`,
        `"${c.createdAt}"`,
        `"${c.reviewedBy || "Pending"}"`,
        `"${c.reviewedAt || "Pending"}"`,
        `"${(c.rejectionReason || "").replace(/"/g, '""')}"`,
      ]);
      const csvContent = [
        csvHeader.join(","),
        ...csvRows.map((r) => r.join(",")),
      ].join("\n");
      folder?.file("index_cases.csv", csvContent);

      casesForExport.forEach((c) => {
        const payload = {
          caseId: c.id,
          title: c.title,
          status: c.status,
          organization: c.organization,
          attendingPhysician: c.physician,
          rejectionAudit: {
            reason: c.rejectionReason,
            reviewedBy: c.reviewedBy,
            reviewedAt: c.reviewedAt,
          },
          clinicalMasterRecord: c.masterRecord,
          safetyAndComplianceAudit: c.safetyAudit,
          recordingsMetadata: c.recordings,
          generatedAssets: c.assets,
          createdAt: c.createdAt,
        };
        const safeTitle = c.title.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 30);
        folder?.file(
          `case_${safeTitle}_${c.id.slice(0, 8)}.json`,
          JSON.stringify(payload, null, 2),
        );
      });

      const blob = await zip.generateAsync({ type: "blob" });
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `macula_export_${Date.now()}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      console.error("Batch export error:", err);
      alert("An error occurred during batch export packaging.");
    } finally {
      setIsExporting(false);
    }
  };

  const getStatusBadge = (c: CaseItem) => {
    switch (c.status) {
      case "APPROVED":
        return (
          <StatusTag tone="sage" icon={<CheckCircle2 className="h-3 w-3" />}>
            Approved
          </StatusTag>
        );
      case "REJECTED":
        return (
          <button
            type="button"
            onClick={() => openAuditCase(c)}
            className="hover:opacity-80"
          >
            <StatusTag tone="brick" icon={<XCircle className="h-3 w-3" />}>
              Rejected · view
            </StatusTag>
          </button>
        );
      default:
        return (
          <StatusTag tone="ochre" icon={<Clock className="h-3 w-3" />}>
            Pending review
          </StatusTag>
        );
    }
  };

  return (
    <div className="readable-route min-h-screen bg-paper text-ink">
      <header className="bg-transparent px-4 pt-6 md:px-6 md:pt-8">
        <div className="flex w-full flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-pine">
              <Link
                href="/"
                className="flex items-center gap-1 hover:underline"
              >
                <ArrowLeft className="h-3 w-3" /> Dashboard
              </Link>
              <span>/</span>
              <span>Case Management</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-ink">
              Case Governance
            </h1>
            <p className="mt-0.5 text-xs text-muted">
              Compliance review across every organization
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            <Link
              href="/admin/safety-queue"
              className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink hover:border-ochre hover:text-ochre transition"
            >
              <ShieldAlert className="h-3.5 w-3.5" /> Safety Queue
            </Link>
            <button
              type="button"
              onClick={handleBatchExport}
              disabled={
                isExporting ||
                (selectedCaseIds.size === 0 &&
                  !cases.some((c) => c.status === "APPROVED"))
              }
              className="flex items-center gap-1.5 rounded-lg bg-pine px-3.5 py-2 text-xs font-semibold text-white hover:bg-pine-dark disabled:opacity-40 transition"
            >
              <Download className="h-3.5 w-3.5" />
              {isExporting
                ? "Packaging…"
                : selectedCaseIds.size > 0
                  ? `Export (${selectedCaseIds.size})`
                  : "Export approved"}
            </button>
            <button
              type="button"
              onClick={loadCases}
              className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink hover:border-pine transition"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </header>

      <main className="w-full p-6 space-y-5 md:p-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 card p-4">
          <div className="flex flex-1 items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted" />
              <input
                type="text"
                placeholder="Search by case title, physician, or registration no…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded border border-line bg-paper pl-9 pr-3 py-1.5 text-xs text-ink placeholder-muted focus:border-pine focus:bg-white focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5 text-muted" />
              <select
                value={selectedOrgId}
                onChange={(e) => setSelectedOrgId(e.target.value)}
                className="rounded border border-line bg-paper px-2.5 py-1.5 text-xs text-ink focus:border-pine focus:outline-none"
              >
                <option value="ALL">All organizations</option>
                {organizations.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-1.5">
              <Filter className="h-3.5 w-3.5 text-muted" />
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="rounded border border-line bg-paper px-2.5 py-1.5 text-xs text-ink focus:border-pine focus:outline-none"
              >
                <option value="ALL">All statuses</option>
                <option value="PENDING_REVIEW">Pending review</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
              </select>
            </div>
            <label className="flex items-center gap-1.5 text-xs text-muted">
              From
              <input
                type="date"
                value={fromDate}
                onChange={(event) => setFromDate(event.target.value)}
                className="rounded border border-line bg-paper px-2 py-1.5 text-xs text-ink focus:border-pine focus:outline-none"
              />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted">
              To
              <input
                type="date"
                value={toDate}
                onChange={(event) => setToDate(event.target.value)}
                className="rounded border border-line bg-paper px-2 py-1.5 text-xs text-ink focus:border-pine focus:outline-none"
              />
            </label>
          </div>
          <div className="text-xs text-muted">
            <strong className="text-ink font-medium">
              {filteredCases.length}
            </strong>{" "}
            cases
            {selectedCaseIds.size > 0 && (
              <span className="ml-1 text-pine font-medium">
                ({selectedCaseIds.size} selected)
              </span>
            )}
          </div>
        </div>

        {approveError && (
          <div className="flex items-start gap-2 rounded border border-ochre bg-ochre-tint p-3 text-xs text-ochre">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div className="flex-1">{approveError}</div>
            <button
              onClick={() => setApproveError(null)}
              className="hover:opacity-70"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <div className="overflow-hidden card">
          <table className="w-full table-fixed text-left text-xs text-ink">
            <colgroup>
              <col className="w-[4%]" />
              <col className="w-[21%]" />
              <col className="w-[15%]" />
              <col className="w-[12%]" />
              <col className="w-[11%]" />
              <col className="w-[8%]" />
              <col className="w-[29%]" />
            </colgroup>
            <thead className="bg-paper text-[10px] font-semibold uppercase tracking-wide text-muted border-b border-line">
              <tr>
                <th className="px-5 py-3">
                  <button
                    type="button"
                    onClick={toggleSelectAll}
                    className="text-muted hover:text-ink"
                  >
                    {filteredCases.length > 0 &&
                    selectedCaseIds.size === filteredCases.length ? (
                      <CheckSquare className="h-4 w-4 text-pine" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                  </button>
                </th>
                <th className="px-5 py-3">Case & organization</th>
                <th className="px-5 py-3">Attending physician</th>
                <th className="px-5 py-3">Source & assets</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Created</th>
                <th className="sticky right-0 z-10 bg-paper px-5 py-3 text-right shadow-[-8px_0_12px_-12px_rgba(28,37,33,0.35)]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-muted">
                    Loading cases…
                  </td>
                </tr>
              ) : filteredCases.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-muted">
                    No cases match the current filters.
                  </td>
                </tr>
              ) : (
                filteredCases.map((c) => {
                  const accent = STATUS_ACCENT[c.status] || "border-l-line";
                  return (
                    <tr
                      key={c.id}
                      className={`border-l-[3px] ${accent} hover:bg-paper/60 transition`}
                    >
                      <td className="px-5 py-4">
                        <button
                          type="button"
                          onClick={() => toggleSelectCase(c.id)}
                          className="text-muted hover:text-ink"
                        >
                          {selectedCaseIds.has(c.id) ? (
                            <CheckSquare className="h-4 w-4 text-pine" />
                          ) : (
                            <Square className="h-4 w-4" />
                          )}
                        </button>
                      </td>
                      <td className="px-5 py-4">
                        <div className="font-medium text-ink">{c.title}</div>
                        <div className="text-[11px] text-muted flex items-center gap-1 mt-0.5">
                          <Building2 className="h-3 w-3" />{" "}
                          {c.organization.name}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="text-ink">{c.physician.name}</div>
                        <div className="text-[11px] text-muted font-mono">
                          {c.physician.registrationNo || "Not provided"} ·{" "}
                          {c.physician.specialty || "General"}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          {c.recordings.length > 0 ? (
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  playRecording(c.recordings[0].id)
                                }
                                className="inline-flex items-center gap-1 rounded border border-pine/30 bg-pine-tint px-2 py-1 text-[11px] font-medium text-pine-dark hover:bg-pine/10 transition"
                                title="Play recorded audio"
                              >
                                {isLoadingPlayback &&
                                playingRecordingId === c.recordings[0].id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : playingRecordingId ===
                                  c.recordings[0].id ? (
                                  <Pause className="h-3 w-3" />
                                ) : (
                                  <Play className="h-3 w-3" />
                                )}
                                Audio ({c.recordings[0].durationSeconds}s)
                              </button>
                              {playingRecordingId === c.recordings[0].id &&
                                playbackUrl && (
                                  <audio
                                    src={playbackUrl}
                                    controls
                                    autoPlay
                                    className="h-7 max-w-[190px]"
                                    onEnded={() => setPlayingRecordingId(null)}
                                  />
                                )}
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] text-muted">
                              <FileText className="h-3 w-3" /> Manual text
                            </span>
                          )}
                          <span className="text-[11px] text-muted">
                            · {c._count?.assets ?? c.assets.length} asset
                            {(c._count?.assets ?? c.assets.length) === 1
                              ? ""
                              : "s"}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-col items-start gap-1">
                          {getStatusBadge(c)}
                          {c.reviewedBy && (
                            <span className="text-[10px] text-muted">
                              By {c.reviewedBy.split(" ")[0]}
                            </span>
                          )}
                          {c.safetyFlags.length > 0 && (
                            <span
                              title={c.safetyFlags
                                .map((f) => f.detail)
                                .join(" | ")}
                            >
                              <StatusTag
                                tone="ochre"
                                icon={<AlertTriangle className="h-3 w-3" />}
                              >
                                {c.safetyFlags.length} open flag
                                {c.safetyFlags.length === 1 ? "" : "s"}
                              </StatusTag>
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-[11px] text-muted">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDate(c.createdAt)}
                        </div>
                      </td>
                      <td className="sticky right-0 z-10 bg-surface px-5 py-4 text-right shadow-[-8px_0_12px_-12px_rgba(28,37,33,0.35)]">
                        <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                          {c.status === "PENDING_REVIEW" &&
                            c.recordings.length > 0 && (
                              <Link
                                href={`/cases/new?resumeCaseId=${c.id}`}
                                className="flex items-center gap-1 rounded border border-pine/30 bg-pine-tint px-2.5 py-1 text-[11px] font-medium text-pine-dark hover:bg-pine/10 transition"
                              >
                                <Mic className="h-3 w-3" /> Transcribe
                              </Link>
                            )}
                          <Link
                            href={`/cases/${c.id}/review`}
                            className="flex items-center gap-1 rounded border border-line bg-surface px-2.5 py-1 text-[11px] font-medium text-ink hover:border-pine transition"
                          >
                            <Eye className="h-3 w-3 text-muted" /> Review
                          </Link>
                          {c.status !== "APPROVED" && (
                            <button
                              type="button"
                              onClick={() => updateCaseStatus(c.id, "APPROVED")}
                              disabled={c.safetyFlags.length > 0}
                              title={
                                c.safetyFlags.length > 0
                                  ? "Resolve open safety flags in the Safety Queue before approving"
                                  : undefined
                              }
                              className="rounded bg-sage px-2.5 py-1 text-[11px] font-medium text-white hover:opacity-90 transition disabled:bg-line disabled:text-muted disabled:cursor-not-allowed"
                            >
                              {c.safetyFlags.length > 0
                                ? "Flags open"
                                : "Approve"}
                            </button>
                          )}
                          {c.status !== "REJECTED" && (
                            <button
                              type="button"
                              onClick={() => {
                                setRejectionModalCase(c);
                                setRejectionInputReason("");
                              }}
                              className="rounded border border-brick/30 bg-brick-tint px-2.5 py-1 text-[11px] font-medium text-brick hover:bg-brick/10 transition"
                            >
                              Reject
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openAuditCase(c)}
                            title="Inspect audit trail"
                            className="rounded border border-line bg-surface p-1 text-muted hover:border-pine hover:text-pine transition"
                          >
                            <History className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </main>

      {rejectionModalCase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-lg rounded-lg border border-line bg-surface p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div className="flex items-center gap-2 text-brick">
                <AlertTriangle className="h-5 w-5" />
                <h3 className="font-serif font-semibold text-sm">
                  Log case rejection
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setRejectionModalCase(null)}
                className="text-muted hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-muted">
              Enter the clinical, ethical, or DPDP compliance justification for
              rejecting{" "}
              <strong className="text-ink">
                &ldquo;{rejectionModalCase.title}&rdquo;
              </strong>
              :
            </p>
            <textarea
              rows={4}
              value={rejectionInputReason}
              onChange={(e) => setRejectionInputReason(e.target.value)}
              placeholder="E.g., Incomplete dosage specification in prescription; Unredacted patient identifier detected…"
              className="w-full rounded border border-line bg-paper p-3 font-mono text-xs text-ink focus:border-brick focus:bg-white focus:outline-none"
            />
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRejectionModalCase(null)}
                className="rounded border border-line px-3 py-1.5 text-xs font-medium text-muted hover:bg-paper"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!rejectionInputReason.trim() || isSubmittingAction}
                onClick={() =>
                  updateCaseStatus(
                    rejectionModalCase.id,
                    "REJECTED",
                    rejectionInputReason.trim(),
                  )
                }
                className="rounded bg-brick px-4 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50 transition"
              >
                {isSubmittingAction ? "Logging…" : "Confirm rejection"}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeAuditCase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-[2px]">
          <div className="flex h-[80vh] w-full max-w-2xl flex-col rounded-lg border border-line bg-surface shadow-xl">
            <div className="flex items-center justify-between border-b border-line px-6 py-4">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-pine" />
                <h3 className="font-serif font-semibold text-sm">
                  Audit trail — {activeAuditCase.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveAuditCase(null)}
                className="text-muted hover:text-ink"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
              <div className="card p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-muted">
                    Current status:
                  </span>
                  <span>{getStatusBadge(activeAuditCase)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-medium text-muted">Reviewed by:</span>
                  <span className="font-mono text-ink">
                    {activeAuditCase.reviewedBy || "Unassigned"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-medium text-muted">Timestamp:</span>
                  <span className="font-mono text-ink">
                    {activeAuditCase.reviewedAt
                      ? formatDateTime(activeAuditCase.reviewedAt)
                      : "Pending review"}
                  </span>
                </div>
              </div>

              {activeAuditCase.status === "REJECTED" && (
                <div className="rounded border border-brick/30 bg-brick-tint p-4 space-y-1.5">
                  <span className="font-medium text-brick flex items-center gap-1.5">
                    <ShieldAlert className="h-4 w-4" /> Rejection justification
                  </span>
                  <p className="font-mono text-[11px] text-ink bg-white p-3 rounded border border-brick/20 whitespace-pre-wrap">
                    {activeAuditCase.rejectionReason ||
                      "No explicit reason specified."}
                  </p>
                </div>
              )}

              <div>
                <h4 className="font-medium text-ink mb-2">
                  Automated safety & DPDP redaction audit
                </h4>
                <pre className="rounded bg-ink p-4 font-mono text-[11px] text-pine-tint max-h-56 overflow-y-auto">
                  {isLoadingAuditCase
                    ? "Loading audit details..."
                    : JSON.stringify(
                        activeAuditCase.safetyAudit || {},
                        null,
                        2,
                      )}
                </pre>
              </div>

              <div className="card p-4 text-ink space-y-1">
                <h4 className="font-medium text-ink mb-1">RMP attribution</h4>
                <p>
                  Physician: <strong>{activeAuditCase.physician.name}</strong>
                </p>
                <p>
                  Registration no:{" "}
                  <span className="font-mono">
                    {activeAuditCase.physician.registrationNo || "Not provided"}
                  </span>
                </p>
                <p>
                  Specialty:{" "}
                  {activeAuditCase.physician.specialty || "General medicine"}
                </p>
                <p>Hospital network: {activeAuditCase.organization.name}</p>
              </div>
            </div>
            <div className="flex items-center justify-end border-t border-line bg-paper px-6 py-3 rounded-b-lg">
              <button
                type="button"
                onClick={() => setActiveAuditCase(null)}
                className="rounded bg-line px-4 py-1.5 text-xs font-medium text-ink hover:opacity-80"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
