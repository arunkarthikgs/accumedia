import { assessSeoQuality } from "@/lib/seo-quality";
import { createOpenAIChatCompletion } from "@/lib/openai-fetch";

export const DEFAULT_SEO_KEYWORD_PROMPT = `Generate a standalone SEO keyword strategy for this approved clinical record. Return JSON only with primaryKeyword, secondaryKeywords, longTailKeywords, localKeywords, questionKeywords, semanticKeywords, and searchIntent. Use educational, medically accurate language. Do not include patient identifiers, provider names, facility names, unsupported claims, or guaranteed outcomes.`;

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
  return { keywords: parsed, quality: assessSeoQuality(parsed), usage: response.usage };
}