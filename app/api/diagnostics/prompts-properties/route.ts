import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
import { DEFAULT_ASR_TRANSCRIPTION_PROMPT, getASRPromptProfile } from "@/lib/asr/prompts";
import { MANDATORY_CLINICAL_SYNTHESIS_PROMPT } from "@/lib/prompts/clinical-synthesis";
import { DEFAULT_CLINICAL_REFINER_PROMPT } from "@/lib/clinical-refiner";
import { DEFAULT_IMAGE_GENERATION_PROMPT, DEFAULT_IMAGE_SAFETY_PROMPT } from "@/lib/image-prompts";
import { getResolvedAiPrompts } from "@/lib/ai-prompts";
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
    const resolvedPrompts = organization?.id
      ? await getResolvedAiPrompts(organization.id, ["ASR_TRANSCRIPTION", "CLINICAL_REFINER", "MASTER_SYNTHESIS", "SEO_KEYWORDS", "IMAGE_GENERATION", "IMAGE_SAFETY"])
      : new Map();
    const clinicalRefinerPrompt = resolvedPrompts.get("CLINICAL_REFINER");
    const masterSynthesisPrompt = resolvedPrompts.get("MASTER_SYNTHESIS");
    const seoKeywordPrompt = resolvedPrompts.get("SEO_KEYWORDS");
    const imageGenerationPrompt = resolvedPrompts.get("IMAGE_GENERATION");
    const imageSafetyPrompt = resolvedPrompts.get("IMAGE_SAFETY");
    const prompts = {
      asrTranscriptionPrompt: asrPromptProfile,
      asrGovernedPrompt: {
        agent: asrPromptProfile.agent,
        systemPrompt: resolvedPrompts.get("ASR_TRANSCRIPTION")?.content || DEFAULT_ASR_TRANSCRIPTION_PROMPT,
        promptTemplateId: resolvedPrompts.get("ASR_TRANSCRIPTION")?.id || null,
        promptVersion: resolvedPrompts.get("ASR_TRANSCRIPTION")?.version || null,
        promptSource: resolvedPrompts.get("ASR_TRANSCRIPTION")?.organizationId ? "organization" : resolvedPrompts.get("ASR_TRANSCRIPTION") ? "global" : "fallback",
      },
      clinicalRefinerPrompt: {
        agent: "OpenAI GPT-4o (gpt-4o)",
        temperature: 0.1,
        systemPrompt: clinicalRefinerPrompt?.content || DEFAULT_CLINICAL_REFINER_PROMPT,
        promptTemplateId: clinicalRefinerPrompt?.id || null,
        promptVersion: clinicalRefinerPrompt?.version || null,
        promptSource: clinicalRefinerPrompt?.organizationId ? "organization" : clinicalRefinerPrompt ? "global" : "fallback",
      },
      organizationSystemPrompt: {
        agent: "Macula Synthesis Engine",
        systemPrompt: `${masterSynthesisPrompt?.content || MANDATORY_CLINICAL_SYNTHESIS_PROMPT}\n\nOrganization-specific instructions:\n${organization?.customSystemPrompt || "No additional organization-specific instructions were configured."}`,
        disclaimer: organization?.defaultDisclaimer || "Standard NMC supervision disclaimer applied.",
        promptTemplateId: masterSynthesisPrompt?.id || null,
        promptVersion: masterSynthesisPrompt?.version || null,
        promptSource: masterSynthesisPrompt?.organizationId ? "organization" : masterSynthesisPrompt ? "global" : "fallback",
      },
      seoKeywordPrompt: {
        agent: "OpenAI GPT-4o (gpt-4o)",
        systemPrompt: seoKeywordPrompt?.content || null,
        promptTemplateId: seoKeywordPrompt?.id || null,
        promptVersion: seoKeywordPrompt?.version || null,
        promptSource: seoKeywordPrompt?.organizationId ? "organization" : seoKeywordPrompt ? "global" : "fallback",
      },
      imageGenerationPrompt: {
        agent: "OpenAI gpt-image-1",
        systemPrompt: imageGenerationPrompt?.content || DEFAULT_IMAGE_GENERATION_PROMPT,
        promptTemplateId: imageGenerationPrompt?.id || null,
        promptVersion: imageGenerationPrompt?.version || null,
        promptSource: imageGenerationPrompt?.organizationId ? "organization" : imageGenerationPrompt ? "global" : "fallback",
      },
      imageSafetyPrompt: {
        agent: "OpenAI GPT-4o (gpt-4o)",
        name: "Clinical Image Safety",
        description: "Screens generated or uploaded clinical imagery for privacy, safety, and public-use risks.",
        systemPrompt: imageSafetyPrompt?.content || DEFAULT_IMAGE_SAFETY_PROMPT,
        promptTemplateId: imageSafetyPrompt?.id || null,
        promptVersion: imageSafetyPrompt?.version || null,
        promptSource: imageSafetyPrompt?.organizationId ? "organization" : imageSafetyPrompt ? "global" : "fallback",
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
