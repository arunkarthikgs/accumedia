import { createWorker } from "tesseract.js";

const PII_PATTERNS = [
  /\b\d{10}\b/g,
  /\b[A-Z]{5}\d{4}[A-Z]\b/g,
  /\b\d{4}[ -]?\d{4}[ -]?\d{4}\b/g,
  /\b(?:mr|mrs|ms|dr)\.?\s+[a-z]+(?:\s+[a-z]+){0,2}\b/gi,
  /\b(?:patient|name|dob|phone|mobile|email|mrn|uhid)\s*[:#-]?\s*[^\n]{2,}/gi,
];

export async function screenImage(buffer: Buffer) {
  let ocrText = "";
  try {
    const worker = await createWorker("eng");
    const result = await worker.recognize(buffer);
    ocrText = result.data.text || "";
    await worker.terminate();
  } catch (error) {
    if (process.env.IMAGE_SAFETY_REQUIRED === "true") throw new Error(`Image OCR screening failed: ${error instanceof Error ? error.message : "unknown error"}`);
  }

  const findings = PII_PATTERNS.flatMap((pattern) => ocrText.match(pattern) || []).map((match) => ({ type: "ocr_pii", detail: match.slice(0, 120) }));
  let faceDetected = false;
  const endpoint = process.env.IMAGE_SAFETY_ENDPOINT;
  if (endpoint) {
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: buffer as unknown as BodyInit });
    if (!response.ok) throw new Error(`Image safety provider failed (${response.status}).`);
    const result = await response.json() as { faceDetected?: boolean; findings?: { type: string; detail: string }[] };
    faceDetected = Boolean(result.faceDetected);
    findings.push(...(result.findings || []));
  }

  return {
    ocrText,
    faceDetected,
    findings,
    phiReviewStatus: findings.length || faceDetected ? "FLAGGED" : "PENDING",
  } as const;
}