"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  FileText,
  History,
  Images,
  Loader2,
  Pencil,
  FileDown,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { clearJsonCache, fetchJsonOnce } from "@/lib/client-fetch";
import { createCasePdf } from "@/lib/case-pdf";
import { formatDateTime } from "@/lib/date-format";

type ReviewCase = {
  id: string;
  title: string;
  status: string;
  rawInput: string;
  guidedSubmission?: Record<string, unknown> | null;
  masterRecord: Record<string, unknown>;
  safetyAudit: Record<string, unknown>;
  physician: { name: string; specialty: string | null };
  organization: { name: string; logoUrl?: string | null; brandingHex?: string | null };
  recordings: {
    rawTranscript: string | null;
    transcribedText: string | null;
    transcriptionAgent: string | null;
  }[];
  safetyFlags: {
    id: string;
    flagType: string;
    detail: string;
    confidence: string;
  }[];
  assets: {
    id: string;
    channelName: string;
    status: string;
    content: unknown;
    validationWarnings: string[] | null;
  }[];
  sources?: {
    id: string;
    fileName: string;
    sourceType: string;
    status: string;
    processingError: string | null;
  }[];
};

function displayLabel(key: string) {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function ReadableValue({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-muted">Not provided</span>;
  }
  if (typeof value === "boolean") {
    return (
      <span className={value ? "font-medium text-sage" : "text-muted"}>
        {value ? "Yes" : "No"}
      </span>
    );
  }
  if (typeof value === "string" || typeof value === "number") {
    return (
      <span className="whitespace-pre-wrap text-ink">{String(value)}</span>
    );
  }
  if (Array.isArray(value)) {
    if (value.length === 0)
      return <span className="text-muted">None recorded</span>;
    if (
      value.every(
        (item) => typeof item === "string" || typeof item === "number",
      )
    ) {
      return (
        <ul className="space-y-1 pl-4 marker:text-pine">
          {value.map((item, index) => (
            <li key={index} className="pl-1 text-ink">
              {String(item)}
            </li>
          ))}
        </ul>
      );
    }
    return (
      <div className="space-y-2">
        {value.map((item, index) => (
          <div
            key={index}
            className="rounded border border-line bg-paper px-3 py-2"
          >
            <ReadableValue value={item} />
          </div>
        ))}
      </div>
    );
  }
  if (typeof value === "object") {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {Object.entries(value as Record<string, unknown>).map(
          ([key, nestedValue]) => (
            <div key={key} className="border-l-2 border-pine/20 pl-3">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
                {displayLabel(key)}
              </p>
              <div className="text-xs leading-5">
                <ReadableValue value={nestedValue} />
              </div>
            </div>
          ),
        )}
      </div>
    );
  }
  return <span className="text-muted">Not provided</span>;
}

