import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";

/**
 * RFP §6 + §16 — this is the MCCR approval gate. Two things it must do
 * that the previous version didn't:
 *   1. Refuse to approve while any SafetyFlag on this case is still OPEN.
 *      Flags are never silently resolved — a human has to act on them
 *      first, via PATCH /api/safety-flags/[id].
 *   2. Only AFTER approval succeeds, unlock the Adaptation Engine to
 *      generate the per-platform assets — generation must follow approval,
 *      not precede it.
 */
export async function POST(
  req: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await props.params;
    const body = await req.json().catch(() => ({}));
    const approvedBy: string | undefined = body?.approvedBy;

    const existingCase = await db.case.findUnique({
      where: { id },
      include: { safetyFlags: true, assets: true },
    });

    if (!existingCase) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }

    const openFlags = existingCase.safetyFlags.filter((f) => f.status === "OPEN");
    if (openFlags.length > 0) {
      return NextResponse.json(
        {
          error: "This case has unresolved safety flags and cannot be approved yet.",
          openFlags: openFlags.map((f) => ({ id: f.id, flagType: f.flagType, detail: f.detail })),
        },
        { status: 409 }
      );
    }

    const updatedCase = await db.case.update({
      where: { id },
      data: {
        status: "APPROVED",
        mccrApprovedAt: new Date(),
        mccrApprovedBy: approvedBy || "Attending physician",
      },
    });

    await recordAudit({ organizationId: existingCase.organizationId, caseId: id, targetType: "CASE", targetId: id, action: "CASE_APPROVED", detail: `Approved by ${approvedBy || "Attending physician"}.`, metadata: { assetsGeneration: "queued_for_explicit_action" } });

    return NextResponse.json({
      success: true,
      case: updatedCase,
      assetsGenerated: 0,
      assetsGenerationQueued: true,
    });
  } catch (error: any) {
    console.error("Error approving case:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
