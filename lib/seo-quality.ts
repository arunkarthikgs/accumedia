import crypto from "node:crypto";

const STOP_WORDS = new Set(["the", "and", "for", "with", "from", "this", "that", "into", "about", "your", "what", "when"]);

export function createContentHash(value: string) {
  return crypto.createHash("sha256").update(value.trim().toLowerCase().replace(/\s+/g, " ")).digest("hex");
}

export function assessSeoQuality(input: {
  primaryKeyword?: string | null;
  secondaryKeywords?: unknown;
  longTailKeywords?: unknown;
  searchIntent?: string | null;
  article?: string | null;
}) {
  const issues: string[] = [];
  const primary = input.primaryKeyword?.trim() || "";
  const secondary = Array.isArray(input.secondaryKeywords) ? input.secondaryKeywords.filter(Boolean).map(String) : [];
  const longTail = Array.isArray(input.longTailKeywords) ? input.longTailKeywords.filter(Boolean).map(String) : [];
  if (primary.length < 3) issues.push("A meaningful primary keyword is required.");
  if (secondary.length < 3) issues.push("At least three secondary keywords are required.");
  if (longTail.length < 3) issues.push("At least three long-tail keywords are required.");
  if (!input.searchIntent?.trim()) issues.push("Search intent is missing.");
  const article = input.article || "";
  if (article.length < 800) issues.push("The article is shorter than the recommended 800-character quality threshold.");
  if (primary && article && !article.toLowerCase().includes(primary.toLowerCase())) issues.push("The primary keyword does not appear in the article.");
  const keywordWords = [primary, ...secondary, ...longTail].flatMap((keyword) => keyword.toLowerCase().split(/\W+/)).filter((word) => word.length > 2 && !STOP_WORDS.has(word));
  const uniqueWords = new Set(keywordWords);
  const score = Math.max(0, Math.min(100, 100 - issues.length * 15 + Math.min(10, uniqueWords.size)));
  const hashSource = article || JSON.stringify({ primary, secondary, longTail, searchIntent: input.searchIntent || "" });
  return { score, issues, contentHash: createContentHash(hashSource) };
}