import crypto from "node:crypto";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export type VideoRenderJob = {
  jobId: string;
  caseId: string;
  assetId: string;
  organizationId: string;
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

  const request = new Request(`${serviceUrl}/jobs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Render-Secret": process.env.VIDEO_RENDER_SERVICE_SECRET || "",
    },
    body: JSON.stringify({ ...input, jobId, callbackUrl }),
  });
  let serviceBinding: { fetch(request: Request): Promise<Response> } | undefined;
  try {
    const runtimeEnv = getCloudflareContext({ async: false }).env as typeof globalThis & {
      VIDEO_RENDER_SERVICE?: { fetch(request: Request): Promise<Response> };
    };
    serviceBinding = runtimeEnv.VIDEO_RENDER_SERVICE;
  } catch {
    // Use the public URL outside the Worker runtime.
  }
  const response = serviceBinding ? await serviceBinding.fetch(request) : await fetch(request);
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 180);
    throw new Error(`Video rendering service rejected the job (${response.status}) at ${serviceUrl}/jobs: ${detail}`);
  }
  return { jobId };
}
