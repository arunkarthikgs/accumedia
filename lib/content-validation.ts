type ChannelValidationConfig = {
  wordCountMin?: number | null;
  wordCountMax?: number | null;
  durationLabel?: string | null;
  outputType?: string | null;
};

export type ContentValidation = {
  valid: boolean;
  warnings: string[];
  wordCount: number;
  characterCount: number;
  estimatedDurationSeconds?: number;
};

function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map(contentText).join(" ");
  if (content && typeof content === "object") return Object.values(content).map(contentText).join(" ");
  return "";
}

function arrayValue(content: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) if (Array.isArray(content[key])) return content[key].filter(Boolean);
  return [];
}

function validateSeoBlog(content: Record<string, unknown>, warnings: string[]) {
  const requiredStrings = [
    ["seo_title", "SEO title"], ["h1", "H1"], ["url_slug", "URL slug"],
    ["meta_title", "meta title"], ["meta_description", "meta description"],
    ["primary_keyword", "primary keyword"], ["search_intent", "search intent"],
    ["full_article", "full article"], ["image_alt_text", "image alt text"],
    ["featured_image_brief", "featured image brief"],
  ] as const;
  for (const [key, label] of requiredStrings) {
    if (typeof content[key] !== "string" || !content[key].trim()) warnings.push(`SEO blog is missing ${label}.`);
  }
  const keywordArrays = [
    ["secondary_keywords", "secondary keywords"], ["long_tail_keywords", "long-tail keywords"],
    ["local_keywords", "local SEO keywords"], ["question_keywords", "question-based keywords"],
    ["semantic_keywords", "semantic keywords"],
  ] as const;
  for (const [key, label] of keywordArrays) {
    const values = arrayValue(content, key, key.replaceAll("_", ""));
    if (values.length < 5 || values.length > 10) warnings.push(`SEO blog requires 5-10 ${label}.`);
  }
  const article = typeof content.full_article === "string" ? content.full_article.trim() : "";
  const articleWords = article ? article.split(/\s+/).length : 0;
  if (articleWords < 1000 || articleWords > 1800) warnings.push(`SEO blog full article must contain approximately 1,000-1,800 words (received ${articleWords}).`);
  const faq = arrayValue(content, "faq_section", "faqSection");
  if (faq.length < 3 || faq.length > 6) warnings.push("SEO blog requires 3-6 FAQ entries.");
  if (!arrayValue(content, "suggested_headings", "suggestedHeadings").length) warnings.push("SEO blog requires suggested H2/H3 headings.");
  if (!arrayValue(content, "internal_link_suggestions", "internalLinkSuggestions").length) warnings.push("SEO blog requires internal-link suggestions.");
  if (!arrayValue(content, "external_reference_suggestions", "externalReferenceSuggestions").length) warnings.push("SEO blog requires external-reference suggestions.");
  if (!arrayValue(content, "schema_recommendations", "schemaRecommendations").length) warnings.push("SEO blog requires schema recommendations.");
  if (typeof content.content_type !== "string" && typeof content.contentType !== "string") warnings.push("SEO blog must identify patient-education or professional/clinical content type.");
  return { articleWords };
}

export function validateGeneratedContent(
  content: unknown,
  channel: ChannelValidationConfig,
): ContentValidation {
  const text = contentText(content).trim();
  const wordCount = text ? text.split(/\s+/).length : 0;
  const characterCount = text.length;
  const warnings: string[] = [];
  let measuredWordCount = wordCount;

  if (!text) warnings.push("Generated content is empty.");
  if (channel.outputType === "SEO_BLOG" && content && typeof content === "object" && !Array.isArray(content)) {
    measuredWordCount = validateSeoBlog(content as Record<string, unknown>, warnings).articleWords;
  }
  if (channel.wordCountMin && wordCount < channel.wordCountMin) warnings.push(`Content is below the minimum of ${channel.wordCountMin} words.`);
  if (channel.wordCountMax && wordCount > channel.wordCountMax) warnings.push(`Content exceeds the maximum of ${channel.wordCountMax} words.`);
  const durationMatch = channel.durationLabel?.match(/(\d+)\s*(?:s|sec|min|m)/i);
  if (channel.outputType === "VIDEO_SCRIPT" && durationMatch) {
      const targetSeconds = /min|m/i.test(durationMatch[0]) ? Number(durationMatch[1]) * 60 : Number(durationMatch[1]);
      const estimatedDurationSeconds = Math.round((wordCount / 130) * 60);
      if (Math.abs(estimatedDurationSeconds - targetSeconds) > 15) {
        warnings.push(`Estimated script duration is ${estimatedDurationSeconds}s; target is ${targetSeconds}s.`);
      }
      return { valid: warnings.length === 0, warnings, wordCount: measuredWordCount, characterCount, estimatedDurationSeconds };
    }

    return { valid: warnings.length === 0, warnings, wordCount: measuredWordCount, characterCount };
}
