import express from "express";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { renderClinicalVideo } from "../lib/video-renderer.js";
import { renderClinicalImage } from "./image-renderer.js";

const app = express();
app.use(express.json({ limit: "32kb" }));

const port = Number(process.env.PORT || 8080);
const callbackSecret = process.env.VIDEO_RENDER_CALLBACK_SECRET || "";
const bucket = process.env.R2_BUCKET_NAME || "";
const accountId = (process.env.CLOUDFLARE_ACCOUNT_ID || "").replace(/^https?:\/\//, "").replace(/\/.*$/, "");
const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID || "", secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "" },
  forcePathStyle: true,
});

app.get("/health", (_req, res) => res.status(200).send("ok"));

function authorized(req: express.Request) {
  return req.header("x-render-secret") === process.env.VIDEO_RENDER_SERVICE_SECRET;
}

app.post("/jobs", async (req, res) => {
  if (!authorized(req)) return res.status(401).json({ error: "Unauthorized." });
  const job = req.body as {
    jobId: string; caseId: string; assetId: string; script: string; title: string;
    accent: string; disclaimer?: string; logoUrl?: string; callbackUrl: string;
  };
  if (!job.jobId || !job.assetId || !job.script || !job.callbackUrl) return res.status(400).json({ error: "Invalid render job." });
  await callback(job, { status: "PROCESSING" });
  void processJob(job, true);
  return res.status(202).json({ jobId: job.jobId, status: "PROCESSING" });
});

type ImageJob = {
  jobId: string; caseId: string; organizationId: string; channel: string;
  prompt: string; size: "1024x1024" | "1536x1024" | "1024x1536"; safetyPrompt: string;
  title: string; accent: string; logoUrl?: string; tagline?: string; disclaimer?: string; font?: string;
  generationPromptTemplateId?: string; generationPromptVersion?: number;
  safetyPromptTemplateId?: string; safetyPromptVersion?: number; callbackUrl: string;
};

app.post("/image-jobs", async (req, res) => {
  if (!authorized(req)) return res.status(401).json({ error: "Unauthorized." });
  const job = req.body as ImageJob;
  if (!job.jobId || !job.caseId || !job.organizationId || !job.channel || !job.prompt || !job.safetyPrompt || !job.callbackUrl) {
    return res.status(400).json({ error: "Invalid image generation job." });
  }
  await imageCallback(job, { status: "PROCESSING" });
  void processImageJob(job);
  return res.status(202).json({ jobId: job.jobId, status: "PROCESSING" });
});

async function callback(job: { callbackUrl: string; assetId: string }, body: Record<string, unknown>) {
  await fetch(job.callbackUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Render-Secret": callbackSecret },
    body: JSON.stringify({ assetId: job.assetId, ...body }),
  });
}

async function imageCallback(job: ImageJob, body: Record<string, unknown>) {
  const response = await fetch(job.callbackUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Render-Secret": callbackSecret },
    body: JSON.stringify({ jobId: job.jobId, caseId: job.caseId, organizationId: job.organizationId, channel: job.channel, ...body }),
  });
  if (!response.ok) throw new Error(`Image callback failed (${response.status}): ${(await response.text()).slice(0, 180)}`);
}

async function processImageJob(job: ImageJob) {
  try {
    const rendered = await renderClinicalImage(job);
    const r2Key = `${job.organizationId}/images/${job.caseId}/${job.channel}-${job.jobId}.png`;
    await r2.send(new PutObjectCommand({ Bucket: bucket, Key: r2Key, Body: rendered.buffer, ContentType: "image/png" }));
    await imageCallback(job, {
      status: "COMPLETED",
      r2Key,
      faceDetected: rendered.faceDetected,
      findings: rendered.findings,
      generationPromptTemplateId: job.generationPromptTemplateId,
      generationPromptVersion: job.generationPromptVersion,
      safetyPromptTemplateId: job.safetyPromptTemplateId,
      safetyPromptVersion: job.safetyPromptVersion,
    });
  } catch (error) {
    await imageCallback(job, { status: "FAILED", error: error instanceof Error ? error.message : String(error) }).catch(() => undefined);
  }
}

async function processJob(job: { jobId: string; caseId: string; assetId: string; script: string; title: string; accent: string; disclaimer?: string; logoUrl?: string; callbackUrl: string }, processingAlreadyReported = false) {
  try {
    if (!processingAlreadyReported) await callback(job, { status: "PROCESSING" });
    const rendered = await renderClinicalVideo({ script: job.script, title: job.title, accent: job.accent, disclaimer: job.disclaimer, logoUrl: job.logoUrl });
    const r2Key = `${process.env.RENDER_ORGANIZATION_PREFIX || "rendered"}/videos/${job.caseId}/${job.assetId}-${Date.now()}.mp4`;
    await r2.send(new PutObjectCommand({ Bucket: bucket, Key: r2Key, Body: rendered.buffer, ContentType: rendered.mimeType }));
    await callback(job, { status: "READY", videoR2Key: r2Key, durationSeconds: rendered.durationSeconds });
  } catch (error) {
    await callback(job, { status: "FAILED", error: error instanceof Error ? error.message : String(error) });
  }
}

app.listen(port, () => console.log(`Video render service listening on ${port}`));
