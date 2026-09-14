"use client";

import { useState } from "react";
import { RefreshCw, Pencil, CheckCircle2, Save, X, Send } from "lucide-react";
import StatusTag, { StatusTone } from "@/components/ui/StatusTag";

interface AssetActionsPanelProps {
  caseId: string;
  asset: {
    id: string;
    channelKey: string;
    channelName: string;
    outputType: string | null;
    status: string;
    version: number;
    content: any;
  };
}

const STATUS_TONE: Record<string, StatusTone> = {
  DRAFT: "muted",
  REVIEW: "ochre",
  APPROVED: "sage",
  SCHEDULED: "pine",
  EXPORTED: "pine",
  PUBLISHED: "pine",
};

/**
 * RFP §17 — "Regenerate only one platform output", independent per-asset
 * approval, edit/expand/shorten. Every action here calls
 * PATCH /api/cases/[id]/assets/[assetId] and only ever touches this one
 * asset row, never siblings for other channels.
 */
export default function AssetActionsPanel({ caseId, asset }: AssetActionsPanelProps) {
  const [content, setContent] = useState(asset.content);
  const [status, setStatus] = useState(asset.status);
  const [version, setVersion] = useState(asset.version);
  const [isEditing, setIsEditing] = useState(false);
  const [draftText, setDraftText] = useState(JSON.stringify(asset.content, null, 2));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publishPlatform, setPublishPlatform] = useState("linkedin");
  const [scheduledAt, setScheduledAt] = useState("");
  const [publicationMessage, setPublicationMessage] = useState<string | null>(null);

  const callAction = async (action: "regenerate" | "approve" | "manual_edit", body: any = {}) => {
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/cases/${caseId}/assets/${asset.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...body }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Action failed.");
        return;
      }
      setContent(json.asset.content);
      setStatus(json.asset.status);
      setVersion(json.asset.version);
      setDraftText(JSON.stringify(json.asset.content, null, 2));
      setIsEditing(false);
    } catch (err: any) {
      setError(err.message || "Action failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const saveEdit = () => {
    try {
      const parsed = JSON.parse(draftText);
      callAction("manual_edit", { content: parsed });
    } catch {
      callAction("manual_edit", { content: { raw_text: draftText } });
    }
  };

  const queuePublication = async () => {
    setPublicationMessage(null);
    const response = await fetch(`/api/assets/${asset.id}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform: publishPlatform, scheduledAt: scheduledAt || null }),
    });
    const data = await response.json();
    if (!response.ok) return setPublicationMessage(data.error || "Unable to queue publication.");
    setPublicationMessage(data.connectorConfigured ? "Publication queued for the configured connector." : "Publication queued; configure the connector before processing it.");
  };

  return (
    <div className="card card-accent border-l-pine p-6 space-y-4">
      <div className="flex items-center justify-between border-b border-line pb-3">
        <div className="flex items-center gap-2">
          <span className="rounded bg-pine-tint px-2 py-1 text-xs font-medium text-pine-dark">
            {asset.channelName || asset.channelKey}
          </span>
          <span className="text-[11px] font-mono text-muted">v{version}</span>
        </div>
        <StatusTag tone={STATUS_TONE[status] || "muted"}>{status}</StatusTag>
      </div>

      {error && <div className="text-xs text-brick bg-brick-tint border border-brick/30 rounded p-2">{error}</div>}
      {publicationMessage && <div className="text-xs text-pine bg-pine-tint border border-pine/30 rounded p-2">{publicationMessage}</div>}

      {isEditing ? (
        <textarea
          value={draftText}
          onChange={(e) => setDraftText(e.target.value)}
          className="w-full h-48 rounded bg-paper p-4 font-mono text-xs leading-relaxed text-ink border border-line focus:border-pine focus:outline-none"
        />
      ) : (
        <div className="rounded bg-paper p-4 font-mono text-xs leading-relaxed text-ink border border-line whitespace-pre-wrap overflow-x-auto max-h-64 overflow-y-auto">
          {typeof content === "object" ? JSON.stringify(content, null, 2) : String(content)}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {isEditing ? (
          <>
            <button
              disabled={isSubmitting}
              onClick={saveEdit}
              className="flex items-center gap-1 rounded bg-pine px-3 py-1.5 text-[11px] font-medium text-white hover:bg-pine-dark disabled:opacity-50"
            >
              <Save className="h-3 w-3" /> Save edit
            </button>
            <button
              onClick={() => { setIsEditing(false); setDraftText(JSON.stringify(content, null, 2)); }}
              className="flex items-center gap-1 rounded border border-line bg-surface px-3 py-1.5 text-[11px] font-medium text-ink hover:border-pine"
            >
              <X className="h-3 w-3" /> Cancel
            </button>
          </>
        ) : (
          <>
            <button
              disabled={isSubmitting}
              onClick={() => callAction("regenerate")}
              className="flex items-center gap-1 rounded border border-line bg-surface px-3 py-1.5 text-[11px] font-medium text-ink hover:border-pine disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${isSubmitting ? "animate-spin" : ""}`} /> Regenerate this only
            </button>
            <button
              onClick={() => setIsEditing(true)}
              className="flex items-center gap-1 rounded border border-line bg-surface px-3 py-1.5 text-[11px] font-medium text-ink hover:border-pine"
            >
              <Pencil className="h-3 w-3" /> Edit
            </button>
            {status !== "APPROVED" && (
              <button
                disabled={isSubmitting}
                onClick={() => callAction("approve")}
                className="flex items-center gap-1 rounded bg-sage px-3 py-1.5 text-[11px] font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                <CheckCircle2 className="h-3 w-3" /> Approve this asset
              </button>
            )}
            {status === "APPROVED" && (
              <div className="flex w-full flex-wrap items-end gap-2 border-t border-line pt-3">
                <label className="text-[10px] text-muted">Platform<select value={publishPlatform} onChange={(event) => setPublishPlatform(event.target.value)} className="ml-1 rounded border border-line bg-surface px-2 py-1.5 text-[11px] text-ink"><option value="linkedin">LinkedIn</option><option value="facebook">Facebook</option><option value="instagram">Instagram</option><option value="x">X</option><option value="youtube">YouTube</option><option value="cms">CMS</option></select></label>
                <label className="text-[10px] text-muted">Schedule<input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} className="ml-1 rounded border border-line bg-surface px-2 py-1.5 text-[11px] text-ink" /></label>
                <button disabled={isSubmitting} onClick={queuePublication} className="flex items-center gap-1 rounded bg-pine px-3 py-1.5 text-[11px] font-medium text-white disabled:opacity-50"><Send className="h-3 w-3" /> Queue publication</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
