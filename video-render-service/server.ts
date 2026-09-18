import express from "express";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { renderClinicalVideo } from "../lib/video-renderer.js";
import { renderClinicalImage, screenUploadedClinicalImage } from "./image-renderer.js";
import nodemailer from "nodemailer";

const app = express();
app.use(express.json({ limit: "16mb" }));

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

app.use((error: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!error) return next();
  const message = error instanceof Error ? error.message : String(error);
  const status = typeof error === "object" && error && "status" in error && typeof error.status === "number" ? error.status : 400;
  return res.status(status).json({ error: message || "Invalid request body." });
});

function authorized(req: express.Request) {
  return req.header("x-render-secret") === process.env.VIDEO_RENDER_SERVICE_SECRET;
}

function emailAuthorized(req: express.Request) {
  return Boolean(process.env.EMAIL_SERVICE_SECRET) && req.header("x-email-service-secret") === process.env.EMAIL_SERVICE_SECRET;
}

function formatError(error: unknown) {
  if (!(error instanceof Error)) return String(error);
  const cause = (error as Error & { cause?: unknown }).cause;
  if (cause instanceof Error) return `${error.message}: ${cause.message}`;
  if (cause && typeof cause === "object") return `${error.message}: ${JSON.stringify(cause)}`;
  return error.message;
}

app.post("/jobs", async (req, res) => {
  if (!authorized(req)) return res.status(401).json({ error: "Unauthorized." });
  const job = req.body as {
    jobId: string; caseId: string; assetId: string; organizationId: string; script: string; title: string;
    accent: string; disclaimer?: string; logoUrl?: string; callbackUrl: string;
  };
  if (!job.jobId || !job.assetId || !job.organizationId || !job.script || !job.callbackUrl) return res.status(400).json({ error: "Invalid render job." });
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
  try {
    if (!authorized(req)) return res.status(401).json({ error: "Unauthorized." });
    const job = req.body as ImageJob;
    if (!job.jobId || !job.caseId || !job.organizationId || !job.channel || !job.prompt || !job.safetyPrompt || !job.callbackUrl) {
      return res.status(400).json({ error: "Invalid image generation job." });
    }
    const result = await processImageJob(job);
    return res.status(200).json({ jobId: job.jobId, status: "COMPLETED", ...result });
  } catch (error) {
    return res.status(502).json({ status: "FAILED", error: formatError(error) });
  }
});

app.post("/image-screen", async (req, res) => {
  try {
    if (!authorized(req)) return res.status(401).json({ error: "Unauthorized." });
    const body = req.body as { imageBase64: string; mimeType: string; safetyPrompt: string };
    if (!body.imageBase64 || !body.mimeType || !body.safetyPrompt) return res.status(400).json({ error: "Invalid image screening request." });
    const result = await screenUploadedClinicalImage({ buffer: Buffer.from(body.imageBase64, "base64"), mimeType: body.mimeType, safetyPrompt: body.safetyPrompt });
    return res.status(200).json({ status: "COMPLETED", ...result });
  } catch (error) {
    return res.status(502).json({ status: "FAILED", error: formatError(error) });
  }
});

async function callback(job: { callbackUrl: string; assetId: string }, body: Record<string, unknown>) {
  await fetch(job.callbackUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Render-Secret": callbackSecret },
    body: JSON.stringify({ assetId: job.assetId, ...body }),
  });
}

async function processImageJob(job: ImageJob) {
  const rendered = await renderClinicalImage(job);
  const r2Key = `${job.organizationId}/images/${job.caseId}/${job.channel}-${job.jobId}.png`;
  await r2.send(new PutObjectCommand({ Bucket: bucket, Key: r2Key, Body: rendered.buffer, ContentType: "image/png" }));
  return {
    r2Key,
    faceDetected: rendered.faceDetected,
    findings: rendered.findings,
    generationPromptTemplateId: job.generationPromptTemplateId,
    generationPromptVersion: job.generationPromptVersion,
    safetyPromptTemplateId: job.safetyPromptTemplateId,
    safetyPromptVersion: job.safetyPromptVersion,
  };
}

async function processJob(job: { jobId: string; caseId: string; assetId: string; organizationId: string; script: string; title: string; accent: string; disclaimer?: string; logoUrl?: string; callbackUrl: string }, processingAlreadyReported = false) {
  try {
    if (!processingAlreadyReported) await callback(job, { status: "PROCESSING" });
    const rendered = await renderClinicalVideo({ script: job.script, title: job.title, accent: job.accent, disclaimer: job.disclaimer, logoUrl: job.logoUrl });
    const r2Key = `${job.organizationId}/videos/${job.caseId}/${job.assetId}-${Date.now()}.mp4`;
    await r2.send(new PutObjectCommand({ Bucket: bucket, Key: r2Key, Body: rendered.buffer, ContentType: rendered.mimeType }));
    await callback(job, { status: "READY", videoR2Key: r2Key, durationSeconds: rendered.durationSeconds });
  } catch (error) {
    await callback(job, { status: "FAILED", error: error instanceof Error ? error.message : String(error) });
  }
}

app.listen(port, () => console.log(`Video render service listening on ${port}`));

app.post("/email/send", async (req, res) => {
  if (!emailAuthorized(req)) return res.status(401).json({ error: "Unauthorized." });
  const body = req.body as { to?: string | string[]; subject?: string; html?: string; text?: string; from?: string };
  if (!body.to || !body.subject || (!body.html && !body.text)) return res.status(400).json({ error: "to, subject, and html or text are required." });
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE || "false").toLowerCase() === "true",
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
    });
    const info = await transporter.sendMail({ from: body.from || process.env.SMTP_FROM, to: body.to, subject: body.subject, html: body.html, text: body.text });
    return res.json({ sent: true, messageId: info.messageId });
  } catch (error) {
    console.error("SMTP delivery failed:", error);
    return res.status(502).json({ error: error instanceof Error ? error.message : "SMTP delivery failed." });
  }
});
