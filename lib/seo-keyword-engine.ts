import { assessSeoQuality, normalizeSearchIntent } from "@/lib/seo-quality";
import { createOpenAIChatCompletion } from "@/lib/openai-fetch";

export const DEFAULT_SEO_KEYWORD_PROMPT = `Generate a standalone SEO keyword strategy for this approved clinical record.
Return JSON only with exactly these fields:
primaryKeyword (one string), secondaryKeywords (5-10 strings), longTailKeywords (5-10 strings), localKeywords (5-10 strings), questionKeywords (5-10 strings), semanticKeywords (5-10 strings), and searchIntent (one string).
Location-specific variations are optional and should be included in localKeywords only when clinically and geographically appropriate; never invent a location.
Use educational, medically accurate language. Do not include patient identifiers, provider names, facility names, unsupported claims, or guaranteed outcomes.`;

export async function generateSeoKeywordSet(input: { masterRecord: Record<string, unknown>; prompt?: string }) {
  const response = await createOpenAIChatCompletion({
    model: "gpt-4o",
    temperature: 0.2,
    jsonMode: true,
    messages: [
      { role: "system", content: input.prompt || DEFAULT_SEO_KEYWORD_PROMPT },
      { role: "user", content: `Approved clinical record:\n${JSON.stringify(input.masterRecord, null, 2)}` },
    ],
  });
  const parsed = JSON.parse(response.choices[0]?.message?.content || "{}");
  const keywords = {
    ...parsed,
    searchIntent: normalizeSearchIntent(parsed.searchIntent),
  };
  return { keywords, quality: assessSeoQuality(keywords), usage: response.usage };
}