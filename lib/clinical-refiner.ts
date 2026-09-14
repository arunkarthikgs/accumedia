import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function refineClinicalText(
  rawAsrText: string,
  organizationInstructions = "",
  organizationDisclaimer = ""
): Promise<string> {
  if (!rawAsrText || !rawAsrText.trim()) {
    return "";
  }

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    temperature: 0.1, // Low temperature to prevent medical hallucinations
    messages: [
      {
        role: "system",
        content: `You are an expert clinical documentation and medical transcription refiner for healthcare practitioners.

      Organization-specific system instructions:
      ${organizationInstructions || "No additional organization-specific instructions were configured."}

      Organization disclaimer to preserve for applicable generated clinical content:
      ${organizationDisclaimer || "No organization-specific disclaimer was configured."}

Your task:
1. Receive raw, phonetically transcribed speech-to-text from an ASR model.
2. Correct misrecognized clinical terminology, anatomical names, surgical procedures, and brand/generic drug names with standard medical spellings (e.g., "met for min" -> "Metformin", "apendecktomy" -> "appendectomy").
3. Fix punctuation, paragraph breaks, and capitalization of standard medical acronyms (e.g., BP, ECG, SpO2, PR, HbA1c).
4. Strictly DO NOT hallucinate, diagnose, infer unstated labs, or invent clinical details that were not in the dictation.
5. Output ONLY the refined clinical dictation narrative in clean markdown paragraphs. Do not add conversational intro or outro.`,
      },
      {
        role: "user",
        content: rawAsrText,
      },
    ],
  });

  return response.choices[0]?.message?.content?.trim() || rawAsrText;
}
