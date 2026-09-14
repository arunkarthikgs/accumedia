import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * RFP §16 — "Potentially problematic content should be flagged for human
 * review, not silently altered or published." This is that queue's backend.
 * GET lists open flags (optionally scoped to an org); PATCH records a human
 * decision — it never auto-resolves anything.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get("orgId");
    const caseId = searchParams.get("caseId");
    const status = searchParams.get("status") || "OPEN";

    const flags = await db.safetyFlag.findMany({
      where: {
        status: status === "ALL" ? undefined : (status as any),
        ...(orgId ? { case: { organizationId: orgId } } : {}),
        ...(caseId ? { caseId } : {}),
      },
      include: {
        case: { select: { id: true, title: true, organizationId: true, physician: { select: { name: true } } } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ flags });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const { flagId, decision, reviewedBy } = await req.json();
    // decision: "REVIEWED_OK" | "REVIEWED_REDACTED" | "REJECTED"

    if (!flagId || !decision) {
      return NextResponse.json({ error: "flagId and decision are required." }, { status: 400 });
    }
    if (!["REVIEWED_OK", "REVIEWED_REDACTED", "REJECTED"].includes(decision)) {
      return NextResponse.json({ error: "Invalid decision value." }, { status: 400 });
    }

    const updated = await db.safetyFlag.update({
      where: { id: flagId },
      data: {
        status: decision,
        reviewedBy: reviewedBy || "Compliance officer",
        reviewedAt: new Date(),
      },
    });

    return NextResponse.json({ success: true, flag: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
