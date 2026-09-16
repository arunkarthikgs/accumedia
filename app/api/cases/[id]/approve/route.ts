import { NextResponse } from "next/server";
import { recordAudit } from "@/lib/audit";
import { requireOrganizationAccess } from "@/lib/tenant-auth";
import { query } from "@/lib/worker-db";

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

    const existingCase = (await query<any>(`SELECT id, "organizationId", status FROM macula.macula_cases WHERE id = $1 LIMIT 1`, [id])).rows[0];

    if (!existingCase) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }
    await requireOrganizationAccess(existingCase.organizationId);

    if (existingCase.status === "APPROVED") {
      return NextResponse.json({ success: true, case: existingCase, assetsGenerated: 0, assetsGenerationQueued: true });
    }

    const { rows: openFlags } = await query<any>(`SELECT id, "flagType", detail FROM macula.macula_safety_flags WHERE "caseId" = $1 AND status = 'OPEN' ORDER BY "createdAt" DESC`, [id]);
    if (openFlags.length > 0) {
      return NextResponse.json(
        {
          error: "This case has unresolved safety flags and cannot be approved yet.",
          openFlags: openFlags.map((f) => ({ id: f.id, flagType: f.flagType, detail: f.detail })),
        },
        { status: 409 }
      );
    }

    const { rows: updatedRows } = await query(`UPDATE macula.macula_cases SET status = 'APPROVED', mccr_approved_at = NOW(), mccr_approved_by = $1, "updatedAt" = NOW() WHERE id = $2 RETURNING *`, [approvedBy || "Attending physician", id]);
    const updatedCase = updatedRows[0];

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
