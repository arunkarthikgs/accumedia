import crypto from "node:crypto";

const STOP_WORDS = new Set(["the", "and", "for", "with", "from", "this", "that", "into", "about", "your", "what", "when"]);

export function createContentHash(value: string) {
  return crypto.createHash("sha256").update(value.trim().toLowerCase().replace(/\s+/g, " ")).digest("hex");
}

export function normalizeSearchIntent(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.filter(Boolean).map(String).join(", ").trim();
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const preferred = record.intent || record.searchIntent || record.label || record.value;
    if (typeof preferred === "string") return preferred.trim();
    return JSON.stringify(value);
  }
  return "";
}

export function assessSeoQuality(input: {
  primaryKeyword?: string | null;
  secondaryKeywords?: unknown;
  longTailKeywords?: unknown;
  localKeywords?: unknown;
  questionKeywords?: unknown;
  semanticKeywords?: unknown;
  searchIntent?: string | null;
  article?: string | null;
}) {
  const issues: string[] = [];
  const primary = typeof input.primaryKeyword === "string" ? input.primaryKeyword.trim() : "";
  const secondary = Array.isArray(input.secondaryKeywords) ? input.secondaryKeywords.filter(Boolean).map(String) : [];
  const longTail = Array.isArray(input.longTailKeywords) ? input.longTailKeywords.filter(Boolean).map(String) : [];
  const local = Array.isArray(input.localKeywords) ? input.localKeywords.filter(Boolean).map(String) : [];
  const questions = Array.isArray(input.questionKeywords) ? input.questionKeywords.filter(Boolean).map(String) : [];
  const semantic = Array.isArray(input.semanticKeywords) ? input.semanticKeywords.filter(Boolean).map(String) : [];
  if (primary.length < 3) issues.push("A meaningful primary keyword is required.");
  if (secondary.length < 5 || secondary.length > 10) issues.push("5-10 secondary keywords are required.");
  if (longTail.length < 5 || longTail.length > 10) issues.push("5-10 long-tail keywords are required.");
  if (local.length < 5 || local.length > 10) issues.push("5-10 local SEO keywords are required; location variants remain optional when appropriate.");
  if (questions.length < 5 || questions.length > 10) issues.push("5-10 question-based keywords are required.");
  if (semantic.length < 5 || semantic.length > 10) issues.push("5-10 semantic keywords are required.");
  const searchIntent = normalizeSearchIntent(input.searchIntent);
  if (!searchIntent) issues.push("Search intent is missing.");
  const article = input.article || "";
  if (article.length < 800) issues.push("The article is shorter than the recommended 800-character quality threshold.");
  if (primary && article && !article.toLowerCase().includes(primary.toLowerCase())) issues.push("The primary keyword does not appear in the article.");
  const keywordWords = [primary, ...secondary, ...longTail, ...local, ...questions, ...semantic].flatMap((keyword) => keyword.toLowerCase().split(/\W+/)).filter((word) => word.length > 2 && !STOP_WORDS.has(word));
  const uniqueWords = new Set(keywordWords);
  const score = Math.max(0, Math.min(100, 100 - issues.length * 15 + Math.min(10, uniqueWords.size)));
  const hashSource = article || JSON.stringify({ primary, secondary, longTail, local, questions, semantic, searchIntent });
  return { score, issues, contentHash: createContentHash(hashSource) };
}