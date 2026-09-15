import { createWorker } from "tesseract.js";
import OpenAI from "openai";
import path from "node:path";
import { DEFAULT_IMAGE_SAFETY_PROMPT } from "@/lib/image-prompts";

const PII_PATTERNS = [
  /\b\d{10}\b/g,
  /\b[A-Z]{5}\d{4}[A-Z]\b/g,
  /\b\d{4}[ -]?\d{4}[ -]?\d{4}\b/g,
  /\b(?:mr|mrs|ms|dr)\.?\s+[a-z]+(?:\s+[a-z]+){0,2}\b/gi,
  /\b(?:patient|name|dob|phone|mobile|email|mrn|uhid)\s*[:#-]\s*[^\n]{2,}/gi,
];

type Finding = { type: string; detail: string; confidence?: string; region?: { x: number; y: number; width: number; height: number } };

export async function screenImage(buffer: Buffer, mimeType = "image/png", safetyPrompt = DEFAULT_IMAGE_SAFETY_PROMPT) {
  let ocrText = "";
  try {
    const workerPath = path.join(process.cwd(), "node_modules/tesseract.js/src/worker-script/node/index.js");
    const worker = await createWorker("eng", undefined, {
      workerPath,
      errorHandler: () => undefined,
    });
    try {
      const result = await worker.recognize(buffer);
      ocrText = result.data.text || "";
    } finally {
      await worker.terminate();
    }
  } catch (error) {
    if (process.env.IMAGE_SAFETY_REQUIRED === "true") throw new Error(`Image OCR screening failed: ${error instanceof Error ? error.message : "unknown error"}`);
  }

  const findings: Finding[] = PII_PATTERNS.flatMap((pattern) => ocrText.match(pattern) || []).map((match) => ({ type: "ocr_pii", detail: match.slice(0, 120), confidence: "high" }));
  let faceDetected = false;
  const regions: Finding[] = [];
  if (process.env.IMAGE_SAFETY_AI === "true" && process.env.OPENAI_API_KEY) {
    try {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const response = await openai.chat.completions.create({
        model: process.env.IMAGE_SAFETY_AI_MODEL || "gpt-4o",
        response_format: { type: "json_object" },
        messages: [{
          role: "user",
          content: [
            { type: "text", text: safetyPrompt },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${buffer.toString("base64")}`, detail: "high" } },
          ],
        }],
      });
      const result = JSON.parse(response.choices[0]?.message?.content || "{}");
      faceDetected = Boolean(result.faceDetected);
      for (const finding of Array.isArray(result.findings) ? result.findings : []) {
        const normalized = { type: String(finding.type || "vision_finding"), detail: String(finding.detail || "Potentially identifying image content."), confidence: String(finding.confidence || "medium"), region: finding.region };
        findings.push(normalized);
        if (normalized.region) regions.push(normalized);
      }
    } catch (error) {
      if (process.env.IMAGE_SAFETY_REQUIRED === "true") throw new Error(`AI image safety screening failed: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }
  const endpoint = process.env.IMAGE_SAFETY_ENDPOINT;
  if (endpoint) {
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: buffer as unknown as BodyInit });
    if (!response.ok) throw new Error(`Image safety provider failed (${response.status}).`);
    const result = await response.json() as { faceDetected?: boolean; findings?: Finding[] };
    faceDetected = Boolean(result.faceDetected);
    findings.push(...(result.findings || []));
    regions.push(...(result.findings || []).filter((finding) => Boolean(finding.region)));
  }

  return {
    ocrText,
    faceDetected,
    findings,
    regions,
    phiReviewStatus: findings.length || faceDetected ? "FLAGGED" : "PENDING",
  } as const;
}