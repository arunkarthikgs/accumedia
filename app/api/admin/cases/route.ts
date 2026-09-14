import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuthenticatedUser } from "@/lib/tenant-auth";

export async function GET(req: Request) {
  try {
    const user = await requireAuthenticatedUser();
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get("orgId");
    const status = searchParams.get("status");

    const where: any = {};
    if (orgId && orgId !== "ALL") where.organizationId = orgId;
    if (user && !user.isSuperAdmin && user.organizationId) where.organizationId = user.organizationId;
    if (status && status !== "ALL") where.status = status;

    const cases = await db.case.findMany({
      where,
      include: {
        physician: {
          select: {
            id: true,
            name: true,
            email: true,
            registrationNo: true,
            specialty: true,
          },
        },
        organization: {
          select: {
            id: true,
            name: true,
          },
        },
        recordings: {
          select: {
            id: true,
            r2Key: true,
            durationSeconds: true,
            transcriptionStatus: true,
            rawTranscript: true,
            transcribedText: true,
          },
        },
        assets: {
          select: {
            id: true,
            channelKey: true,
            channelName: true,
            outputType: true,
            status: true,
            content: true,
            validationWarnings: true,
            validationWordCount: true,
            validationCharacterCount: true,
            validationDurationSeconds: true,
          },
        },
        sources: {
          select: {
            id: true,
            fileName: true,
            sourceType: true,
            status: true,
            processingError: true,
          },
          orderBy: { createdAt: "desc" },
        },
        // RFP §16 — surfaced so the admin list can show "N open flags" and
        // disable/redirect the approve action instead of letting it silently
        // fail against the gate in app/api/cases/[id]/approve.
        safetyFlags: {
          where: { status: "OPEN" },
          select: { id: true, flagType: true, detail: true, confidence: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, cases });
  } catch (error: any) {
    console.error("Admin cases fetch error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch admin cases." },
      { status: 500 }
    );
  }
}

/**
 * NOTE: this PATCH no longer accepts status: "APPROVED". Approval must go
 * through POST /api/cases/[id]/approve, which checks for open SafetyFlags
 * and triggers the Adaptation Engine — this route previously let an admin
 * flip status straight to APPROVED with neither check, which made the
 * safety gate bypassable in practice. REJECTED (and any future non-approval
 * status change) still goes through here.
 */
export async function PATCH(req: Request) {
  try {
    const { caseId, status, rejectionReason, reviewedBy } = await req.json();

    if (!caseId || !status) {
      return NextResponse.json(
        { error: "caseId and status are required." },
        { status: 400 }
      );
    }

    if (status === "APPROVED") {
      return NextResponse.json(
        {
          error:
            "Approval must go through POST /api/cases/{id}/approve so the safety-flag gate and Adaptation Engine run. This endpoint no longer permits a direct APPROVED transition.",
        },
        { status: 400 }
      );
    }

    const updated = await db.case.update({
      where: { id: caseId },
      data: {
        status,
        rejectionReason: status === "REJECTED" ? rejectionReason : null,
        reviewedBy: reviewedBy || "Admin / Compliance Officer",
        reviewedAt: new Date(),
      },
      include: {
        physician: true,
        organization: true,
      },
    });

    return NextResponse.json({ success: true, case: updated });
  } catch (error: any) {
    console.error("Admin case status update error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update case status." },
      { status: 500 }
    );
  }
}
