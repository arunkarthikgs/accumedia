import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { refineClinicalText } from "@/lib/clinical-refiner";
import { findUnredactedRuleMatches, redactClinicalText } from "@/lib/prompts/clinical-redaction";
import { logAIUsage } from "@/lib/ai-usage";
import { assertTokenQuota } from "@/lib/quotas";
import { getResolvedAiPrompts } from "@/lib/ai-prompts";
import { requireAuthenticatedUser, requireOrganizationAccess } from "@/lib/tenant-auth";

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
      ? await db.audioRecording.findUnique({
          where: { id: recordingId },
          select: {
            organizationId: true,
            caseId: true,
            organization: { select: { id: true, clinicalRefinerPrompt: true, defaultDisclaimer: true } },
          },
        })
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
    const organization = recording?.organization || (organizationId
      ? await db.organization.findUnique({
          where: { id: organizationId },
          select: { id: true, clinicalRefinerPrompt: true, defaultDisclaimer: true },
        })
      : null);
    const promptTemplates = organization?.id ? await getResolvedAiPrompts(organization.id, ["CLINICAL_REFINER"]) : new Map();
    const refinerPromptTemplate = promptTemplates.get("CLINICAL_REFINER");
    const redactionRules = await db.complianceRule.findMany({
      where: {
        ruleType: "DPDP_REDACTION",
        isActive: true,
        OR: [{ organizationId: null }, ...(resolvedOrganizationId ? [{ organizationId: resolvedOrganizationId }] : [])],
      },
      select: { patternOrCheck: true, description: true },
    });

    if (recordingId) {
      await db.audioRecording.update({
        where: { id: recordingId },
        data: { transcriptionStatus: "REFINING" },
      });
    }

    // Run Stage 2: LLM Clinical Refinement (GPT-4o)
    const sanitizedInput = redactClinicalText(textToRefine.trim(), redactionRules);
    const unresolvedRules = findUnredactedRuleMatches(sanitizedInput, redactionRules);
    if (unresolvedRules.length > 0) {
      const recording = recordingId
        ? await db.audioRecording.findUnique({ where: { id: recordingId }, select: { caseId: true } })
        : null;
      if (recording?.caseId) {
        await db.safetyFlag.create({
          data: {
            targetType: "CASE",
            caseId: recording.caseId,
            flagType: "pii",
            detail: `LLM refinement blocked: ${unresolvedRules.join("; ")}. Update the database redaction rule before continuing.`,
            confidence: "high",
            status: "OPEN",
          },
        });
      }
      if (recordingId) await db.audioRecording.update({ where: { id: recordingId }, data: { transcriptionStatus: "SAFETY_REVIEW" } });
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
      ? await db.audioRecording.update({
          where: { id: recordingId },
          data: { transcribedText: refinedText, transcriptionStatus: "REFINED", refinerAgent: "gpt-4o", refinerPromptTemplateId: refinerPromptTemplate?.id || null, refinerPromptVersion: refinerPromptTemplate?.version || null },
        })
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
