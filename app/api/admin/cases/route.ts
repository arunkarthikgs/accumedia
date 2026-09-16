import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuthenticatedUser, requireOrganizationAccess } from "@/lib/tenant-auth";
import { recordAudit } from "@/lib/audit";
import { timeDbOperation } from "@/lib/perf";

export async function GET(req: Request) {
  try {
    const user = await requireAuthenticatedUser();
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get("orgId");
    const status = searchParams.get("status");
    const fromDate = searchParams.get("fromDate");
    const toDate = searchParams.get("toDate");
    const includeContent = searchParams.get("includeContent") === "true";
    const page = Math.max(1, Number(searchParams.get("page") || "1"));
    const pageSize = Math.min(100, Math.max(10, Number(searchParams.get("pageSize") || (includeContent ? "100" : "25"))));

    const where: any = {};
    if (orgId && orgId !== "ALL") where.organizationId = orgId;
    if (user && !user.isSuperAdmin && user.organizationId) where.organizationId = user.organizationId;
    if (status && status !== "ALL") where.status = status;
    if (fromDate || toDate) where.createdAt = {
      ...(fromDate ? { gte: new Date(`${fromDate}T00:00:00.000Z`) } : {}),
      ...(toDate ? { lte: new Date(`${toDate}T23:59:59.999Z`) } : {}),
    };

    const organizationQuery = user?.isSuperAdmin
      ? db.organization.findMany({ select: { id: true, name: true, slug: true }, orderBy: { name: "asc" } })
      : user?.organizationId
        ? db.organization.findMany({ where: { id: user.organizationId }, select: { id: true, name: true, slug: true } })
        : Promise.resolve([]);
    const [cases, count, organizations] = await Promise.all([timeDbOperation("admin cases", () => db.case.findMany({
      where,
      select: {
        id: true,
        title: true,
        status: true,
        rejectionReason: true,
        reviewedBy: true,
        reviewedAt: true,
        createdAt: true,
        ...(includeContent ? { masterRecord: true, safetyAudit: true } : {}),
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
            durationSeconds: true,
            transcriptionStatus: true,
            ...(includeContent ? { r2Key: true, rawTranscript: true, transcribedText: true } : {}),
          },
        },
        ...(includeContent ? { assets: { select: { id: true, channelKey: true, channelName: true, outputType: true, status: true, content: true, validationWarnings: true, validationWordCount: true, validationCharacterCount: true, validationDurationSeconds: true } } } : {}),
        _count: { select: { assets: true } },
        // RFP §16 — surfaced so the admin list can show "N open flags" and
        // disable/redirect the approve action instead of letting it silently
        // fail against the gate in app/api/cases/[id]/approve.
        safetyFlags: {
          where: { status: "OPEN" },
          select: { id: true, flagType: true, detail: true, confidence: true },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    })), db.case.count({ where }), organizationQuery]);

    return NextResponse.json({ success: true, cases, organizations, pagination: { page, pageSize, total: count, totalPages: Math.ceil(count / pageSize) } });
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
    await requireAuthenticatedUser();
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

    const existingCase = await db.case.findUnique({ where: { id: caseId }, select: { organizationId: true } });
    if (!existingCase) return NextResponse.json({ error: "Case not found." }, { status: 404 });
    await requireOrganizationAccess(existingCase.organizationId);

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
    await recordAudit({ organizationId: updated.organizationId, caseId: updated.id, targetType: "CASE", targetId: updated.id, action: status === "REJECTED" ? "CASE_REJECTED" : "CASE_STATUS_CHANGED", detail: rejectionReason || undefined, metadata: { status } });

    return NextResponse.json({ success: true, case: updated });
  } catch (error: any) {
    console.error("Admin case status update error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update case status." },
      { status: 500 }
    );
  }
}
