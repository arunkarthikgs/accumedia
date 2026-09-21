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

type Color = ReturnType<typeof rgb>;

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 46;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BODY_SIZE = 10;
const LINE_HEIGHT = 14;
const FOOTER_RESERVE = 56;
const COVER_HEADER_H = 118;
const HEADER_H = 68;

const INK = rgb(0.11, 0.12, 0.13);
const MUTED = rgb(0.43, 0.47, 0.46);
const BORDER = rgb(0.82, 0.85, 0.84);
const WHITE = rgb(1, 1, 1);
const SOFT = rgb(0.976, 0.984, 0.98);
const MINT = rgb(0.91, 0.96, 0.945);

const STATUS_STYLES: Record<string, { border: Color; bg: Color }> = {
  DRAFT: { border: rgb(0.45, 0.47, 0.46), bg: rgb(0.95, 0.95, 0.95) },
  REVIEW: { border: rgb(0.72, 0.45, 0.09), bg: rgb(0.995, 0.95, 0.87) },
  QUEUED: { border: rgb(0.72, 0.45, 0.09), bg: rgb(0.995, 0.95, 0.87) },
  APPROVED: { border: rgb(0.16, 0.47, 0.33), bg: rgb(0.9, 0.97, 0.93) },
  PROCESSING: { border: rgb(0.04, 0.4, 0.34), bg: rgb(0.91, 0.96, 0.945) },
  SCHEDULED: { border: rgb(0.04, 0.4, 0.34), bg: rgb(0.91, 0.96, 0.945) },
  EXPORTED: { border: rgb(0.04, 0.4, 0.34), bg: rgb(0.91, 0.96, 0.945) },
  PUBLISHED: { border: rgb(0.04, 0.4, 0.34), bg: rgb(0.91, 0.96, 0.945) },
};

