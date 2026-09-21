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

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 46;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BODY_SIZE = 10;
const LINE_HEIGHT = 14;
const FOOTER_RESERVE = 56;
const FIRST_HEADER_H = 104;
const HEADER_H = 68;
const INK = rgb(0.11, 0.12, 0.13);
const MUTED = rgb(0.43, 0.47, 0.46);
const BORDER = rgb(0.82, 0.85, 0.84);
const WHITE = rgb(1, 1, 1);
const SOFT = rgb(0.976, 0.984, 0.98);

function label(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

// Common emoji used in clinical narratives, mapped to a bracketed text equivalent
// since the PDF's standard WinAnsi font cannot render pictographic glyphs.
const EMOJI_TEXT_FALLBACK: Record<string, string> = {
  "🌡️": "(thermometer)", "🌡": "(thermometer)", "🩺": "(stethoscope)", "💊": "(pill)", "💉": "(injection)",
  "🏥": "(hospital)", "🚑": "(ambulance)", "❤️": "(heart)", "❤": "(heart)", "🧠": "(brain)", "🦷": "(tooth)",
  "👁️": "(eye)", "👁": "(eye)", "🔬": "(microscope)", "🧬": "(dna)", "✅": "(check)", "✔️": "(check)",
  "✔": "(check)", "❌": "(cross)", "⚠️": "(warning)", "⚠": "(warning)", "📌": "(pin)", "📍": "(location)",
};

let cachedEncodableCheck: { font: PDFFont; cache: Map<string, boolean> } | null = null;

function isEncodable(font: PDFFont, char: string) {
  if (!cachedEncodableCheck || cachedEncodableCheck.font !== font) cachedEncodableCheck = { font, cache: new Map() };
  const { cache } = cachedEncodableCheck;
  const cached = cache.get(char);
  if (cached !== undefined) return cached;
  let result = true;
  try {
    font.widthOfTextAtSize(char, 10);
  } catch {
    result = false;
  }
  cache.set(char, result);
  return result;
}

function sanitizeForFont(text: string, font: PDFFont): string {
  return Array.from(String(text ?? ""))
    .map((char) => (isEncodable(font, char) ? char : (EMOJI_TEXT_FALLBACK[char] ?? "")))
    .join("")
    .replace(/[ \t]{2,}/g, " ");
}

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Not provided";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(stringifyValue).join("; ");
  return Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => `${label(key)}: ${stringifyValue(nestedValue)}`).join("; ");
}

