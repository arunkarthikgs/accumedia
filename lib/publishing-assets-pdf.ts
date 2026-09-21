import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";

type PublishingAsset = {
  channelName: string;
  channelKey: string;
  outputType: string | null;
  variant?: string | null;
  status: string;
  version: number;
  content: unknown;
};

type PublishingAssetsPdfInput = {
  title: string;
  organization: { name: string; logoUrl?: string | null; brandingHex?: string | null };
  physician: { name: string; specialty: string | null };
  assets: PublishingAsset[];
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

// Common emoji used in publishing captions, mapped to a bracketed text equivalent
// since the PDF's standard WinAnsi font cannot render pictographic glyphs.
const EMOJI_TEXT_FALLBACK: Record<string, string> = {
  "🌡️": "(thermometer)", "🌡": "(thermometer)", "🩺": "(stethoscope)", "💊": "(pill)", "💉": "(injection)",
  "🏥": "(hospital)", "🚑": "(ambulance)", "❤️": "(heart)", "❤": "(heart)", "💙": "(heart)", "🧠": "(brain)",
  "🦷": "(tooth)", "👁️": "(eye)", "👁": "(eye)", "🔬": "(microscope)", "🧬": "(dna)",
  "✅": "(check)", "✔️": "(check)", "✔": "(check)", "❌": "(cross)", "⚠️": "(warning)", "⚠": "(warning)",
  "📌": "(pin)", "📍": "(location)", "📷": "(camera)", "🎥": "(video)", "📢": "(announcement)", "📣": "(megaphone)",
  "👍": "(thumbs up)", "👏": "(applause)", "🙏": "(thank you)", "😊": "(smile)", "🙂": "(smile)", "😉": "(wink)",
  "🎉": "(celebration)", "⭐": "(star)", "⭐️": "(star)", "🔥": "(fire)", "💡": "(idea)", "🚀": "(rocket)",
  "📈": "(chart up)", "📊": "(chart)", "➡️": "(arrow right)", "➡": "(arrow right)", "🗓️": "(calendar)", "🗓": "(calendar)",
  "📅": "(calendar)", "⏰": "(alarm clock)", "💬": "(speech bubble)",
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
  return Array.from(text)
    .map((char) => {
      if (isEncodable(font, char)) return char;
      return EMOJI_TEXT_FALLBACK[char] ?? "";
    })
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
  page.drawText(sanitizeForFont(organizationName.toUpperCase(), boldFont), { x: MARGIN, y: PAGE_HEIGHT - MARGIN, size: 8, font: boldFont, color: accent });
  page.drawText(sanitizeForFont(title, boldFont), { x: MARGIN, y: PAGE_HEIGHT - MARGIN - 29, size: firstPage ? 24 : 15, font: boldFont, color: INK });
  page.drawText(sanitizeForFont(subtitle, font), { x: MARGIN, y: PAGE_HEIGHT - MARGIN - (firstPage ? 50 : 46), size: 9, font, color: MUTED });
  page.drawLine({ start: { x: MARGIN, y: PAGE_HEIGHT - MARGIN - (firstPage ? 66 : 61) }, end: { x: PAGE_WIDTH - MARGIN, y: PAGE_HEIGHT - MARGIN - (firstPage ? 66 : 61) }, thickness: 1, color: BORDER });
}

const OMITTED_ASSET_FIELDS = new Set(["image_brief", "carousel_cards"]);

function assetContentEntries(content: unknown): [string, unknown][] {
  if (content && typeof content === "object" && !Array.isArray(content)) {
    return Object.entries(content as Record<string, unknown>).filter(([key, value]) => value !== null && value !== undefined && value !== "" && !OMITTED_ASSET_FIELDS.has(key));
  }
  return [["Content", content]];
}

export async function createPublishingAssetsPdf(input: PublishingAssetsPdfInput): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const boldFont = await document.embedFont(StandardFonts.HelveticaBold);
  const accent = hexColor(input.organization.brandingHex);
  const logo = await embedLogo(document, input.organization.logoUrl);
  const title = "Publishing Asset Descriptions";
  const subtitle = `${input.title}  |  ${input.organization.name}  |  ${input.physician.name}`;
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
    page.drawText(sanitizeForFont(heading.toUpperCase(), boldFont), { x: MARGIN, y: cursorY, size: 8, font: boldFont, color: accent });
    page.drawLine({ start: { x: MARGIN, y: cursorY - 8 }, end: { x: PAGE_WIDTH - MARGIN, y: cursorY - 8 }, thickness: 1.2, color: accent });
    cursorY -= 28;
  };
  const addParagraph = (text: string, options: { bold?: boolean; color?: ReturnType<typeof rgb> } = {}) => {
    const activeFont = options.bold ? boldFont : font;
    const content = sanitizeForFont(text.trim(), activeFont) || "Not provided";
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
  const addAssetHeading = (index: number, asset: PublishingAsset) => {
    ensureSpace(56);
    cursorY -= 14;
    page.drawRectangle({ x: MARGIN, y: cursorY - 26, width: PAGE_WIDTH - MARGIN * 2, height: 30, color: SOFT, borderColor: BORDER, borderWidth: 0.7 });
    page.drawText(sanitizeForFont(`${index}. ${asset.channelName || asset.channelKey}`, boldFont), { x: MARGIN + 12, y: cursorY - 12, size: 11, font: boldFont, color: INK });
    const meta = [asset.outputType ? label(asset.outputType) : null, asset.variant, `v${asset.version}`, label(asset.status)].filter(Boolean).join("  ·  ");
    page.drawText(sanitizeForFont(meta, font), { x: MARGIN + 12, y: cursorY - 23, size: 7.5, font, color: MUTED });
    cursorY -= 40;
  };

  ensureSpace(76);
  page.drawRectangle({ x: MARGIN, y: cursorY - 52, width: PAGE_WIDTH - MARGIN * 2, height: 64, color: SOFT, borderColor: BORDER, borderWidth: 0.7 });
  page.drawText("CASE DETAILS", { x: MARGIN + 16, y: cursorY - 8, size: 7.5, font: boldFont, color: accent });
  page.drawText("Organization", { x: MARGIN + 16, y: cursorY - 27, size: 7.5, font, color: MUTED });
  page.drawText(sanitizeForFont(input.organization.name, boldFont), { x: MARGIN + 16, y: cursorY - 41, size: 9.5, font: boldFont, color: INK });
  page.drawText("Attending physician / RMP", { x: MARGIN + 230, y: cursorY - 27, size: 7.5, font, color: MUTED });
  page.drawText(sanitizeForFont(input.physician.name, boldFont), { x: MARGIN + 230, y: cursorY - 41, size: 9.5, font: boldFont, color: INK });
  page.drawText(sanitizeForFont(input.physician.specialty || "General Medicine", font), { x: MARGIN + 230, y: cursorY - 53, size: 7.5, font, color: MUTED });
  cursorY -= 78;

  input.assets.forEach((asset, index) => {
    addAssetHeading(index + 1, asset);
    for (const [key, value] of assetContentEntries(asset.content)) {
      addParagraph(label(key), { bold: true, color: accent });
      addParagraph(stringifyValue(value));
    }
  });

  const pages = document.getPages();
  pages.forEach((currentPage, index) => {
    currentPage.drawLine({ start: { x: MARGIN, y: 39 }, end: { x: PAGE_WIDTH - MARGIN, y: 39 }, thickness: 0.5, color: BORDER });
    currentPage.drawText(sanitizeForFont(`${input.organization.name}  |  Publishing asset descriptions`, font), { x: MARGIN, y: 24, size: 7.5, font, color: MUTED });
    currentPage.drawText(`Page ${index + 1} of ${pages.length}`, { x: PAGE_WIDTH - MARGIN - 70, y: 24, size: 7.5, font, color: MUTED });
  });
  return document.save();
}