function label(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function stripMarkdownEmphasis(text: string) {
  return text.replace(/\*\*(.*?)\*\*/g, "$1").replace(/__(.*?)__/g, "$1").replace(/`([^`]*)`/g, "$1");
}

function isDisclaimerLine(text: string) {
  return /generated (?:under|by).{0,50}(practitioner|physician|clinician|medical).{0,40}supervision/i.test(text);
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

const OMITTED_ASSET_FIELDS = new Set([
  "image_brief", "carousel_cards", "featured_image_brief", "suggested_headings",
  "internal_link_suggestions", "external_reference_suggestions", "schema_recommendations",
  "secondary_keywords", "long_tail_keywords",
]);

export async function createPublishingAssetsPdf(input: PublishingAssetsPdfInput): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const boldFont = await document.embedFont(StandardFonts.HelveticaBold);
  const accent = hexColor(input.organization.brandingHex);
  const logo = await embedLogo(document, input.organization.logoUrl);
  const orgName = input.organization.name || "Publishing organization";
  const physicianLine = [input.physician.name, input.physician.specialty].filter(Boolean).join("  ·  ");

  let page!: PDFPage;
  let cursorY = 0;
  let contentPageCount = 0;

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

  const drawContentHeader = (targetPage: PDFPage) => {
    targetPage.drawRectangle({ x: 0, y: PAGE_HEIGHT - HEADER_H, width: PAGE_WIDTH, height: HEADER_H, color: accent });
    targetPage.drawText(sanitizeForFont(orgName.toUpperCase(), boldFont), { x: MARGIN, y: PAGE_HEIGHT - 25, size: 8, font: boldFont, color: WHITE });
    targetPage.drawText(sanitizeForFont("Publishing Asset Descriptions", boldFont), { x: MARGIN, y: PAGE_HEIGHT - 44, size: 15, font: boldFont, color: WHITE });
    drawLogoBadge(targetPage, PAGE_WIDTH - MARGIN - 42, PAGE_HEIGHT - HEADER_H + 15, 42, 32, 12);
  };

  const drawCoverHeader = (targetPage: PDFPage) => {
    targetPage.drawRectangle({ x: 0, y: PAGE_HEIGHT - COVER_HEADER_H, width: PAGE_WIDTH, height: COVER_HEADER_H, color: accent });
    targetPage.drawText(sanitizeForFont(orgName.toUpperCase(), boldFont), { x: MARGIN, y: PAGE_HEIGHT - 30, size: 9, font: boldFont, color: WHITE });
    targetPage.drawText(sanitizeForFont("Publishing Asset Descriptions", boldFont), { x: MARGIN, y: PAGE_HEIGHT - 63, size: 26, font: boldFont, color: WHITE });
    targetPage.drawText(sanitizeForFont(input.title, font), { x: MARGIN, y: PAGE_HEIGHT - 85, size: 13, font, color: rgb(0.86, 0.94, 0.91) });
    targetPage.drawText(sanitizeForFont(`${orgName}  |  ${physicianLine}`, font), { x: MARGIN, y: PAGE_HEIGHT - 102, size: 10, font, color: rgb(0.8, 0.9, 0.87) });
    drawLogoBadge(targetPage, PAGE_WIDTH - MARGIN - 62, PAGE_HEIGHT - COVER_HEADER_H + 24, 62, 48, 16);
  };

  const newContentPage = () => {
    page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    drawContentHeader(page);
    cursorY = PAGE_HEIGHT - HEADER_H - 32;
    contentPageCount += 1;
  };

  const ensureSpace = (height: number) => {
    if (cursorY - height < MARGIN + FOOTER_RESERVE) newContentPage();
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

  const addLabelCaps = (text: string) => {
    ensureSpace(24);
    page.drawText(sanitizeForFont(text.toUpperCase(), boldFont), { x: MARGIN, y: cursorY, size: 8, font: boldFont, color: accent });
    cursorY -= 18;
  };

  const addSubheading = (text: string, level: 1 | 2 | 3) => {
    const activeFont = boldFont;
    const size = level === 1 ? 15 : level === 2 ? 12.5 : 10.5;
    const color = level === 2 ? accent : INK;
    const lines = wrapText(sanitizeForFont(text, activeFont), activeFont, size, CONTENT_WIDTH);
    ensureSpace(lines.length * (size + 4) + 12);
    cursorY -= level === 1 ? 6 : 4;
    for (const line of lines) {
      page.drawText(line, { x: MARGIN, y: cursorY, size, font: activeFont, color });
      cursorY -= size + 4;
    }
    cursorY -= level === 3 ? 2 : 4;
  };

  const addParagraph = (text: string, options: { bold?: boolean; color?: Color; indent?: number } = {}) => {
    const activeFont = options.bold ? boldFont : font;
    const size = options.bold ? 9 : BODY_SIZE;
    const indent = options.indent ?? 0;
    const content = sanitizeForFont((text || "").trim(), activeFont) || "Not provided";
    const lines = wrapText(content, activeFont, size, CONTENT_WIDTH - indent);
    for (const line of lines) {
      ensureSpace(LINE_HEIGHT);
      page.drawText(line, { x: MARGIN + indent, y: cursorY, size, font: activeFont, color: options.color || INK });
      cursorY -= LINE_HEIGHT;
    }
    cursorY -= options.bold ? 3 : 8;
  };

  const addBulletList = (items: string[]) => {
    for (const rawItem of items) {
      const text = sanitizeForFont(stripMarkdownEmphasis(String(rawItem || "")).trim(), font);
      if (!text) continue;
      const lines = wrapText(text, font, BODY_SIZE, CONTENT_WIDTH - 18);
      ensureSpace(lines.length * LINE_HEIGHT + 2);
      page.drawText(String.fromCharCode(0x95), { x: MARGIN + 2, y: cursorY, size: 8, font, color: accent });
      for (const line of lines) {
        ensureSpace(LINE_HEIGHT);
        page.drawText(line, { x: MARGIN + 16, y: cursorY, size: BODY_SIZE, font, color: INK });
        cursorY -= LINE_HEIGHT;
      }
      cursorY -= 2;
    }
    cursorY -= 6;
  };

  const addBoxedText = (text: string) => {
    const content = sanitizeForFont((text || "").trim(), font) || "Not provided";
    const lines = wrapText(content, font, BODY_SIZE, CONTENT_WIDTH - 32);
    let index = 0;
    while (index < lines.length) {
      ensureSpace(70);
      const available = cursorY - (MARGIN + FOOTER_RESERVE) - 24;
      const linesPerPage = Math.max(3, Math.floor(available / LINE_HEIGHT));
      const batch = lines.slice(index, index + linesPerPage);
      const boxHeight = batch.length * LINE_HEIGHT + 24;
      page.drawRectangle({ x: MARGIN, y: cursorY - boxHeight, width: CONTENT_WIDTH, height: boxHeight, color: SOFT, borderColor: BORDER, borderWidth: 0.7 });
      page.drawRectangle({ x: MARGIN, y: cursorY - boxHeight, width: 3, height: boxHeight, color: accent });
      let lineY = cursorY - 16;
      for (const line of batch) {
        page.drawText(line, { x: MARGIN + 16, y: lineY, size: BODY_SIZE, font, color: INK });
        lineY -= LINE_HEIGHT;
      }
      cursorY -= boxHeight + 14;
      index += batch.length;
    }
  };

  const addMetaRows = (rows: [string, unknown][]) => {
    const labelColW = 150;
    for (const [rowLabel, rowValue] of rows) {
      if (rowValue === undefined || rowValue === null || rowValue === "") continue;
      const value = sanitizeForFont(String(rowValue), font);
      const lines = wrapText(value, font, 10, CONTENT_WIDTH - labelColW);
      const rowHeight = Math.max(20, lines.length * 14 + 10);
      ensureSpace(rowHeight + 2);
      page.drawText(sanitizeForFont(rowLabel.toUpperCase(), boldFont), { x: MARGIN, y: cursorY - 14, size: 7.5, font: boldFont, color: MUTED });
      let lineY = cursorY - 14;
      for (const line of lines) {
        page.drawText(line, { x: MARGIN + labelColW, y: lineY, size: 10, font, color: INK });
        lineY -= 14;
      }
      page.drawLine({ start: { x: MARGIN, y: cursorY - rowHeight }, end: { x: PAGE_WIDTH - MARGIN, y: cursorY - rowHeight }, thickness: 0.5, color: BORDER });
      cursorY -= rowHeight;
    }
    cursorY -= 8;
  };

  const addTableRows = (rows: [string, unknown][]) => {
    const labelColW = 150;
    for (const [rowLabel, rowValue] of rows) {
      if (rowValue === undefined || rowValue === null || rowValue === "") continue;
      const value = sanitizeForFont(String(rowValue), font);
      const lines = wrapText(value, font, 9.5, CONTENT_WIDTH - labelColW - 24);
      const rowHeight = Math.max(24, lines.length * 13 + 14);
      ensureSpace(rowHeight + 2);
      page.drawRectangle({ x: MARGIN, y: cursorY - rowHeight, width: labelColW, height: rowHeight, color: MINT });
      page.drawRectangle({ x: MARGIN, y: cursorY - rowHeight, width: CONTENT_WIDTH, height: rowHeight, borderColor: BORDER, borderWidth: 0.6 });
      page.drawLine({ start: { x: MARGIN + labelColW, y: cursorY }, end: { x: MARGIN + labelColW, y: cursorY - rowHeight }, thickness: 0.6, color: BORDER });
      page.drawText(sanitizeForFont(rowLabel, boldFont), { x: MARGIN + 10, y: cursorY - 16, size: 8.5, font: boldFont, color: INK });
      let lineY = cursorY - 16;
      for (const line of lines) {
        page.drawText(line, { x: MARGIN + labelColW + 12, y: lineY, size: 9.5, font, color: INK });
        lineY -= 13;
      }
      cursorY -= rowHeight;
    }
    cursorY -= 10;
  };

  const addHashtagChips = (tags: string[]) => {
    const rowHeight = 22;
    let x = MARGIN;
    ensureSpace(rowHeight + 6);
    for (const rawTag of tags) {
      const text = sanitizeForFont(String(rawTag || "").trim(), font);
      if (!text) continue;
      const chipText = text.startsWith("#") ? text : `#${text}`;
      const chipWidth = font.widthOfTextAtSize(chipText, 9) + 16;
      if (x + chipWidth > PAGE_WIDTH - MARGIN) {
        x = MARGIN;
        cursorY -= rowHeight;
        ensureSpace(rowHeight + 6);
      }
      page.drawRectangle({ x, y: cursorY - rowHeight + 4, width: chipWidth, height: rowHeight - 4, color: MINT, borderColor: accent, borderWidth: 0.6 });
      page.drawText(chipText, { x: x + 8, y: cursorY - rowHeight + 11, size: 9, font, color: accent });
      x += chipWidth + 8;
    }
    cursorY -= rowHeight + 10;
  };

  const addThread = (posts: string[]) => {
    addLabelCaps(`Thread (${posts.length} posts)`);
    posts.forEach((rawPost, index) => {
      const text = sanitizeForFont(String(rawPost || "").trim(), font);
      if (!text) return;
      const lines = wrapText(text, font, BODY_SIZE, CONTENT_WIDTH - 70);
      const rowHeight = Math.max(30, lines.length * LINE_HEIGHT + 14);
      ensureSpace(rowHeight);
      page.drawRectangle({ x: MARGIN, y: cursorY - rowHeight, width: 56, height: rowHeight, color: accent });
      const badge = `${index + 1}/${posts.length}`;
      page.drawText(badge, { x: MARGIN + 28 - boldFont.widthOfTextAtSize(badge, 9) / 2, y: cursorY - rowHeight / 2 - 3, size: 9, font: boldFont, color: WHITE });
      let lineY = cursorY - 14;
      for (const line of lines) {
        page.drawText(line, { x: MARGIN + 68, y: lineY, size: BODY_SIZE, font, color: INK });
        lineY -= LINE_HEIGHT;
      }
      page.drawLine({ start: { x: MARGIN, y: cursorY - rowHeight }, end: { x: PAGE_WIDTH - MARGIN, y: cursorY - rowHeight }, thickness: 0.5, color: BORDER });
      cursorY -= rowHeight;
    });
    cursorY -= 10;
  };

  const addFaq = (items: unknown[]) => {
    addLabelCaps("Frequently Asked Questions");
    for (const item of items) {
      let question = "";
      let answer = "";
      if (typeof item === "string") question = item;
      else if (item && typeof item === "object") {
        const record = item as Record<string, unknown>;
        question = String(record.question ?? record.q ?? record.prompt ?? "");
        answer = String(record.answer ?? record.a ?? record.response ?? "");
      }
      if (question) addParagraph(`Q. ${question}`, { bold: true });
      if (answer) addParagraph(`A. ${answer}`, { color: MUTED });
    }
  };

  const renderMarkdown = (markdown: string) => {
    const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
    let paragraphBuffer: string[] = [];
    let bulletBuffer: string[] = [];
    const flushParagraph = () => {
      if (!paragraphBuffer.length) return;
      const text = paragraphBuffer.join(" ");
      addParagraph(text, isDisclaimerLine(text) ? { color: MUTED } : {});
      paragraphBuffer = [];
    };
    const flushBullets = () => {
      if (!bulletBuffer.length) return;
      addBulletList(bulletBuffer);
      bulletBuffer = [];
    };
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        flushParagraph();
        flushBullets();
        continue;
      }
      const h3 = line.match(/^#{3,6}\s+(.*)/);
      const h2 = line.match(/^#{2}\s+(.*)/);
      const h1 = line.match(/^#\s+(.*)/);
      const bullet = line.match(/^[-*]\s+(.*)/);
      if (h1) {
        flushParagraph();
        flushBullets();
        addSubheading(stripMarkdownEmphasis(h1[1]), 1);
      } else if (h3) {
        flushParagraph();
        flushBullets();
        addSubheading(stripMarkdownEmphasis(h3[1]), 3);
      } else if (h2) {
        flushParagraph();
        flushBullets();
        addSubheading(stripMarkdownEmphasis(h2[1]), 2);
      } else if (bullet) {
        flushParagraph();
        bulletBuffer.push(stripMarkdownEmphasis(bullet[1]));
      } else {
        flushBullets();
        paragraphBuffer.push(stripMarkdownEmphasis(line));
      }
    }
    flushParagraph();
    flushBullets();
  };

  const renderGenericEntries = (entries: [string, unknown][]) => {
    for (const [key, value] of entries) {
      addParagraph(label(key), { bold: true, color: accent });
      addParagraph(stringifyValue(value));
    }
  };

  const genericFallback = (content: unknown) => {
    if (content && typeof content === "object" && !Array.isArray(content)) {
      renderGenericEntries(Object.entries(content as Record<string, unknown>).filter(([key, value]) => value !== null && value !== undefined && value !== "" && !OMITTED_ASSET_FIELDS.has(key)));
    } else {
      addParagraph(stringifyValue(content));
    }
  };

  const consumedRemainder = (content: Record<string, unknown>, consumed: Set<string>) => {
    const remaining = Object.entries(content).filter(([key, value]) => !consumed.has(key) && !OMITTED_ASSET_FIELDS.has(key) && value !== null && value !== undefined && value !== "");
    if (remaining.length > 0) {
      addLabelCaps("Additional details");
      renderGenericEntries(remaining);
    }
  };

  const drawStatusBadge = (status: string, rightX: number, topY: number) => {
    const style = STATUS_STYLES[status] || STATUS_STYLES.DRAFT;
    const text = status.toUpperCase();
    const width = boldFont.widthOfTextAtSize(text, 7.5) + 16;
    const height = 16;
    const x = rightX - width;
    page.drawRectangle({ x, y: topY - height, width, height, color: style.bg, borderColor: style.border, borderWidth: 0.8 });
    page.drawText(sanitizeForFont(text, boldFont), { x: x + 8, y: topY - height + 4.5, size: 7.5, font: boldFont, color: style.border });
    return width;
  };

  const addAssetHeading = (index: number, asset: PublishingAsset) => {
    ensureSpace(60);
    cursorY -= 6;
    const topY = cursorY;
    const badgeWidth = drawStatusBadge(asset.status, PAGE_WIDTH - MARGIN, topY);
    const metaLabel = [asset.outputType ? label(asset.outputType) : null, `v${asset.version}`].filter(Boolean).join("  ·  ");
    const metaWidth = font.widthOfTextAtSize(metaLabel, 9);
    page.drawText(sanitizeForFont(metaLabel, font), { x: PAGE_WIDTH - MARGIN - badgeWidth - 10 - metaWidth, y: topY - 11, size: 9, font, color: MUTED });
    const titleText = `${index}.  ${asset.channelName || asset.channelKey}`;
    page.drawText(sanitizeForFont(titleText, boldFont), { x: MARGIN, y: topY - 15, size: 16, font: boldFont, color: INK });
    cursorY -= 28;
    page.drawLine({ start: { x: MARGIN, y: cursorY }, end: { x: PAGE_WIDTH - MARGIN, y: cursorY }, thickness: 2.2, color: accent });
    cursorY -= 20;
  };

  // --- Per-output-type renderers -------------------------------------------------
  const renderVideoScript = (content: Record<string, unknown>) => {
    if (typeof content.script !== "string") return genericFallback(content);
    addLabelCaps("Script");
    addBoxedText(content.script);
    consumedRemainder(content, new Set(["script"]));
  };

  const renderLinkedInArticle = (content: Record<string, unknown>) => {
    if (typeof content.article_markdown !== "string") return genericFallback(content);
    renderMarkdown(content.article_markdown);
    consumedRemainder(content, new Set(["article_markdown", "image_brief"]));
  };

  const renderShortPost = (content: Record<string, unknown>, extraListKey?: string, extraListLabel?: string) => {
    if (typeof content.post_text !== "string") return genericFallback(content);
    if (Array.isArray(content.hashtags) && content.hashtags.length) {
      addLabelCaps("Hashtags");
      addHashtagChips(content.hashtags as string[]);
    }
    addLabelCaps("Post text");
    addBoxedText(content.post_text);
    if (extraListKey && Array.isArray(content[extraListKey]) && (content[extraListKey] as unknown[]).length) {
      addLabelCaps(extraListLabel || label(extraListKey));
      addBulletList(content[extraListKey] as string[]);
    }
    const consumed = new Set(["post_text", "hashtags", "image_brief"]);
    if (extraListKey) consumed.add(extraListKey);
    consumedRemainder(content, consumed);
  };

  const renderXPost = (content: Record<string, unknown>) => {
    if (typeof content.single_post !== "string" && !Array.isArray(content.thread)) return genericFallback(content);
    if (Array.isArray(content.thread) && content.thread.length) addThread(content.thread as string[]);
    if (typeof content.single_post === "string" && content.single_post.trim()) {
      addLabelCaps("Single post");
      addBoxedText(content.single_post);
    }
    consumedRemainder(content, new Set(["single_post", "thread", "image_brief"]));
  };

  const renderYoutubeReelsMetadata = (content: Record<string, unknown>) => {
    if (!content.video_title && !content.short_description) return genericFallback(content);
    const topLines: string[] = [];
    if (Array.isArray(content.hashtags) && content.hashtags.length) topLines.push(`Common hashtags: ${(content.hashtags as string[]).map((tag) => (tag.startsWith("#") ? tag : `#${tag}`)).join(" ")}`);
    if (Array.isArray(content.keywords) && content.keywords.length) topLines.push(`Common keywords: ${(content.keywords as string[]).join(", ")}`);
    for (const line of topLines) addParagraph(line, { color: MUTED });
    addTableRows([
      ["Video title", content.video_title],
      ["Thumbnail title", content.thumbnail_title],
      ["Short description", content.short_description],
      ["Call to action", content.cta],
    ] as [string, unknown][]);
    if (Array.isArray(content.key_learning_points) && content.key_learning_points.length) {
      addLabelCaps("Key learning points");
      addBulletList(content.key_learning_points as string[]);
    }
    if (typeof content.detailed_description === "string" && content.detailed_description.trim()) {
      addLabelCaps("Detailed description");
      addParagraph(content.detailed_description);
    }
    consumedRemainder(content, new Set(["video_title", "thumbnail_title", "short_description", "cta", "key_learning_points", "keywords", "hashtags", "detailed_description"]));
  };

  const renderInstagramReel = (content: Record<string, unknown>) => {
    if (!content.hook && !content.voiceover_script) return genericFallback(content);
    addMetaRows([
      ["Hook", content.hook],
      ["Call to action", content.cta],
    ]);
    if (Array.isArray(content.on_screen_text) && content.on_screen_text.length) {
      addLabelCaps("On-screen text");
      addBulletList(content.on_screen_text as string[]);
    }
    if (typeof content.voiceover_script === "string" && content.voiceover_script.trim()) {
      addLabelCaps("Voiceover script");
      addBoxedText(content.voiceover_script);
    }
    if (typeof content.caption === "string" && content.caption.trim()) {
      addLabelCaps("Caption");
      addParagraph(content.caption);
    }
    if (Array.isArray(content.hashtags) && content.hashtags.length) {
      addLabelCaps("Hashtags");
      addHashtagChips(content.hashtags as string[]);
    }
    consumedRemainder(content, new Set(["hook", "cta", "on_screen_text", "voiceover_script", "caption", "hashtags"]));
  };

  const renderSeoBlog = (content: Record<string, unknown>) => {
    if (!content.full_article && !content.h1) return genericFallback(content);
    addMetaRows([
      ["H1", content.h1],
      ["URL slug", content.url_slug],
      ["SEO title", content.seo_title],
      ["Meta title", content.meta_title],
      ["Meta description", content.meta_description],
      ["Content type", content.content_type],
      ["Search intent", content.search_intent],
      ["Primary keyword", content.primary_keyword],
      ["Image alt text", content.image_alt_text],
    ] as [string, unknown][]);
    if (typeof content.full_article === "string" && content.full_article.trim()) {
      addLabelCaps("Full article");
      renderMarkdown(content.full_article);
    }
    if (Array.isArray(content.faq_section) && content.faq_section.length) addFaq(content.faq_section);
    consumedRemainder(content, new Set(["h1", "url_slug", "seo_title", "meta_title", "meta_description", "content_type", "search_intent", "primary_keyword", "image_alt_text", "full_article", "faq_section"]));
  };

  const renderAssetContent = (asset: PublishingAsset) => {
    const content = asset.content;
    if (!content || typeof content !== "object" || Array.isArray(content)) return genericFallback(content);
    const record = content as Record<string, unknown>;
    switch (asset.outputType) {
      case "VIDEO_SCRIPT":
        return renderVideoScript(record);
      case "LINKEDIN_ARTICLE":
        return renderLinkedInArticle(record);
      case "LINKEDIN_SHORT_POST":
        return renderShortPost(record, "carousel_cards", "Carousel cards");
      case "FACEBOOK_POST":
        return renderShortPost(record);
      case "X_POST":
        return renderXPost(record);
      case "YOUTUBE_REELS_METADATA":
        return renderYoutubeReelsMetadata(record);
      case "INSTAGRAM_REEL":
        return renderInstagramReel(record);
      case "SEO_BLOG":
        return renderSeoBlog(record);
      default:
        return genericFallback(record);
    }
  };

  // --- Pass 1: render every asset section, tracking which content page each starts on ---
  newContentPage();
  const tocEntries: { title: string; page: number }[] = [];
  input.assets.forEach((asset, index) => {
    ensureSpace(60);
    tocEntries.push({ title: asset.channelName || asset.channelKey, page: contentPageCount });
    addAssetHeading(index + 1, asset);
    renderAssetContent(asset);
    cursorY -= 6;
    if (index < input.assets.length - 1) {
      ensureSpace(20);
      page.drawLine({ start: { x: MARGIN, y: cursorY }, end: { x: PAGE_WIDTH - MARGIN, y: cursorY }, thickness: 0.5, color: BORDER });
      cursorY -= 20;
    }
  });

  // --- Insert the cover + contents page at the front, now that page numbers are known ---
  const frontOffset = 1;
  const coverPage = document.insertPage(0, [PAGE_WIDTH, PAGE_HEIGHT]);
  drawCoverHeader(coverPage);

  let coverY = PAGE_HEIGHT - COVER_HEADER_H - 34;
  coverPage.drawRectangle({ x: MARGIN, y: coverY - 46, width: CONTENT_WIDTH, height: 58, color: SOFT, borderColor: BORDER, borderWidth: 0.7 });
  coverPage.drawText("SPECIALTY", { x: MARGIN + 16, y: coverY - 10, size: 7.5, font: boldFont, color: accent });
  coverPage.drawText(sanitizeForFont(input.physician.specialty || "General Medicine", font), { x: MARGIN + 16, y: coverY - 27, size: 10.5, font, color: INK });
  coverPage.drawText("TOTAL ASSETS", { x: MARGIN + 260, y: coverY - 10, size: 7.5, font: boldFont, color: accent });
  coverPage.drawText(`${input.assets.length} publishing asset${input.assets.length === 1 ? "" : "s"}`, { x: MARGIN + 260, y: coverY - 27, size: 10.5, font, color: INK });
  coverY -= 74;

  coverPage.drawText("CONTENTS", { x: MARGIN, y: coverY, size: 9, font: boldFont, color: accent });
  coverY -= 22;
  const availableTocHeight = coverY - (MARGIN + 90);
  const tocRowHeight = tocEntries.length > 0 ? Math.min(30, Math.max(16, availableTocHeight / tocEntries.length)) : 20;
  tocEntries.forEach((entry, index) => {
    if (coverY - tocRowHeight < MARGIN + 90) return;
    const indexText = `${index + 1}`;
    coverPage.drawText(indexText, { x: MARGIN, y: coverY - tocRowHeight + 9, size: 10, font, color: accent });
    coverPage.drawText(sanitizeForFont(entry.title, boldFont), { x: MARGIN + 26, y: coverY - tocRowHeight + 9, size: 11, font: boldFont, color: INK });
    const pageText = `${entry.page + frontOffset}`;
    coverPage.drawText(pageText, { x: PAGE_WIDTH - MARGIN - font.widthOfTextAtSize(pageText, 10), y: coverY - tocRowHeight + 9, size: 10, font, color: accent });
    coverPage.drawLine({ start: { x: MARGIN, y: coverY - tocRowHeight }, end: { x: PAGE_WIDTH - MARGIN, y: coverY - tocRowHeight }, thickness: 0.5, color: BORDER });
    coverY -= tocRowHeight;
  });
  coverY -= 24;
  const noteLines = wrapText(
    "Each section below reproduces one publishing asset generated for this case, together with its current workflow status, for editorial review before publication.",
    font,
    8.5,
    CONTENT_WIDTH,
  );
  for (const line of noteLines) {
    coverPage.drawText(line, { x: MARGIN, y: coverY, size: 8.5, font, color: MUTED });
    coverY -= 13;
  }

  // --- Final pass: footer on every page ---
  const pages = document.getPages();
  pages.forEach((currentPage, index) => {
    currentPage.drawLine({ start: { x: MARGIN, y: 44 }, end: { x: PAGE_WIDTH - MARGIN, y: 44 }, thickness: 0.5, color: BORDER });
    currentPage.drawText(sanitizeForFont(`${orgName}  ·  Publishing Asset Descriptions`, font), { x: MARGIN, y: 30, size: 7.5, font, color: MUTED });
    const pageLabel = `Page ${index + 1} of ${pages.length}`;
    currentPage.drawText(pageLabel, { x: PAGE_WIDTH - MARGIN - font.widthOfTextAtSize(pageLabel, 7.5), y: 30, size: 7.5, font, color: MUTED });
    const complianceLine = "Generated under NMC-registered medical practitioner supervision — for internal publishing review only";
    currentPage.drawText(sanitizeForFont(complianceLine, font), { x: PAGE_WIDTH / 2 - font.widthOfTextAtSize(complianceLine, 7) / 2, y: 18, size: 7, font, color: MUTED });
  });

  return document.save();
}
