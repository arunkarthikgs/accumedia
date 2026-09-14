"use client";

import { useEffect, useState } from "react";
import { ImagePlus, Upload, ShieldCheck, ShieldAlert, RefreshCw, Trash2, Loader2 } from "lucide-react";

interface ImageAssetData {
  id: string;
  channel: string;
  sourceType: string;
  storageUrl: string | null;
  publicUseApproved: boolean;
  consentConfirmed: boolean;
  phiReviewStatus: string;
}

const CHANNELS = [
  { id: "linkedin_cover", label: "LinkedIn cover", description: "Wide editorial image for a LinkedIn article." },
  { id: "linkedin_carousel", label: "LinkedIn carousel", description: "Square educational card for a swipeable carousel." },
  { id: "facebook_post", label: "Facebook post", description: "Square image for a patient or family-facing post." },
  { id: "ig_reels", label: "Instagram / Reels", description: "Portrait image for Instagram or short-form video cover art." },
  { id: "x_image", label: "X image", description: "Wide supporting image for an X post or thread." },
  { id: "yt_thumbnail", label: "YouTube thumbnail", description: "Wide thumbnail for YouTube or video content." },
  { id: "blog_featured", label: "Blog featured image", description: "Wide hero image for the SEO blog article." },
];

/**
 * RFP §14-15 — image generation per channel aspect ratio, doctor uploads
 * with explicit consent capture, and a public-use toggle that can never be
 * turned on without consent confirmed. Nothing here auto-publishes.
 */
