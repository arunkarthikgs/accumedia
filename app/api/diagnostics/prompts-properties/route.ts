import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
import { getASRPromptProfile } from "@/lib/asr/prompts";
import { MANDATORY_CLINICAL_SYNTHESIS_PROMPT } from "@/lib/prompts/clinical-synthesis";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get("orgId");
    const recordingId = searchParams.get("recordingId");
    const requestedModel = searchParams.get("model");

    // 1. Fetch organization & channel definitions from DB
    const organization = orgId
      ? await db.organization.findUnique({
          where: { id: orgId },
          include: {
            channelDefinitions: { where: { isActive: true } },
            complianceRules: { where: { isActive: true } },
          },
        })
      : null;

    // 2. Fetch recording DB record if available
    const recording = recordingId
      ? await db.audioRecording.findUnique({
          where: { id: recordingId },
          include: {
            user: { select: { id: true, name: true, email: true, registrationNo: true } },
          },
        })
      : null;

    // 3. Static & dynamic AI prompts used across the ingestion pipeline
    const selectedModel = requestedModel || recording?.transcriptionAgent || process.env.DEFAULT_ASR_MODEL || "whisper-1";
    const asrPromptProfile = getASRPromptProfile(selectedModel);
    const prompts = {
      asrTranscriptionPrompt: asrPromptProfile,
      clinicalRefinerPrompt: {
        agent: "OpenAI GPT-4o (gpt-4o)",
        temperature: 0.1,
        systemPrompt: `You are an expert clinical documentation and medical transcription refiner for healthcare practitioners.

Your task:
1. Receive raw, phonetically transcribed speech-to-text from an ASR model.
2. Correct misrecognized clinical terminology, anatomical names, surgical procedures, and brand/generic drug names with standard medical spellings (e.g., "met for min" -> "Metformin", "apendecktomy" -> "appendectomy").
3. Fix punctuation, paragraph breaks, and capitalization of standard medical acronyms (e.g., BP, ECG, SpO2, PR, HbA1c).
4. Strictly DO NOT hallucinate, diagnose, infer unstated labs, or invent clinical details that were not in the dictation.
5. Output ONLY the refined clinical dictation narrative in clean markdown paragraphs. Do not add conversational intro or outro.`,
      },
      organizationSystemPrompt: {
        agent: "Macula Synthesis Engine",
        systemPrompt: `${MANDATORY_CLINICAL_SYNTHESIS_PROMPT}\n\nOrganization-specific instructions:\n${organization?.customSystemPrompt || "No additional organization-specific instructions were configured."}`,
        disclaimer: organization?.defaultDisclaimer || "Standard NMC supervision disclaimer applied.",
      },
      channelPrompts: organization?.channelDefinitions.map((c) => ({
        channelKey: c.channelKey,
        displayName: c.displayName,
        targetAudience: c.targetAudience,
        systemPrompt: c.systemPrompt,
      })) || [],
    };

    return NextResponse.json({
      success: true,
      prompts,
      databaseProperties: {
        organization,
        audioRecording: recording,
      },
    });
  } catch (error: any) {
    console.error("Diagnostics API error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to load prompts and properties." },
      { status: 500 }
    );
  }
}
