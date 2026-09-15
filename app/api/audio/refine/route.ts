import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { refineClinicalText } from "@/lib/clinical-refiner";
import { redactClinicalText } from "@/lib/prompts/clinical-redaction";
import { logAIUsage } from "@/lib/ai-usage";
import { assertTokenQuota } from "@/lib/quotas";

export async function POST(req: Request) {
  try {
    const { recordingId, organizationId, textToRefine } = await req.json();

    if (!textToRefine || !textToRefine.trim()) {
      return NextResponse.json(
        { error: "textToRefine payload is required." },
        { status: 400 }
      );
    }

    const organization = recordingId
      ? (await db.audioRecording.findUnique({
          where: { id: recordingId },
          select: { organization: { select: { customSystemPrompt: true, defaultDisclaimer: true } } },
        }))?.organization
      : organizationId
        ? await db.organization.findUnique({
            where: { id: organizationId },
            select: { customSystemPrompt: true, defaultDisclaimer: true },
          })
        : null;

    const resolvedOrganizationId = organizationId || (recordingId ? (await db.audioRecording.findUnique({ where: { id: recordingId }, select: { organizationId: true } }))?.organizationId : null);
    const redactionRules = await db.complianceRule.findMany({
      where: {
        ruleType: "DPDP_REDACTION",
        isActive: true,
        OR: [{ organizationId: null }, ...(resolvedOrganizationId ? [{ organizationId: resolvedOrganizationId }] : [])],
      },
      select: { patternOrCheck: true },
    });

    if (recordingId) {
      await db.audioRecording.update({
        where: { id: recordingId },
        data: { transcriptionStatus: "REFINING" },
      });
    }

    // Run Stage 2: LLM Clinical Refinement (GPT-4o)
    const sanitizedInput = redactClinicalText(textToRefine.trim(), redactionRules);
    if (resolvedOrganizationId) await assertTokenQuota(resolvedOrganizationId, Math.ceil(sanitizedInput.length / 4) + 2048);
    const refinedText = redactClinicalText(
      await refineClinicalText(
        sanitizedInput,
        organization?.customSystemPrompt || "",
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
          data: { transcribedText: refinedText, transcriptionStatus: "REFINED", refinerAgent: "gpt-4o" },
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
