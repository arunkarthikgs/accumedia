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

export async function submitImageRenderJob(job: ImageRenderJob) {
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
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 180);
    throw new Error(`Image rendering service rejected the job (${response.status}): ${detail}`);
  }
}
