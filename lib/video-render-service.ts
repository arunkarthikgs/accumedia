import crypto from "node:crypto";

export type VideoRenderJob = {
  jobId: string;
  caseId: string;
  assetId: string;
  script: string;
  title: string;
  accent: string;
  disclaimer?: string | null;
  logoUrl?: string | null;
  callbackUrl: string;
};

function getServiceUrl() {
  return (process.env.VIDEO_RENDER_SERVICE_URL || "").replace(/\/+$/, "");
}

export async function submitVideoRenderJob(input: Omit<VideoRenderJob, "jobId" | "callbackUrl">, callbackOrigin: string) {
  const serviceUrl = getServiceUrl();
  if (!serviceUrl) {
    throw new Error("Video rendering is not configured. Set VIDEO_RENDER_SERVICE_URL to a reachable ffmpeg service (Cloudflare Container or AWS EC2).");
  }

  const jobId = crypto.randomUUID();
  const callbackUrl = `${callbackOrigin.replace(/\/+$/, "")}/api/internal/video-render/callback`;
  if (!callbackUrl.startsWith("https://")) {
    throw new Error("Video rendering callback requires NEXT_PUBLIC_APP_URL to be configured with HTTPS.");
  }

  const response = await fetch(`${serviceUrl}/jobs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Render-Secret": process.env.VIDEO_RENDER_SERVICE_SECRET || "",
    },
    body: JSON.stringify({ ...input, jobId, callbackUrl }),
  });
  if (!response.ok) {
    throw new Error(`Video rendering service rejected the job (${response.status}).`);
  }
  return { jobId };
}
