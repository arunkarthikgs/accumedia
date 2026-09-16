import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
import { getASRPromptProfile } from "@/lib/asr/prompts";
import { MANDATORY_CLINICAL_SYNTHESIS_PROMPT } from "@/lib/prompts/clinical-synthesis";
import { DEFAULT_CLINICAL_REFINER_PROMPT } from "@/lib/clinical-refiner";
import { requireAuthenticatedUser, requireOrganizationAccess } from "@/lib/tenant-auth";

export async function GET(req: Request) {
  try {
    const user = await requireAuthenticatedUser();
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get("orgId");
    const recordingId = searchParams.get("recordingId");
    const requestedModel = searchParams.get("model");
    if (orgId) await requireOrganizationAccess(orgId);
    if (!orgId && !recordingId && !user?.isSuperAdmin) {
      return NextResponse.json({ error: "Organization or recording scope is required." }, { status: 400 });
    }

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
            organization: { select: { id: true } },
          },
        })
      : null;
      if (recording?.organization?.id) await requireOrganizationAccess(recording.organization.id);

    // 3. Static & dynamic AI prompts used across the ingestion pipeline
    const selectedModel = requestedModel || recording?.transcriptionAgent || process.env.DEFAULT_ASR_MODEL || "whisper-1";
    const asrPromptProfile = getASRPromptProfile(selectedModel);
    const prompts = {
      asrTranscriptionPrompt: asrPromptProfile,
      clinicalRefinerPrompt: {
        agent: "OpenAI GPT-4o (gpt-4o)",
        temperature: 0.1,
        systemPrompt: organization?.clinicalRefinerPrompt || DEFAULT_CLINICAL_REFINER_PROMPT,
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
