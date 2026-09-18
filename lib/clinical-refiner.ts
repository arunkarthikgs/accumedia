import { createOpenAIChatCompletion } from "@/lib/openai-fetch";

export const DEFAULT_CLINICAL_REFINER_PROMPT = `You are an expert clinical documentation and medical transcription refiner for healthcare practitioners.

Your task:
1. Receive raw, phonetically transcribed speech-to-text from an ASR model.
2. Correct misrecognized clinical terminology, anatomical names, surgical procedures, and brand/generic drug names with standard medical spellings.
3. Fix punctuation, paragraph breaks, and capitalization of standard medical acronyms.
4. Strictly DO NOT hallucinate, diagnose, infer unstated labs, or invent clinical details that were not in the dictation.
5. Tokens in the form [REDACTED_*] are privacy placeholders. Preserve each token exactly as written. Never expand, explain, rename, infer, or attach a placeholder to unrelated clinical terminology.
6. Output ONLY the refined clinical dictation narrative in clean markdown paragraphs. Do not add conversational intro or outro.`;

export async function refineClinicalText(
  rawAsrText: string,
  refinerPrompt = DEFAULT_CLINICAL_REFINER_PROMPT,
  _organizationDisclaimer = ""
): Promise<string> {
  if (!rawAsrText || !rawAsrText.trim()) {
    return "";
  }

  const response = await createOpenAIChatCompletion({
    model: "gpt-4o",
    temperature: 0.1,
    messages: [
      {
        role: "system",
        content: refinerPrompt || DEFAULT_CLINICAL_REFINER_PROMPT,
      },
      {
        role: "user",
        content: rawAsrText,
      },
    ],
  });

  const refinedText = response.choices?.[0]?.message?.content?.trim() || rawAsrText;
  const sourceTokens = rawAsrText.match(/\[REDACTED_[A-Z0-9_]+\]/g) || [];
  const refinedTokens = refinedText.match(/\[REDACTED_[A-Z0-9_]+\]/g) || [];
  const sourceTokenCounts = new Map<string, number>();
  const refinedTokenCounts = new Map<string, number>();
  for (const token of sourceTokens) sourceTokenCounts.set(token, (sourceTokenCounts.get(token) || 0) + 1);
  for (const token of refinedTokens) refinedTokenCounts.set(token, (refinedTokenCounts.get(token) || 0) + 1);
  for (const [token, count] of sourceTokenCounts) {
    if (refinedTokenCounts.get(token) !== count) return rawAsrText;
  }
  return refinedText;
}
