"use client";

import { useState } from "react";
import {
  RefreshCw,
  Pencil,
  CheckCircle2,
  Save,
  X,
  Send,
  Eye,
  Video,
  Loader2,
  History,
} from "lucide-react";
import StatusTag, { StatusTone } from "@/components/ui/StatusTag";
import { formatDateTime } from "@/lib/date-format";

interface AssetActionsPanelProps {
  caseId: string;
  asset: {
    id: string;
    channelKey: string;
    channelName: string;
    outputType: string | null;
    variant?: string | null;
    status: string;
    version: number;
    content: any;
    videoR2Key?: string | null;
    videoDurationSeconds?: number | null;
    videoStatus?: string | null;
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

function defaultPlatform(asset: AssetActionsPanelProps["asset"]) {
  if (
    asset.outputType === "FACEBOOK_POST" ||
    asset.channelKey === "FACEBOOK_POST"
  )
    return "facebook";
  if (asset.outputType === "X_POST" || asset.channelKey === "X_POST")
    return "x";
  if (
    asset.outputType === "YOUTUBE_REELS_METADATA" ||
    asset.channelKey === "YOUTUBE_REELS"
  )
    return "youtube";
  if (asset.outputType === "SEO_BLOG" || asset.channelKey === "SEO_BLOG")
    return "cms";
  return "linkedin";
}

function previewText(content: any) {
  if (typeof content === "string") return content;
  if (!content || typeof content !== "object") return "";
  return Object.entries(content)
    .filter(
      ([key, value]) =>
        ![
          "image_brief",
          "carousel_cards",
          "hashtags",
          "keywords",
          "faq_section",
          "suggested_headings",
        ].includes(key) && value,
    )
    .map(
      ([key, value]) =>
        `${key.replace(/_/g, " ")}: ${Array.isArray(value) ? value.join(" • ") : typeof value === "object" ? JSON.stringify(value) : value}`,
    )
    .join("\n\n");
}

function readableDraft(content: any) {
  if (typeof content === "string") return content;
  if (!content || typeof content !== "object") return "";
  return Object.entries(content)
    .filter(
      ([key, value]) =>
        value !== null &&
        value !== undefined &&
        value !== "" &&
        ![
          "image_brief",
          "carousel_cards",
          "hashtags",
          "keywords",
          "faq_section",
          "suggested_headings",
        ].includes(key),
    )
    .map(
      ([key, value]) =>
        `${key.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())}\n${
          Array.isArray(value)
            ? value.join("\n")
            : typeof value === "object"
              ? Object.entries(value as Record<string, unknown>)
                  .map(
                    ([childKey, childValue]) =>
                      `${childKey.replace(/_/g, " ")}: ${childValue}`,
                  )
                  .join("\n")
              : String(value)
        }`,
    )
    .join("\n\n");
}

/**
 * RFP §17 — "Regenerate only one platform output", independent per-asset
 * approval, edit/expand/shorten. Every action here calls
 * PATCH /api/cases/[id]/assets/[assetId] and only ever touches this one
 * asset row, never siblings for other channels.
 */
export default function AssetActionsPanel({
  caseId,
  asset,
}: AssetActionsPanelProps) {
  const [content, setContent] = useState(asset.content);
  const [status, setStatus] = useState(asset.status);
  const [version, setVersion] = useState(asset.version);
  const [isEditing, setIsEditing] = useState(false);
  const [draftText, setDraftText] = useState(readableDraft(asset.content));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publishPlatform, setPublishPlatform] = useState(
    defaultPlatform(asset),
  );
  const [scheduledAt, setScheduledAt] = useState("");
  const [publicationMessage, setPublicationMessage] = useState<string | null>(
    null,
  );
  const [previewPlatform, setPreviewPlatform] = useState(
    defaultPlatform(asset),
  );
  const [videoUrl, setVideoUrl] = useState<string | null>(
    asset.videoR2Key ? `/api/cases/${caseId}/assets/${asset.id}/video` : null,
  );
  const [isRenderingVideo, setIsRenderingVideo] = useState(false);
  const [voiceFile, setVoiceFile] = useState<File | null>(null);
  const [versions, setVersions] = useState<
    {
      id: string;
      version: number;
      changeType: string;
      createdAt: string;
      content: unknown;
    }[]
  >([]);
  const [isVersionHistoryOpen, setIsVersionHistoryOpen] = useState(false);
  const [viewingVersionId, setViewingVersionId] = useState<string | null>(null);

  const callAction = async (
    action: "regenerate" | "approve" | "manual_edit",
    body: any = {},
  ) => {
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
      setDraftText(readableDraft(json.asset.content));
      setIsEditing(false);
    } catch (err: any) {
      setError(err.message || "Action failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const saveEdit = () =>
    callAction("manual_edit", { content: { draft_text: draftText } });

  const queuePublication = async () => {
    setPublicationMessage(null);
    const response = await fetch(`/api/assets/${asset.id}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        platform: publishPlatform,
        scheduledAt: scheduledAt || null,
      }),
    });
    const data = await response.json();
    if (!response.ok)
      return setPublicationMessage(
        data.error || "Unable to queue publication.",
      );
    setPublicationMessage(
      data.connectorConfigured
        ? "Publication queued for the configured connector."
        : "Publication queued; configure the connector before processing it.",
    );
  };

  const renderVideo = async () => {
    setIsRenderingVideo(true);
    setError(null);
    const form = new FormData();
    if (voiceFile) form.append("voice", voiceFile);
    const response = await fetch(
      `/api/cases/${caseId}/assets/${asset.id}/render-video`,
      { method: "POST", body: form },
    );
    const data = await response.json();
    setIsRenderingVideo(false);
    if (!response.ok) return setError(data.error || "Video rendering failed.");
    setVideoUrl(
      `/api/cases/${caseId}/assets/${asset.id}/video?ts=${Date.now()}`,
    );
  };

  const loadVersions = async () => {
    const response = await fetch(`/api/cases/${caseId}/assets/${asset.id}`);
    const data = await response.json();
    if (!response.ok)
      return setError(data.error || "Unable to load asset history.");
    setVersions(data.asset?.versions || []);
    setIsVersionHistoryOpen(true);
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

      {asset.outputType === "VIDEO_SCRIPT" && (
        <div className="rounded border border-pine/20 bg-pine-tint p-3 text-xs text-ink">
          <p className="font-semibold text-pine-dark">
            Doctor-narrated clinical education video
            {asset.variant ? ` · ${asset.variant}` : ""}
          </p>
          <p className="mt-1 leading-5 text-muted">
            This script is used for the branded multi-slide MP4. Review it as a
            teleprompter-ready clinical summary before approval and rendering.
          </p>
        </div>
      )}

      {error && (
        <div className="text-xs text-brick bg-brick-tint border border-brick/30 rounded p-2">
          {error}
        </div>
      )}
      {publicationMessage && (
        <div className="text-xs text-pine bg-pine-tint border border-pine/30 rounded p-2">
          {publicationMessage}
        </div>
      )}

      <section className="rounded border border-line bg-surface p-4">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold text-ink">
          <Eye className="h-3.5 w-3.5 text-pine" /> Draft preview
        </h3>
        <div className="mt-3 flex flex-wrap gap-1.5 border-b border-line pb-2">
          {["facebook", "youtube", "linkedin", "instagram"].map((platform) => (
            <button
              key={platform}
              type="button"
              onClick={() => setPreviewPlatform(platform)}
              className={`rounded px-2.5 py-1 text-[10px] font-semibold capitalize ${previewPlatform === platform ? "bg-pine text-white" : "bg-paper text-muted hover:text-ink"}`}
            >
              {platform}
            </button>
          ))}
        </div>
        <div
          className={`mt-3 rounded-lg border border-line p-4 ${previewPlatform === "instagram" ? "mx-auto max-w-xs" : "w-full"} bg-paper`}
        >
          <div className="flex items-center gap-2 border-b border-line pb-3 text-[11px] font-semibold text-ink">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-pine text-white">
              M
            </span>
            <span>Macula Healthcare</span>
            <span className="ml-auto text-[10px] text-muted">
              {previewPlatform === "youtube" ? "Video" : "Draft"}
            </span>
          </div>
          <div className="mt-3 whitespace-pre-wrap text-xs leading-5 text-ink">
            {previewText(content) || "No preview content available yet."}
          </div>
          {content?.image_brief && (
            <div className="mt-3 rounded border border-dashed border-line p-2 text-[10px] text-muted">
              Image concept: {content.image_brief}
            </div>
          )}
          {Array.isArray(content?.hashtags) && (
            <div className="mt-3 text-[10px] text-pine">
              {content.hashtags
                .map((tag: string) => (tag.startsWith("#") ? tag : `#${tag}`))
                .join(" ")}
            </div>
          )}
          <div className="mt-4 flex gap-4 border-t border-line pt-3 text-[10px] text-muted">
            <span>Like</span>
            <span>Comment</span>
            <span>Share</span>
          </div>
        </div>
      </section>

      {asset.outputType === "VIDEO_SCRIPT" && status === "APPROVED" && (
        <section className="rounded border border-line bg-surface p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="flex items-center gap-1.5 text-xs font-semibold text-ink">
                <Video className="h-3.5 w-3.5 text-pine" /> Rendered video
              </h3>
              <p className="mt-1 text-[10px] text-muted">
                Create an MP4 with AI narration and organization branding, or
                upload a doctor voice recording.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="rounded border border-line bg-paper px-2 py-1.5 text-[10px] text-muted">
                Doctor voice
                <input
                  type="file"
                  accept="audio/*"
                  onChange={(event) =>
                    setVoiceFile(event.target.files?.[0] || null)
                  }
                  className="ml-2 max-w-32 text-[10px]"
                />
              </label>
              <button
                type="button"
                onClick={renderVideo}
                disabled={isRenderingVideo}
                className="flex items-center gap-1 rounded bg-pine px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
              >
                {isRenderingVideo ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Video className="h-3 w-3" />
                )}
                {isRenderingVideo ? "Rendering video…" : "Render MP4"}
              </button>
            </div>
          </div>
          {videoUrl && (
            <video
              className="mt-3 w-full rounded border border-line bg-black"
              controls
              src={videoUrl}
            />
          )}
        </section>
      )}

      {isVersionHistoryOpen && (
        <section className="rounded border border-line bg-surface p-4">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold text-ink">
              <History className="h-3.5 w-3.5 text-pine" /> Version history
            </h3>
            <button
              type="button"
              onClick={() => setIsVersionHistoryOpen(false)}
              className="text-[11px] font-semibold text-muted hover:text-ink"
            >
              Close
            </button>
          </div>
          {versions.length === 0 ? (
            <p className="mt-3 text-xs text-muted">
              No earlier versions have been saved.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {versions.map((savedVersion) => (
                <div
                  key={savedVersion.id}
                  className="rounded border border-line bg-paper p-3"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setViewingVersionId((current) =>
                        current === savedVersion.id ? null : savedVersion.id,
                      )
                    }
                    className="flex w-full items-center justify-between gap-3 text-left"
                  >
                    <span className="text-xs font-semibold text-ink">
                      v{savedVersion.version} ·{" "}
                      {savedVersion.changeType.replaceAll("_", " ")}
                    </span>
                    <span className="text-[10px] text-muted">
                      {formatDateTime(savedVersion.createdAt)}
                    </span>
                  </button>
                  {viewingVersionId === savedVersion.id && (
                    <div className="mt-3 border-t border-line pt-3 text-xs leading-6 text-ink whitespace-pre-wrap">
                      {readableDraft(savedVersion.content) ||
                        "No readable draft content available."}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {isEditing ? (
        <textarea
          value={draftText}
          onChange={(e) => setDraftText(e.target.value)}
          className="w-full h-48 rounded bg-paper p-4 font-mono text-xs leading-relaxed text-ink border border-line focus:border-pine focus:outline-none"
        />
      ) : (
        <div className="rounded bg-paper p-4 text-sm leading-7 text-ink border border-line whitespace-pre-wrap max-h-64 overflow-y-auto">
          {readableDraft(content) || "No draft content available."}
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
              onClick={() => {
                setIsEditing(false);
                setDraftText(JSON.stringify(content, null, 2));
              }}
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
              <RefreshCw
                className={`h-3 w-3 ${isSubmitting ? "animate-spin" : ""}`}
              />{" "}
              Regenerate this only
            </button>
            <button
              onClick={() => setIsEditing(true)}
              className="flex items-center gap-1 rounded border border-line bg-surface px-3 py-1.5 text-[11px] font-medium text-ink hover:border-pine"
            >
              <Pencil className="h-3 w-3" /> Edit
            </button>
            <button
              type="button"
              onClick={loadVersions}
              className="flex items-center gap-1 rounded border border-line bg-surface px-3 py-1.5 text-[11px] font-medium text-ink hover:border-pine"
            >
              <History className="h-3 w-3" /> Versions
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
                <label className="text-[10px] text-muted">
                  Platform
                  <select
                    value={publishPlatform}
                    onChange={(event) => setPublishPlatform(event.target.value)}
                    className="ml-1 rounded border border-line bg-surface px-2 py-1.5 text-[11px] text-ink"
                  >
                    <option value="linkedin">LinkedIn</option>
                    <option value="facebook">Facebook</option>
                    <option value="instagram">Instagram</option>
                    <option value="x">X</option>
                    <option value="youtube">YouTube</option>
                    <option value="cms">CMS</option>
                  </select>
                </label>
                <label className="text-[10px] text-muted">
                  Schedule
                  <input
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(event) => setScheduledAt(event.target.value)}
                    className="ml-1 rounded border border-line bg-surface px-2 py-1.5 text-[11px] text-ink"
                  />
                </label>
                <button
                  disabled={isSubmitting}
                  onClick={queuePublication}
                  className="flex items-center gap-1 rounded bg-pine px-3 py-1.5 text-[11px] font-medium text-white disabled:opacity-50"
                >
                  <Send className="h-3 w-3" /> Queue publication
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
