import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";

type PdfTarget = "clinical" | "record";
type CasePdfInput = {
  title: string;
  organization: { name: string; logoUrl?: string | null; brandingHex?: string | null };
  physician: { name: string; specialty: string | null };
  rawInput: string;
  masterRecord: Record<string, unknown>;
  safetyAudit: Record<string, unknown>;
  safetyFlags: { flagType: string; detail: string; confidence: string }[];
  recordings: { transcribedText: string | null; rawTranscript: string | null; transcriptionAgent: string | null }[];
  guidedSubmission?: Record<string, unknown> | null;
};

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 48;
const BODY_SIZE = 10;
const LINE_HEIGHT = 15;
const INK = rgb(0.09, 0.13, 0.12);
const MUTED = rgb(0.35, 0.41, 0.38);
const BORDER = rgb(0.78, 0.82, 0.8);
const PAPER = rgb(0.985, 0.99, 0.985);
const SOFT = rgb(0.94, 0.97, 0.95);

function label(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Not provided";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(stringifyValue).join("; ");
  return Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => `${label(key)}: ${stringifyValue(nestedValue)}`).join("; ");
}

function hexColor(value: string | null | undefined) {
  const match = value?.match(/^#?([0-9a-f]{6})$/i);
  if (!match) return rgb(0.04, 0.4, 0.34);
  const hex = match[1];
  return rgb(parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255);
}

async function embedLogo(document: PDFDocument, logoUrl?: string | null): Promise<PDFImage | null> {
  if (!logoUrl) return null;
  try {
    const response = await fetch(logoUrl);
    if (!response.ok) return null;
    const bytes = await response.arrayBuffer();
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("png") || logoUrl.toLowerCase().includes(".png")) return document.embedPng(bytes);
    if (contentType.includes("jpeg") || contentType.includes("jpg") || /\.jpe?g/i.test(logoUrl)) return document.embedJpg(bytes);
  } catch {
    return null;
  }
  return null;
}

function addPageHeader(page: PDFPage, title: string, subtitle: string, organizationName: string, font: PDFFont, boldFont: PDFFont, accent: ReturnType<typeof rgb>, logo: PDFImage | null, firstPage: boolean) {
  page.drawRectangle({ x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT, color: PAPER });
  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 8, width: PAGE_WIDTH, height: 8, color: accent });
  if (logo) {
    const dimensions = logo.scaleToFit(86, 42);
    page.drawImage(logo, { x: PAGE_WIDTH - MARGIN - dimensions.width, y: PAGE_HEIGHT - MARGIN - dimensions.height + 7, width: dimensions.width, height: dimensions.height });
  } else {
    const initials = organizationName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
    page.drawRectangle({ x: PAGE_WIDTH - MARGIN - 44, y: PAGE_HEIGHT - MARGIN - 42, width: 44, height: 34, color: accent });
    page.drawText(initials || "CI", { x: PAGE_WIDTH - MARGIN - 36, y: PAGE_HEIGHT - MARGIN - 30, size: 12, font: boldFont, color: rgb(1, 1, 1) });
  }
  page.drawText(organizationName.toUpperCase(), { x: MARGIN, y: PAGE_HEIGHT - MARGIN, size: 8, font: boldFont, color: accent });
  page.drawText(title, { x: MARGIN, y: PAGE_HEIGHT - MARGIN - 29, size: firstPage ? 24 : 15, font: boldFont, color: INK });
  page.drawText(subtitle, { x: MARGIN, y: PAGE_HEIGHT - MARGIN - (firstPage ? 50 : 46), size: 9, font, color: MUTED });
  page.drawLine({ start: { x: MARGIN, y: PAGE_HEIGHT - MARGIN - (firstPage ? 66 : 61) }, end: { x: PAGE_WIDTH - MARGIN, y: PAGE_HEIGHT - MARGIN - (firstPage ? 66 : 61) }, thickness: 1, color: BORDER });
}