function ReadableRecord({ record }: { record: Record<string, unknown> }) {
  const entries = Object.entries(record || {});
  if (entries.length === 0)
    return <p className="mt-3 text-xs text-muted">No details recorded.</p>;
  return (
    <dl className="mt-3 space-y-4">
      {entries.map(([key, value]) => (
        <div key={key}>
          <dt className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
            {displayLabel(key)}
          </dt>
          <dd className="text-sm leading-6">
            <ReadableValue value={value} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

function ClinicalRecordSection({
  title,
  fields,
  record,
}: {
  title: string;
  fields: string[];
  record: Record<string, unknown>;
}) {
  const presentFields = fields.filter((field) => field in record);
  if (presentFields.length === 0) return null;
  return (
    <section className="overflow-hidden rounded border border-line">
      <h3 className="bg-paper px-4 py-2 text-xs font-bold text-ink">{title}</h3>
      <dl className="divide-y divide-line">
        {presentFields.map((field) => (
          <div
            key={field}
            className="grid gap-1 px-4 py-3 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-4"
          >
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted">
              {displayLabel(field)}
            </dt>
            <dd className="text-sm leading-6">
              <ReadableValue value={record[field]} />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function MasterClinicalRecord({ record }: { record: Record<string, unknown> }) {
  const sections = [
    {
      title: "Case summary",
      fields: ["topic", "medicalSpecialty", "targetAudience"],
    },
    {
      title: "Clinical learning and governance",
      fields: [
        "primaryEducationalMessage",
        "clinicalLearning",
        "decisionMaking",
        "keyDifferentiatorOrInsight",
        "patientSafetyConsiderations",
        "terminologyRetain",
        "terminologySimplify",
        "confidentialityFlags",
        "promotionalClaimsRequiringCaution",
      ],
    },
    {
      title: "Clinical assessment",
      fields: [
        "chiefComplaints",
        "historyOfPresentIllness",
        "clinicalExamination",
        "investigationsAndLabs",
        "differentialOrFinalDiagnosis",
      ],
    },
    { title: "Management plan", fields: ["managementPlan"] },
  ];
  const knownFields = new Set(sections.flatMap((section) => section.fields));
  const additionalRecord = Object.fromEntries(
    Object.entries(record).filter(([key]) => !knownFields.has(key)),
  );

  return (
    <div className="mt-4 space-y-4">
      {sections.map((section) => (
        <ClinicalRecordSection
          key={section.title}
          {...section}
          record={record}
        />
      ))}
      {Object.keys(additionalRecord).length > 0 && (
        <section className="rounded border border-line p-4">
          <h3 className="text-xs font-bold text-ink">
            Additional record details
          </h3>
          <ReadableRecord record={additionalRecord} />
        </section>
      )}
    </div>
  );
}

export default function CaseReviewPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [reviewCase, setReviewCase] = useState<ReviewCase | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isActing, setIsActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEditingRecord, setIsEditingRecord] = useState(false);
  const [recordDraft, setRecordDraft] = useState("");
  const [versions, setVersions] = useState<
    {
      id: string;
      version: number;
      changeType: string;
      createdAt: string;
      rawInput: string;
      masterRecord: Record<string, unknown>;
      safetyAudit: Record<string, unknown>;
    }[]
  >([]);
  const [viewingVersion, setViewingVersion] = useState<
    (typeof versions)[number] | null
  >(null);
  const [auditEvents, setAuditEvents] = useState<
    {
      id: string;
      action: string;
      detail: string | null;
      createdAt: string;
      actor: { name: string } | null;
    }[]
  >([]);
  const [auditCursor, setAuditCursor] = useState<string | null>(null);
  const [isLoadingEarlierAuditEvents, setIsLoadingEarlierAuditEvents] =
    useState(false);
  const [activeReviewSection, setActiveReviewSection] = useState<
    "clinical" | "record" | "history" | "assets"
  >("clinical");

  useEffect(() => {
    let isCurrent = true;

    async function loadCase() {
      try {
        const data = await fetchJsonOnce<{ case: ReviewCase }>(
          `/api/cases/${params.id}/review`,
        );
        const found = data.case as ReviewCase | undefined;
        if (!found) throw new Error("Case not found.");
        if (!isCurrent) return;
        setReviewCase(found);
        setRecordDraft(JSON.stringify(found.masterRecord, null, 2));
        setIsLoading(false);

        const versionsData = await fetchJsonOnce<{ versions: typeof versions }>(
          `/api/cases/${params.id}/versions`,
        );
        const auditData = await fetchJsonOnce<{
          events: typeof auditEvents;
          nextCursor?: string | null;
        }>(`/api/cases/${params.id}/audit`);
        if (!isCurrent) return;
        setVersions(versionsData.versions || []);
        setAuditEvents(auditData.events || []);
        setAuditCursor(auditData.nextCursor || null);
      } catch (requestError: any) {
        if (!isCurrent) return;
        setError(requestError.message || "Unable to load case.");
        setIsLoading(false);
      }
    }
    loadCase();
    return () => {
      isCurrent = false;
    };
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
      if (!response.ok)
        throw new Error(data.error || "Unable to save the clinical record.");
      setReviewCase((current) =>
        current
          ? {
              ...current,
              masterRecord: data.case.masterRecord,
              status: data.case.status,
            }
          : current,
      );
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

  const loadEarlierAuditEvents = async () => {
    if (!auditCursor) return;
    setIsLoadingEarlierAuditEvents(true);
    try {
      const response = await fetch(
        `/api/cases/${params.id}/audit?cursor=${encodeURIComponent(auditCursor)}`,
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Unable to load earlier audit events.");
      setAuditEvents((current) => [...current, ...(data.events || [])]);
      setAuditCursor(data.nextCursor || null);
    } catch (requestError: any) {
      setError(requestError.message || "Unable to load earlier audit events.");
    } finally {
      setIsLoadingEarlierAuditEvents(false);
    }
  };

  const restoreVersion = async (versionId: string) => {
    if (
      !window.confirm(
        "Restore this version? The current record will be preserved in version history.",
      )
    )
      return;
    const response = await fetch(`/api/cases/${params.id}/versions`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "restore", versionId }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "Unable to restore version.");
      return;
    }
    setReviewCase((current) =>
      current
        ? {
            ...current,
            masterRecord: data.case.masterRecord,
            status: data.case.status,
          }
        : current,
    );
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
      try {
        Object.keys(sessionStorage)
          .filter((key) => key.startsWith("macula:case-list:"))
          .forEach((key) => sessionStorage.removeItem(key));
      } catch {
        // Ignore unavailable browser storage.
      }
      clearJsonCache("/api/admin/cases");
      router.replace(`/admin/cases?refresh=${Date.now()}`);
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
        body: JSON.stringify({
          caseId: params.id,
          status: "REJECTED",
          rejectionReason: reason.trim(),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Rejection failed.");
      try {
        Object.keys(sessionStorage)
          .filter((key) => key.startsWith("macula:case-list:"))
          .forEach((key) => sessionStorage.removeItem(key));
      } catch {
        // Ignore unavailable browser storage.
      }
      clearJsonCache("/api/admin/cases");
      router.replace(`/admin/cases?refresh=${Date.now()}`);
    } catch (actionError: any) {
      setError(actionError.message || "Rejection failed.");
    } finally {
      setIsActing(false);
    }
  };

  const openPdfViewer = async (target: "clinical" | "record") => {
    if (!reviewCase) return;
    const viewer = window.open("about:blank", "_blank");
    if (!viewer) {
      setError("The PDF viewer was blocked. Allow pop-ups and try again.");
      return;
    }
    viewer.document.title = "Preparing PDF viewer";
    viewer.document.body.innerHTML = "<p style=\"font-family: sans-serif; padding: 2rem\">Preparing document…</p>";
    setError(null);
    try {
      const bytes = await createCasePdf(reviewCase, target);
      const pdfBuffer = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer;
      const pdfUrl = URL.createObjectURL(
        new Blob([pdfBuffer], { type: "application/pdf" }),
      );
      viewer.location.href = pdfUrl;
      window.setTimeout(() => URL.revokeObjectURL(pdfUrl), 60_000);
    } catch (pdfError: any) {
      viewer.close();
      setError(pdfError.message || "Unable to open the PDF viewer.");
    }
  };

  if (isLoading)
    return <main className="p-8 text-sm text-muted">Loading case review…</main>;
  if (!reviewCase)
    return (
      <main className="p-8 text-sm text-brick">
        {error || "Case not found."}
      </main>
    );

  const recording = reviewCase.recordings[0];
  const narrative =
    recording?.transcribedText ||
    recording?.rawTranscript ||
    reviewCase.rawInput;
  const openFlags = reviewCase.safetyFlags || [];

  return (
    <main className="readable-route ml-0 mr-auto max-w-5xl space-y-6 p-6 md:p-8">
      <header>
        <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-pine">
          <Link
            href="/admin/cases"
            className="flex items-center gap-1 hover:underline"
          >
            <ArrowLeft className="h-3 w-3" /> Case Management
          </Link>
          <span>/</span>
          <span>Review</span>
        </div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-ink">
              {reviewCase.title}
            </h1>
            <p className="mt-1 text-xs text-muted">
              {reviewCase.organization.name} · {reviewCase.physician.name} ·{" "}
              {reviewCase.physician.specialty || "General Medicine"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => openPdfViewer("clinical")}
              className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink hover:border-pine hover:text-pine"
            >
              <FileDown className="h-3.5 w-3.5" /> View clinical PDF
            </button>
            <button
              type="button"
              onClick={() => openPdfViewer("record")}
              className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink hover:border-pine hover:text-pine"
            >
              <FileDown className="h-3.5 w-3.5" /> View master record PDF
            </button>
            <button
              disabled={isActing}
              onClick={rejectCase}
              className="flex items-center gap-1.5 rounded-lg border border-brick/30 bg-brick-tint px-3 py-2 text-xs font-semibold text-brick disabled:opacity-50"
            >
              <XCircle className="h-3.5 w-3.5" /> Reject
            </button>
            <button
              disabled={
                isActing ||
                openFlags.length > 0 ||
                reviewCase.status === "APPROVED"
              }
              onClick={approveCase}
              className="flex items-center gap-1.5 rounded-lg bg-pine px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isActing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              {reviewCase.status === "APPROVED" ? "Approved" : "Approve case"}
            </button>
          </div>
        </div>
      </header>

      {error && (
        <div className="rounded-lg border border-brick/30 bg-brick-tint p-3 text-sm text-brick">
          {error}
        </div>
      )}
      {openFlags.length > 0 && (
        <section className="rounded-lg border border-ochre/40 bg-ochre-tint p-5">
          <h2 className="flex items-center gap-2 text-sm font-bold text-ochre">
            <ShieldAlert className="h-4 w-4" /> Safety review required
          </h2>
          <p className="mt-1 text-xs text-ochre">
            Resolve all open flags in the Safety Queue before approval.
          </p>
          <div className="mt-3 space-y-2">
            {openFlags.map((flag) => (
              <div
                key={flag.id}
                className="rounded border border-ochre/30 bg-surface p-3 text-xs text-ink"
              >
                <strong>{flag.flagType}</strong> · {flag.detail}
              </div>
            ))}
          </div>
          <Link
            href={`/admin/safety-queue?caseId=${reviewCase.id}`}
            className="mt-3 inline-flex text-xs font-semibold text-ochre underline"
          >
            Open Safety Queue
          </Link>
        </section>
      )}

      <nav
        aria-label="Review sections"
        className="sticky top-0 z-10 flex gap-1 overflow-x-auto rounded-lg border border-line bg-surface p-1"
      >
        {(
          [
            ["clinical", "Clinical review", FileText],
            ["record", "Master record", ClipboardList],
            ["history", "History & audit", History],
            ["assets", "Assets & sources", Images],
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveReviewSection(key)}
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded px-3 py-2 text-xs font-semibold transition ${activeReviewSection === key ? "bg-pine text-white" : "text-muted hover:bg-paper hover:text-ink"}`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </nav>

      {activeReviewSection === "clinical" && (
        <>
          <section className="rounded-lg border border-line bg-surface p-5">
            <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
              <FileText className="h-4 w-4 text-pine" /> Clinician-reviewed
              narrative
            </h2>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-ink">
              {narrative || "No narrative available."}
            </p>
            {recording?.transcriptionAgent && (
              <p className="mt-4 text-[11px] font-mono text-muted">
                Transcribed by {recording.transcriptionAgent}
              </p>
            )}
          </section>
          {reviewCase.guidedSubmission && (
            <section className="rounded-lg border border-line bg-surface p-5">
              <h2 className="text-sm font-bold text-ink">
                Guided submission source
              </h2>
              <ReadableRecord record={reviewCase.guidedSubmission} />
            </section>
          )}
        </>
      )}
      {activeReviewSection === "record" && (
        <>
          <section className="rounded-lg border border-line bg-surface p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-ink">
                Master Clinical Record
              </h2>
              {!isEditingRecord && (
                <button
                  onClick={() => setIsEditingRecord(true)}
                  className="flex items-center gap-1 rounded border border-line px-2 py-1 text-[11px] font-semibold text-ink hover:border-pine"
                >
                  <Pencil className="h-3 w-3" /> Edit
                </button>
              )}
            </div>
            {isEditingRecord ? (
              <>
                <textarea
                  value={recordDraft}
                  onChange={(event) => setRecordDraft(event.target.value)}
                  className="mt-3 h-72 w-full rounded border border-line bg-paper p-3 font-mono text-xs leading-6 text-ink focus:border-pine focus:outline-none"
                />
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={saveRecord}
                    className="rounded bg-pine px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    Save record
                  </button>
                  <button
                    onClick={() => {
                      setIsEditingRecord(false);
                      setRecordDraft(
                        JSON.stringify(reviewCase.masterRecord, null, 2),
                      );
                    }}
                    className="rounded border border-line px-3 py-1.5 text-xs font-semibold text-ink"
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <MasterClinicalRecord record={reviewCase.masterRecord} />
            )}
          </section>
          <section className="rounded-lg border border-line bg-surface p-5">
            <h2 className="text-sm font-bold text-ink">Compliance audit</h2>
            <ReadableRecord record={reviewCase.safetyAudit} />
          </section>
        </>
      )}
      {activeReviewSection === "history" && (
        <>
          <section className="rounded-lg border border-line bg-surface p-5">
            <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
              <History className="h-4 w-4 text-pine" /> Version history
            </h2>
            {versions.length === 0 ? (
              <p className="mt-2 text-xs text-muted">No saved versions yet.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {versions.map((version) => (
                  <div
                    key={version.id}
                    className="flex items-center justify-between border-b border-line py-2 text-xs"
                  >
                    <span>
                      <strong className="text-ink">v{version.version}</strong> ·{" "}
                      {version.changeType} ·{" "}
                      {formatDateTime(version.createdAt)}
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setViewingVersion(version)}
                        className="rounded border border-line px-2 py-1 font-semibold text-ink hover:border-pine"
                      >
                        View
                      </button>
                      <button
                        onClick={() => restoreVersion(version.id)}
                        className="rounded border border-line px-2 py-1 font-semibold text-ink hover:border-pine"
                      >
                        Restore
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
          {viewingVersion && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
              <section className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-lg border border-line bg-surface p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-ink">
                      Version {viewingVersion.version}
                    </h2>
                    <p className="text-xs text-muted">
                      {viewingVersion.changeType} ·{" "}
                      {formatDateTime(viewingVersion.createdAt)}
                    </p>
                  </div>
                  <button
                    onClick={() => setViewingVersion(null)}
                    className="rounded border border-line px-3 py-1 text-xs font-semibold text-ink"
                  >
                    Close
                  </button>
                </div>
                <h3 className="mt-5 text-xs font-bold uppercase tracking-wide text-muted">
                  Source narrative
                </h3>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink">
                  {viewingVersion.rawInput || "Not provided."}
                </p>
                <h3 className="mt-5 text-xs font-bold uppercase tracking-wide text-muted">
                  Master clinical record
                </h3>
                <MasterClinicalRecord record={viewingVersion.masterRecord} />
                <h3 className="mt-5 text-xs font-bold uppercase tracking-wide text-muted">
                  Compliance audit
                </h3>
                <ReadableRecord record={viewingVersion.safetyAudit} />
              </section>
            </div>
          )}
        </>
      )}
      {activeReviewSection === "assets" && (
        <>
          <section className="rounded-lg border border-line bg-surface p-5">
            <h2 className="text-sm font-bold text-ink">
              Source and publication review
            </h2>
            <div className="mt-3 space-y-2 text-xs">
              {(reviewCase.sources || []).map((source) => (
                <div
                  key={source.id}
                  className="flex items-center justify-between border-b border-line py-2"
                >
                  <span className="text-ink">
                    {source.fileName}{" "}
                    <span className="text-muted">({source.sourceType})</span>
                  </span>
                  <span
                    className={
                      source.status === "READY"
                        ? "text-sage"
                        : source.status === "FAILED"
                          ? "text-brick"
                          : "text-ochre"
                    }
                  >
                    {source.status}
                    {source.processingError
                      ? ` · ${source.processingError}`
                      : ""}
                  </span>
                </div>
              ))}
              <Link
                href={`/cases/${reviewCase.id}/assets`}
                className="mt-3 inline-flex rounded bg-pine px-3 py-1.5 font-semibold text-white"
              >
                Review assets and images
              </Link>
            </div>
          </section>
          <section className="rounded-lg border border-line bg-surface p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-bold text-ink">Generated assets</h2>
                <p className="mt-1 text-xs text-muted">
                  {reviewCase.assets.length} assets currently attached to this
                  case.
                </p>
              </div>
              <Link
                href={`/cases/${reviewCase.id}/assets`}
                className="inline-flex items-center justify-center rounded bg-pine px-3 py-2 text-xs font-semibold text-white hover:bg-pine-dark"
              >
                Review and approve assets
              </Link>
            </div>
            <div className="mt-3 space-y-2">
              {reviewCase.assets.map((asset) => (
                <div
                  key={asset.id}
                  className="flex items-center justify-between rounded border border-line bg-paper px-3 py-2 text-xs"
                >
                  <span className="font-medium text-ink">
                    {asset.channelName}
                  </span>
                  <span
                    className={
                      asset.status === "REVIEW" ? "text-ochre" : "text-muted"
                    }
                  >
                    {asset.status}
                    {asset.validationWarnings?.length
                      ? ` · ${asset.validationWarnings.length} validation warning(s)`
                      : ""}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
