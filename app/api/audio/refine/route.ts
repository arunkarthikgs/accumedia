import { NextResponse } from "next/server";
import { refineClinicalText } from "@/lib/clinical-refiner";
import { findUnredactedRuleMatches, redactClinicalText } from "@/lib/prompts/clinical-redaction";
import { logAIUsage } from "@/lib/ai-usage";
import { assertTokenQuota } from "@/lib/quotas";
import { getResolvedAiPrompts } from "@/lib/ai-prompts";
import { requireAuthenticatedUser, requireOrganizationAccess } from "@/lib/tenant-auth";
import { query } from "@/lib/worker-db";
import crypto from "node:crypto";

export async function POST(req: Request) {
  try {
    await requireAuthenticatedUser();
    const { recordingId, organizationId, textToRefine } = await req.json();

    if (!textToRefine || !textToRefine.trim()) {
      return NextResponse.json(
        { error: "textToRefine payload is required." },
        { status: 400 }
      );
    }

    const recording = recordingId
      ? (await query<any>(`SELECT ar."organizationId", ar."caseId", o.id AS organization_id, o."clinicalRefinerPrompt", o."defaultDisclaimer" FROM macula.macula_audio_recordings ar JOIN macula.macula_organizations o ON o.id = ar."organizationId" WHERE ar.id = $1 LIMIT 1`, [recordingId])).rows[0]
      : null;
    if (recordingId && !recording) return NextResponse.json({ error: "Recording not found." }, { status: 404 });
    if (recording && organizationId && recording.organizationId !== organizationId) {
      return NextResponse.json({ error: "Recording belongs to another organization." }, { status: 403 });
    }
    const resolvedOrganizationId = recording?.organizationId || organizationId || null;
    if (!resolvedOrganizationId) {
      return NextResponse.json({ error: "organizationId or recordingId is required." }, { status: 400 });
    }
    await requireOrganizationAccess(resolvedOrganizationId);
    const organization = recording || (organizationId ? (await query<any>(`SELECT id, "clinicalRefinerPrompt", "defaultDisclaimer" FROM macula.macula_organizations WHERE id = $1 LIMIT 1`, [organizationId])).rows[0] : null);
    const promptTemplates = organization?.organization_id || organization?.id ? await getResolvedAiPrompts(organization.organization_id || organization.id, ["CLINICAL_REFINER"]) : new Map();
    const refinerPromptTemplate = promptTemplates.get("CLINICAL_REFINER");
    const redactionRules = (await query<{ patternOrCheck: string; description: string }>(`SELECT "patternOrCheck", description FROM macula.macula_compliance_rules WHERE "ruleType" = 'DPDP_REDACTION' AND "isActive" = TRUE AND ("organizationId" IS NULL OR "organizationId" = $1)`, [resolvedOrganizationId])).rows;

    if (recordingId) {
      await query(`UPDATE macula.macula_audio_recordings SET "transcriptionStatus" = 'REFINING', "updatedAt" = NOW() WHERE id = $1`, [recordingId]);
    }

    // Run Stage 2: LLM Clinical Refinement (GPT-4o)
    const sanitizedInput = redactClinicalText(textToRefine.trim(), redactionRules);
    const unresolvedRules = findUnredactedRuleMatches(sanitizedInput, redactionRules);
    if (unresolvedRules.length > 0) {
      const recording = recordingId ? (await query<{ caseId: string | null }>(`SELECT "caseId" FROM macula.macula_audio_recordings WHERE id = $1 LIMIT 1`, [recordingId])).rows[0] : null;
      if (recording?.caseId) {
        await query(`INSERT INTO macula.macula_safety_flags (id, "targetType", "caseId", "flagType", detail, confidence, status) VALUES ($1, 'CASE', $2, 'pii', $3, 'high', 'OPEN')`, [crypto.randomUUID(), recording.caseId, `LLM refinement blocked: ${unresolvedRules.join("; ")}. Update the database redaction rule before continuing.`]);
      }
      if (recordingId) await query(`UPDATE macula.macula_audio_recordings SET "transcriptionStatus" = 'SAFETY_REVIEW', "updatedAt" = NOW() WHERE id = $1`, [recordingId]);
      return NextResponse.json({ error: "Refinement was blocked because possible identifying information remains after redaction.", safetyReviewRequired: true, unresolvedRules }, { status: 422 });
    }
    if (resolvedOrganizationId) await assertTokenQuota(resolvedOrganizationId, Math.ceil(sanitizedInput.length / 4) + 2048);
    const refinedText = redactClinicalText(
      await refineClinicalText(
        sanitizedInput,
        refinerPromptTemplate?.content || organization?.clinicalRefinerPrompt || undefined,
        organization?.defaultDisclaimer || ""
      ),
      redactionRules
    );

    if (resolvedOrganizationId) {
      await logAIUsage({
        organizationId: resolvedOrganizationId,
        operation: "clinical_refinement",
        provider: "OpenAI",
        model: "gpt-4o",
      });
    }

    // Update DB with final refined text and status
    const updated = recordingId
      ? (await query<any>(`UPDATE macula.macula_audio_recordings SET "transcribedText" = $1, "transcriptionStatus" = 'REFINED', "refinerAgent" = 'gpt-4o', "refinerPromptTemplateId" = $2, "refinerPromptVersion" = $3, "updatedAt" = NOW() WHERE id = $4 RETURNING id, "transcriptionStatus"`, [refinedText, refinerPromptTemplate?.id || null, refinerPromptTemplate?.version || null, recordingId])).rows[0]
      : null;

    return NextResponse.json({
      success: true,
      recordingId: updated?.id || null,
      transcribedText: refinedText,
      transcriptionStatus: updated?.transcriptionStatus || "REFINED",
    });
  } catch (error: any) {
    console.error("Refinement step failure:", error);
    return NextResponse.json(
      { error: error.message || "Failed during clinical text refinement." },
      { status: 500 }
    );
  }
}
