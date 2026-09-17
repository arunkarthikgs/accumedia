import OpenAI from "openai";
import sharp from "sharp";
import type { OverlayOptions } from "sharp";

type Finding = {
  type: string;
  detail: string;
  confidence: "high" | "medium" | "low";
  region?: { x: number; y: number; width: number; height: number };
};

function escapeXml(value: string) {
  return value.replace(/[<>&'\"]/g, (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '\"': "&quot;" })[character] || character);
}

function normalizeAccent(value: string) {
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value) ? value : "#0f766e";
}

async function applyBrandOverlay(input: Buffer, options: { accent: string; logoUrl?: string; title: string; tagline?: string; disclaimer?: string; font?: string }) {
  const image = sharp(input);
  const metadata = await image.metadata();
  const width = metadata.width || 1024;
  const height = metadata.height || 1024;
  const logo = options.logoUrl ? await fetch(options.logoUrl).then(async (response) => response.ok ? Buffer.from(await response.arrayBuffer()) : null).catch(() => null) : null;
  const accent = normalizeAccent(options.accent);
  const font = escapeXml(options.font || "Arial");
  const title = escapeXml(options.title.slice(0, 120));
  const tagline = escapeXml((options.tagline || "").slice(0, 120));
  const disclaimer = escapeXml((options.disclaimer || "").slice(0, 180));
  const footerHeight = Math.max(150, Math.round(height * 0.17));
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="${height - footerHeight}" width="${width}" height="${footerHeight}" fill="#ffffff" fill-opacity="0.92"/><rect x="0" y="${height - footerHeight}" width="12" height="${footerHeight}" fill="${accent}"/><text x="36" y="${height - footerHeight + 58}" font-family="${font}" font-size="${Math.max(24, Math.round(width / 32))}" font-weight="700" fill="#13211f">${title}</text><text x="36" y="${height - footerHeight + 94}" font-family="${font}" font-size="${Math.max(14, Math.round(width / 80))}" fill="${accent}">${tagline}</text><text x="36" y="${height - 34}" font-family="${font}" font-size="${Math.max(12, Math.round(width / 90))}" fill="#52615d">${disclaimer}</text></svg>`;
  const overlays: OverlayOptions[] = [{ input: Buffer.from(svg) }];
  if (logo) overlays.push({ input: await sharp(logo).resize(Math.round(width * 0.16), Math.round(height * 0.16), { fit: "inside" }).png().toBuffer(), gravity: "northeast", top: 28, left: 28 });
  return image.composite(overlays).png().toBuffer();
}

function parseSafetyResponse(content: string) {
  const parsed = JSON.parse(content.replace(/^```json\s*|\s*```$/g, "")) as { faceDetected?: boolean; findings?: Finding[] };
  return {
    faceDetected: Boolean(parsed.faceDetected),
    findings: filterSafetyFindings(Array.isArray(parsed.findings) ? parsed.findings : []),
  };
}

const IDENTIFIER_PATTERNS = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /(?<!\d)(?:\+?91[-\s]?)?[6-9]\d{9}(?!\d)/,
  /(?<!\d)\d{4}[\s-]?\d{4}[\s-]?\d{4}(?!\d)/,
  /\b(?:UHID|MRN|IPD|OPD|ABHA|Aadhaar|policy|insurance|card)\b\s*(?:no\.?|number|#)?\s*[:=-]?\s*[A-Z0-9-]{4,}\b/i,
  /\b(?:DOB|date\s+of\s+birth)\b\s*[:=-]?\s*(?:\d{1,2}[/-])?(?:\d{1,2}[/-])\d{2,4}\b/i,
  /\b\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{4}\b/i,
  /\b\d{1,2}:\d{2}\s*(?:am|pm)\b/i,
  /\b(?:Mr|Mrs|Ms|Miss|Dr)\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}\b/,
];

function containsIdentifier(value: string) {
  return IDENTIFIER_PATTERNS.some((pattern) => pattern.test(value));
}

function filterSafetyFindings(findings: Finding[]) {
  return findings.filter((finding) => {
    const type = finding.type.toLowerCase();
    const detail = finding.detail || "";
    const textOnlyFinding = type.includes("text") || type.includes("clinical") || type.includes("readable");
    return !textOnlyFinding || containsIdentifier(detail);
  });
}

export async function renderClinicalImage(input: {
  prompt: string;
  size: "1024x1024" | "1536x1024" | "1024x1536";
  safetyPrompt: string;
  title: string;
  accent: string;
  logoUrl?: string;
  tagline?: string;
  disclaimer?: string;
  font?: string;
}) {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const generated = await openai.images.generate({ model: process.env.IMAGE_GENERATION_MODEL || "gpt-image-1", prompt: input.prompt, size: input.size, n: 1 });
  const base64 = generated.data?.[0]?.b64_json;
  if (!base64) throw new Error("Image generation returned no image data.");

  const buffer = await applyBrandOverlay(Buffer.from(base64, "base64"), input);
  const screened = await openai.chat.completions.create({
    model: process.env.IMAGE_SAFETY_AI_MODEL || "gpt-4o",
    response_format: { type: "json_object" },
    messages: [{
      role: "user",
      content: [
        { type: "text", text: input.safetyPrompt },
        { type: "image_url", image_url: { url: `data:image/png;base64,${buffer.toString("base64")}`, detail: "high" } },
      ],
    }],
  });
  const safety = parseSafetyResponse(screened.choices[0]?.message?.content || "{}");
  return { buffer, ...safety };
}
