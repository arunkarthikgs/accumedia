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
  organizationDisclaimer = ""
): Promise<string> {
  if (!rawAsrText || !rawAsrText.trim()) {
    return "";
  }

  const response = await createOpenAIChatCompletion({
    model: "gpt-4o",
    temperature: 0.1, // Low temperature to prevent medical hallucinations
    messages: [
      {
        role: "system",
        content: `${refinerPrompt || DEFAULT_CLINICAL_REFINER_PROMPT}

      Organization disclaimer to preserve for applicable generated clinical content:
      ${organizationDisclaimer || "No organization-specific disclaimer was configured."}

Your task:
1. Receive raw, phonetically transcribed speech-to-text from an ASR model.
2. Correct misrecognized clinical terminology, anatomical names, surgical procedures, and brand/generic drug names with standard medical spellings (e.g., "met for min" -> "Metformin", "apendecktomy" -> "appendectomy").
3. Fix punctuation, paragraph breaks, and capitalization of standard medical acronyms (e.g., BP, ECG, SpO2, PR, HbA1c).
4. Strictly DO NOT hallucinate, diagnose, infer unstated labs, or invent clinical details that were not in the dictation.
5. Tokens in the form [REDACTED_*] are privacy placeholders. Preserve each token exactly as written. Never expand, explain, rename, infer, or attach a placeholder to unrelated clinical terminology.
6. Output ONLY the refined clinical dictation narrative in clean markdown paragraphs. Do not add conversational intro or outro.`,
      },
      {
        role: "user",
        content: rawAsrText,
      },
    ],
  });

  return response.choices?.[0]?.message?.content?.trim() || rawAsrText;
}
