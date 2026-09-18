import { getCloudflareContext } from "@opennextjs/cloudflare";

export type ImageRenderJob = {
  jobId: string;
  caseId: string;
  organizationId: string;
  channel: string;
  prompt: string;
  size: "1024x1024" | "1536x1024" | "1024x1536";
  safetyPrompt: string;
  title: string;
  accent: string;
  logoUrl?: string | null;
  tagline?: string | null;
  disclaimer?: string | null;
  font?: string | null;
  generationPromptTemplateId?: string | null;
  generationPromptVersion?: number;
  safetyPromptTemplateId?: string | null;
  safetyPromptVersion?: number;
  callbackUrl: string;
};

export type ImageRenderResult = {
  status: "COMPLETED" | "FAILED";
  r2Key?: string;
  faceDetected?: boolean;
  findings?: Array<{ type?: string; detail?: string; confidence?: string; region?: unknown }>;
  generationPromptTemplateId?: string;
  generationPromptVersion?: number;
  safetyPromptTemplateId?: string;
  safetyPromptVersion?: number;
  error?: string;
};

export async function submitImageRenderJob(job: ImageRenderJob): Promise<ImageRenderResult> {
  const serviceUrl = (process.env.VIDEO_RENDER_SERVICE_URL || "https://accumedia-video-renderer.invalid").replace(/\/+$/, "");
  const request = new Request(`${serviceUrl}/image-jobs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Render-Secret": process.env.VIDEO_RENDER_SERVICE_SECRET || "",
    },
    body: JSON.stringify(job),
  });

  let serviceBinding: { fetch(request: Request): Promise<Response> } | undefined;
  try {
    const runtimeEnv = getCloudflareContext({ async: false }).env as typeof globalThis & {
      VIDEO_RENDER_SERVICE?: { fetch(request: Request): Promise<Response> };
    };
    serviceBinding = runtimeEnv.VIDEO_RENDER_SERVICE;
  } catch {
    // Use the configured public URL outside the Worker runtime.
  }
  if (!serviceBinding && !process.env.VIDEO_RENDER_SERVICE_URL) {
    throw new Error("Image rendering is not configured. Set VIDEO_RENDER_SERVICE_URL or bind VIDEO_RENDER_SERVICE.");
  }
  const response = serviceBinding ? await serviceBinding.fetch(request) : await fetch(request);
  const responseText = await response.text();
  const parsed: ImageRenderResult = responseText ? JSON.parse(responseText) as ImageRenderResult : { status: "FAILED", error: "Empty image renderer response." };
  if (!response.ok) {
    const detail = responseText.slice(0, 180);
    throw new Error(`Image rendering service rejected the job (${response.status}): ${detail}`);
  }
  if (parsed.status !== "COMPLETED" || !parsed.r2Key) throw new Error(parsed.error || "Image renderer did not return a completed image.");
  return parsed;
}

export async function screenUploadedImage(input: { buffer: Buffer; mimeType: string; safetyPrompt: string }) {
  const serviceUrl = (process.env.VIDEO_RENDER_SERVICE_URL || "https://accumedia-video-renderer.invalid").replace(/\/+$/, "");
  const request = new Request(`${serviceUrl}/image-screen`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Render-Secret": process.env.VIDEO_RENDER_SERVICE_SECRET || "" },
    body: JSON.stringify({ imageBase64: input.buffer.toString("base64"), mimeType: input.mimeType, safetyPrompt: input.safetyPrompt }),
  });
  let serviceBinding: { fetch(request: Request): Promise<Response> } | undefined;
  try {
    const runtimeEnv = getCloudflareContext({ async: false }).env as typeof globalThis & { VIDEO_RENDER_SERVICE?: { fetch(request: Request): Promise<Response> } };
    serviceBinding = runtimeEnv.VIDEO_RENDER_SERVICE;
  } catch {}
  if (!serviceBinding && !process.env.VIDEO_RENDER_SERVICE_URL) throw new Error("Image screening is not configured.");
  const response = serviceBinding ? await serviceBinding.fetch(request) : await fetch(request);
  const text = await response.text();
  const parsed = text ? JSON.parse(text) : {};
  if (!response.ok || parsed.status === "FAILED") throw new Error(parsed.error || `Image screening failed (${response.status}).`);
  return parsed as { faceDetected: boolean; findings: Array<{ type?: string; detail?: string; confidence?: string; region?: unknown }> };
}