export default function ImagesPanel({ caseId, mccrApproved }: { caseId: string; mccrApproved: boolean }) {
  const [images, setImages] = useState<ImageAssetData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [genChannel, setGenChannel] = useState(CHANNELS[0].id);
  const [isGenerating, setIsGenerating] = useState(false);
  const [uploadChannel, setUploadChannel] = useState(CHANNELS[0].id);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/cases/${caseId}/images`);
      const data = await res.json();
      setImages(data.images || []);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [caseId]);

  const generate = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/cases/${caseId}/images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: genChannel }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error); return; }
      setImages((prev) => [json.image, ...prev]);
    } finally {
      setIsGenerating(false);
    }
  };

  const upload = async () => {
    if (!uploadFile) return;
    setIsUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("image", uploadFile);
      form.append("channel", uploadChannel);
      form.append("consentConfirmed", String(consentConfirmed));
      form.append("publicUseApproved", "false");
      const res = await fetch(`/api/cases/${caseId}/images/upload`, { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) { setError(json.error); return; }
      setImages((prev) => [json.image, ...prev]);
      setUploadFile(null);
      setConsentConfirmed(false);
    } finally {
      setIsUploading(false);
    }
  };

  const togglePublicUse = async (image: ImageAssetData) => {
    if (!image.publicUseApproved && !image.consentConfirmed) {
      setError("Confirm consent / de-identification before approving this image for public use.");
      return;
    }
    const res = await fetch(`/api/cases/${caseId}/images/${image.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ publicUseApproved: !image.publicUseApproved }),
    });
    const json = await res.json();
    if (res.ok) {
      setImages((prev) => prev.map((i) => (i.id === image.id ? json.image : i)));
    } else {
      setError(json.error);
    }
  };

  const regenerate = async (image: ImageAssetData) => {
    const res = await fetch(`/api/cases/${caseId}/images/${image.id}`, { method: "POST" });
    const json = await res.json();
    if (res.ok) {
      setImages((prev) => [json.image, ...prev.filter((i) => i.id !== image.id)]);
    } else {
      setError(json.error);
    }
  };

  const remove = async (imageId: string) => {
    await fetch(`/api/cases/${caseId}/images/${imageId}`, { method: "DELETE" });
    setImages((prev) => prev.filter((i) => i.id !== imageId));
  };

  return (
    <div className="card p-6 space-y-5">
      <div className="flex items-center gap-2 border-b border-line pb-3">
        <ImagePlus className="h-4 w-4 text-pine" />
        <h3 className="font-serif text-sm font-semibold text-ink">Image assets</h3>
      </div>

      {error && <div className="text-xs text-brick bg-brick-tint border border-brick/30 rounded p-2">{error}</div>}

      {!mccrApproved && (
        <div className="text-xs text-ochre bg-ochre-tint border border-ochre/30 rounded p-2">
          AI image generation unlocks once this case's clinical record is approved. Doctor uploads are still available below.
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="block text-[10px] text-muted uppercase tracking-wide mb-1">Generate for channel</label>
          <select value={genChannel} onChange={(e) => setGenChannel(e.target.value)} className="rounded border border-line px-2 py-1.5 text-xs bg-surface">
            {CHANNELS.map((channel) => <option key={channel.id} value={channel.id}>{channel.label}</option>)}
          </select>
          <p className="mt-1 max-w-xs text-[10px] leading-4 text-muted">{CHANNELS.find((channel) => channel.id === genChannel)?.description}</p>
        </div>
        <button
          disabled={!mccrApproved || isGenerating}
          onClick={generate}
          className="flex items-center gap-1 rounded bg-pine px-3 py-1.5 text-[11px] font-medium text-white hover:bg-pine-dark disabled:opacity-40"
        >
          {isGenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <ImagePlus className="h-3 w-3" />}
          {isGenerating ? "Generating image, please wait…" : "Generate AI image"}
        </button>
      </div>

      <div className="rounded border border-line p-3 space-y-2 bg-paper">
        <div className="text-[10px] text-muted uppercase tracking-wide">Upload a clinical / doctor photo</div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={uploadChannel} onChange={(e) => setUploadChannel(e.target.value)} className="rounded border border-line px-2 py-1.5 text-xs bg-surface">
            {CHANNELS.map((channel) => <option key={channel.id} value={channel.id}>{channel.label}</option>)}
          </select>
          <input type="file" accept="image/*" onChange={(e) => setUploadFile(e.target.files?.[0] || null)} className="text-xs" />
        </div>
        <label className="flex items-start gap-2 text-[11px] text-ink">
          <input type="checkbox" checked={consentConfirmed} onChange={(e) => setConsentConfirmed(e.target.checked)} className="mt-0.5 accent-pine" />
          I confirm patient-identifying information has been removed and appropriate consent exists for this image, where required.
        </label>
        <button
          disabled={!uploadFile || isUploading}
          onClick={upload}
          className="flex items-center gap-1 rounded border border-line bg-surface px-3 py-1.5 text-[11px] font-medium text-ink hover:border-pine disabled:opacity-40"
        >
          <Upload className="h-3 w-3" /> Upload
        </button>
      </div>

      {isLoading ? (
        <div className="text-xs text-muted">Loading images…</div>
      ) : images.length === 0 ? (
        <div className="text-xs text-muted">No images yet for this case.</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {images.map((img) => (
            <div key={img.id} className="rounded border border-line overflow-hidden bg-surface">
              <div className="aspect-video bg-paper flex items-center justify-center text-muted text-[10px]">
                {img.storageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/cases/${caseId}/images/${img.id}/preview`} alt={img.channel} className="w-full h-full object-cover" />
                ) : (
                  "no preview"
                )}
              </div>
              <div className="p-2 space-y-1.5">
                <div className="text-[10px] font-medium text-ink">{CHANNELS.find((channel) => channel.id === img.channel)?.label || img.channel}</div>
                <div className="text-[10px] leading-4 text-muted">{CHANNELS.find((channel) => channel.id === img.channel)?.description}</div>
                <div className="flex items-center gap-1 text-[10px]">
                  <span className={img.phiReviewStatus === "CLEAR" ? "text-sage" : img.phiReviewStatus === "FLAGGED" ? "text-brick" : "text-ochre"}>
                    PHI review: {img.phiReviewStatus}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-[10px]">
                  {img.publicUseApproved ? (
                    <span className="flex items-center gap-1 text-sage"><ShieldCheck className="h-3 w-3" /> Public use approved</span>
                  ) : (
                    <span className="flex items-center gap-1 text-muted"><ShieldAlert className="h-3 w-3" /> Not approved</span>
                  )}
                </div>
                {img.sourceType === "doctor_uploaded" && img.phiReviewStatus === "PENDING" && (
                  <div className="flex gap-1 pt-1">
                    <button onClick={async () => { const res = await fetch(`/api/cases/${caseId}/images/${img.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phiReviewStatus: "CLEAR" }) }); const data = await res.json(); if (res.ok) setImages((prev) => prev.map((item) => item.id === img.id ? data.image : item)); else setError(data.error); }} className="flex-1 rounded border border-sage/30 bg-sage-tint px-1.5 py-1 text-[10px] font-medium text-sage">Mark clear</button>
                    <button onClick={async () => { const res = await fetch(`/api/cases/${caseId}/images/${img.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phiReviewStatus: "FLAGGED" }) }); const data = await res.json(); if (res.ok) setImages((prev) => prev.map((item) => item.id === img.id ? data.image : item)); else setError(data.error); }} className="flex-1 rounded border border-brick/30 bg-brick-tint px-1.5 py-1 text-[10px] font-medium text-brick">Flag</button>
                  </div>
                )}
                <div className="flex items-center gap-1.5 pt-1">
                  <button
                    onClick={() => togglePublicUse(img)}
                    className="flex-1 rounded border border-line px-1.5 py-1 text-[10px] font-medium text-ink hover:border-pine"
                  >
                    {img.publicUseApproved ? "Revoke" : "Approve"}
                  </button>
                  {img.sourceType === "ai_generated" && (
                    <button onClick={() => regenerate(img)} className="rounded border border-line p-1 text-muted hover:border-pine hover:text-pine">
                      <RefreshCw className="h-3 w-3" />
                    </button>
                  )}
                  <button onClick={() => remove(img.id)} className="rounded border border-line p-1 text-brick hover:bg-brick-tint">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
