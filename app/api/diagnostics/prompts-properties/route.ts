import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
import { getASRPromptProfile } from "@/lib/asr/prompts";
import { MANDATORY_CLINICAL_SYNTHESIS_PROMPT } from "@/lib/prompts/clinical-synthesis";
import { DEFAULT_CLINICAL_REFINER_PROMPT } from "@/lib/clinical-refiner";
import { requireAuthenticatedUser, requireOrganizationAccess } from "@/lib/tenant-auth";
import { query } from "@/lib/worker-db";

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
    const organization = orgId ? (await query<any>(`SELECT o.*, COALESCE((SELECT json_agg(cd) FROM macula.channel_definitions cd WHERE cd."organizationId"=o.id AND cd."isActive"=TRUE), '[]') AS "channelDefinitions", COALESCE((SELECT json_agg(cr) FROM macula.compliance_rules cr WHERE cr."organizationId"=o.id AND cr."isActive"=TRUE), '[]') AS "complianceRules" FROM macula.organizations o WHERE o.id=$1 LIMIT 1`, [orgId])).rows[0] : null;

    // 2. Fetch recording DB record if available
    const recording = recordingId ? (await query<any>(`SELECT ar.*, json_build_object('id', u.id, 'name', u.name, 'email', u.email, 'registrationNo', u."registrationNo") AS user, json_build_object('id', o.id) AS organization FROM macula.audio_recordings ar LEFT JOIN macula.users u ON u.id=ar."userId" JOIN macula.organizations o ON o.id=ar."organizationId" WHERE ar.id=$1 LIMIT 1`, [recordingId])).rows[0] : null;
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