export async function createCasePdf(input: CasePdfInput, target: PdfTarget): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const boldFont = await document.embedFont(StandardFonts.HelveticaBold);
  const accent = hexColor(input.organization.brandingHex);
  const logo = await embedLogo(document, input.organization.logoUrl);
  const title = target === "clinical" ? "Clinical Review" : "Master Clinical Record";
  const subtitle = `${input.organization.name}  |  ${input.physician.name}  |  ${input.physician.specialty || "General Medicine"}`;
  let page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let cursorY = PAGE_HEIGHT - MARGIN - 86;
  addPageHeader(page, title, subtitle, input.organization.name, font, boldFont, accent, logo, true);

  const ensureSpace = (height: number) => {
    if (cursorY - height < MARGIN + 28) {
      page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      cursorY = PAGE_HEIGHT - MARGIN - 78;
      addPageHeader(page, title, subtitle, input.organization.name, font, boldFont, accent, logo, false);
    }
  };
  const addHeading = (heading: string) => {
    ensureSpace(42);
    cursorY -= 14;
    page.drawText(heading.toUpperCase(), { x: MARGIN, y: cursorY, size: 8, font: boldFont, color: accent });
    page.drawLine({ start: { x: MARGIN, y: cursorY - 8 }, end: { x: PAGE_WIDTH - MARGIN, y: cursorY - 8 }, thickness: 1.2, color: accent });
    cursorY -= 28;
  };
  const addParagraph = (text: string, options: { bold?: boolean; color?: ReturnType<typeof rgb> } = {}) => {
    const content = text.trim() || "Not provided";
    const activeFont = options.bold ? boldFont : font;
    const size = options.bold ? 9 : BODY_SIZE;
    const maxWidth = PAGE_WIDTH - MARGIN * 2 - (options.bold ? 0 : 4);
    const words = content.split(/\s+/);
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (activeFont.widthOfTextAtSize(candidate, size) > maxWidth && line) {
        ensureSpace(LINE_HEIGHT);
        page.drawText(line, { x: MARGIN + (options.bold ? 0 : 4), y: cursorY, size, font: activeFont, color: options.color || INK });
        cursorY -= LINE_HEIGHT;
        line = word;
      } else line = candidate;
    }
    if (line) {
      ensureSpace(LINE_HEIGHT);
      page.drawText(line, { x: MARGIN + (options.bold ? 0 : 4), y: cursorY, size, font: activeFont, color: options.color || INK });
      cursorY -= LINE_HEIGHT;
    }
    cursorY -= options.bold ? 3 : 8;
  };

  ensureSpace(76);
  page.drawRectangle({ x: MARGIN, y: cursorY - 52, width: PAGE_WIDTH - MARGIN * 2, height: 64, color: SOFT, borderColor: BORDER, borderWidth: 0.7 });
  page.drawText("CASE DETAILS", { x: MARGIN + 16, y: cursorY - 8, size: 7.5, font: boldFont, color: accent });
  page.drawText("Organization", { x: MARGIN + 16, y: cursorY - 27, size: 7.5, font, color: MUTED });
  page.drawText(input.organization.name, { x: MARGIN + 16, y: cursorY - 41, size: 9.5, font: boldFont, color: INK });
  page.drawText("Attending physician / RMP", { x: MARGIN + 230, y: cursorY - 27, size: 7.5, font, color: MUTED });
  page.drawText(input.physician.name, { x: MARGIN + 230, y: cursorY - 41, size: 9.5, font: boldFont, color: INK });
  page.drawText(input.physician.specialty || "General Medicine", { x: MARGIN + 230, y: cursorY - 53, size: 7.5, font, color: MUTED });
  cursorY -= 78;

  if (target === "clinical") {
    addHeading("Clinician-reviewed narrative");
    const recording = input.recordings[0];
    addParagraph(recording?.transcribedText || recording?.rawTranscript || input.rawInput || "No narrative available.");
    if (recording?.transcriptionAgent) addParagraph(`Transcription agent  ${recording.transcriptionAgent}`, { color: MUTED });
    if (input.guidedSubmission) {
      addHeading("Guided submission source");
      for (const [key, value] of Object.entries(input.guidedSubmission)) {
        addParagraph(label(key), { bold: true });
        addParagraph(stringifyValue(value));
      }
    }
    if (input.safetyFlags.length > 0) {
      addHeading("Open safety flags");
      for (const flag of input.safetyFlags) {
        addParagraph(`${label(flag.flagType)}  |  ${flag.confidence} confidence`, { bold: true, color: rgb(0.62, 0.35, 0.05) });
        addParagraph(flag.detail);
      }
    }
  } else {
    addHeading("Master Clinical Record");
    for (const [key, value] of Object.entries(input.masterRecord || {})) {
      addParagraph(label(key), { bold: true, color: accent });
      addParagraph(stringifyValue(value));
    }
    addHeading("Compliance audit");
    for (const [key, value] of Object.entries(input.safetyAudit || {})) addParagraph(`${label(key)}  ${stringifyValue(value)}`);
  }

  const pages = document.getPages();
  pages.forEach((currentPage, index) => {
    currentPage.drawLine({ start: { x: MARGIN, y: 39 }, end: { x: PAGE_WIDTH - MARGIN, y: 39 }, thickness: 0.5, color: BORDER });
    currentPage.drawText(`${input.organization.name}  |  Confidential clinical document`, { x: MARGIN, y: 24, size: 7.5, font, color: MUTED });
    currentPage.drawText(`Page ${index + 1} of ${pages.length}`, { x: PAGE_WIDTH - MARGIN - 70, y: 24, size: 7.5, font, color: MUTED });
  });
  return document.save();
}