function hexColor(value: string | null | undefined) {
  const match = value?.match(/^#?([0-9a-f]{6})$/i);
  if (!match) return rgb(0.035, 0.365, 0.31);
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

export async function createCasePdf(input: CasePdfInput, target: PdfTarget): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const boldFont = await document.embedFont(StandardFonts.HelveticaBold);
  const accent = hexColor(input.organization.brandingHex);
  const logo = await embedLogo(document, input.organization.logoUrl);
  const orgName = input.organization.name || "Organization";
  const title = target === "clinical" ? "Clinical Review" : "Master Clinical Record";
  const physicianLine = [input.physician.name, input.physician.specialty || "General Medicine"].filter(Boolean).join("  ·  ");

  let page!: PDFPage;
  let cursorY = 0;

  const drawLogoBadge = (targetPage: PDFPage, x: number, y: number, width: number, height: number, textSize: number) => {
    if (logo) {
      const dimensions = logo.scaleToFit(width, height);
      targetPage.drawImage(logo, { x: x + (width - dimensions.width) / 2, y: y + (height - dimensions.height) / 2, width: dimensions.width, height: dimensions.height });
      return;
    }
    const initials = orgName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "OR";
    targetPage.drawRectangle({ x, y, width, height, borderColor: WHITE, borderWidth: 1.2 });
    targetPage.drawText(initials, { x: x + width / 2 - boldFont.widthOfTextAtSize(initials, textSize) / 2, y: y + height / 2 - textSize / 2.6, size: textSize, font: boldFont, color: WHITE });
  };

  const drawHeader = (targetPage: PDFPage, isFirst: boolean) => {
    const headerH = isFirst ? FIRST_HEADER_H : HEADER_H;
    targetPage.drawRectangle({ x: 0, y: PAGE_HEIGHT - headerH, width: PAGE_WIDTH, height: headerH, color: accent });
    targetPage.drawText(sanitizeForFont(orgName.toUpperCase(), boldFont), { x: MARGIN, y: PAGE_HEIGHT - (isFirst ? 30 : 25), size: isFirst ? 9 : 8, font: boldFont, color: WHITE });
    targetPage.drawText(sanitizeForFont(title, boldFont), { x: MARGIN, y: PAGE_HEIGHT - (isFirst ? 58 : 44), size: isFirst ? 22 : 15, font: boldFont, color: WHITE });
    if (isFirst) targetPage.drawText(sanitizeForFont(`${orgName}  |  ${physicianLine}`, font), { x: MARGIN, y: PAGE_HEIGHT - 82, size: 10, font, color: rgb(0.8, 0.9, 0.87) });
    drawLogoBadge(targetPage, PAGE_WIDTH - MARGIN - (isFirst ? 56 : 42), PAGE_HEIGHT - headerH + (isFirst ? 20 : 15), isFirst ? 56 : 42, isFirst ? 42 : 32, isFirst ? 14 : 12);
  };

  const newPage = (isFirst: boolean) => {
    page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    drawHeader(page, isFirst);
    cursorY = PAGE_HEIGHT - (isFirst ? FIRST_HEADER_H : HEADER_H) - 32;
  };

  const ensureSpace = (height: number) => {
    if (cursorY - height < MARGIN + FOOTER_RESERVE) newPage(false);
  };

  function wrapText(text: string, activeFont: PDFFont, size: number, maxWidth: number): string[] {
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (activeFont.widthOfTextAtSize(candidate, size) > maxWidth && line) {
        lines.push(line);
        line = word;
      } else line = candidate;
    }
    if (line) lines.push(line);
    return lines;
  }

  const addHeading = (heading: string) => {
    ensureSpace(42);
    cursorY -= 14;
    page.drawText(sanitizeForFont(heading.toUpperCase(), boldFont), { x: MARGIN, y: cursorY, size: 8, font: boldFont, color: accent });
    page.drawLine({ start: { x: MARGIN, y: cursorY - 8 }, end: { x: PAGE_WIDTH - MARGIN, y: cursorY - 8 }, thickness: 1.2, color: accent });
    cursorY -= 28;
  };

  const addParagraph = (text: string, options: { bold?: boolean; color?: ReturnType<typeof rgb> } = {}) => {
    const activeFont = options.bold ? boldFont : font;
    const size = options.bold ? 9 : BODY_SIZE;
    const content = sanitizeForFont((text || "").trim(), activeFont) || "Not provided";
    const lines = wrapText(content, activeFont, size, CONTENT_WIDTH - (options.bold ? 0 : 4));
    for (const line of lines) {
      ensureSpace(LINE_HEIGHT);
      page.drawText(line, { x: MARGIN + (options.bold ? 0 : 4), y: cursorY, size, font: activeFont, color: options.color || INK });
      cursorY -= LINE_HEIGHT;
    }
    cursorY -= options.bold ? 3 : 8;
  };

  newPage(true);

  ensureSpace(76);
  page.drawRectangle({ x: MARGIN, y: cursorY - 52, width: CONTENT_WIDTH, height: 64, color: SOFT, borderColor: BORDER, borderWidth: 0.7 });
  page.drawText("CASE DETAILS", { x: MARGIN + 16, y: cursorY - 8, size: 7.5, font: boldFont, color: accent });
  page.drawText("Organization", { x: MARGIN + 16, y: cursorY - 27, size: 7.5, font, color: MUTED });
  page.drawText(sanitizeForFont(orgName, boldFont), { x: MARGIN + 16, y: cursorY - 41, size: 9.5, font: boldFont, color: INK });
  page.drawText("Attending physician / RMP", { x: MARGIN + 230, y: cursorY - 27, size: 7.5, font, color: MUTED });
  page.drawText(sanitizeForFont(input.physician.name, boldFont), { x: MARGIN + 230, y: cursorY - 41, size: 9.5, font: boldFont, color: INK });
  page.drawText(sanitizeForFont(input.physician.specialty || "General Medicine", font), { x: MARGIN + 230, y: cursorY - 53, size: 7.5, font, color: MUTED });
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
    currentPage.drawLine({ start: { x: MARGIN, y: 44 }, end: { x: PAGE_WIDTH - MARGIN, y: 44 }, thickness: 0.5, color: BORDER });
    currentPage.drawText(sanitizeForFont(`${orgName}  ·  ${title}`, font), { x: MARGIN, y: 30, size: 7.5, font, color: MUTED });
    const pageLabel = `Page ${index + 1} of ${pages.length}`;
    currentPage.drawText(pageLabel, { x: PAGE_WIDTH - MARGIN - font.widthOfTextAtSize(pageLabel, 7.5), y: 30, size: 7.5, font, color: MUTED });
    const complianceLine = "Generated under NMC-registered medical practitioner supervision — confidential clinical document";
    currentPage.drawText(sanitizeForFont(complianceLine, font), { x: PAGE_WIDTH / 2 - font.widthOfTextAtSize(complianceLine, 7) / 2, y: 18, size: 7, font, color: MUTED });
  });
  return document.save();
}

