import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrganizationAccess } from "@/lib/tenant-auth";
import { recordAudit } from "@/lib/audit";

export async function GET(
  _req: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await props.params;
    const kase = await db.case.findUnique({ where: { id }, select: { organizationId: true } });
    if (!kase) return NextResponse.json({ error: "Case not found." }, { status: 404 });
    await requireOrganizationAccess(kase.organizationId);
    const versions = await db.caseVersion.findMany({
      where: { caseId: id },
      orderBy: { version: "desc" },
    });
    return NextResponse.json({ versions });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to load case versions." }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await props.params;
    const body = await req.json();
    const kase = await db.case.findUnique({ where: { id } });
    if (!kase) return NextResponse.json({ error: "Case not found." }, { status: 404 });
    await requireOrganizationAccess(kase.organizationId);

    if (body.action === "restore") {
      if (!body.versionId) return NextResponse.json({ error: "versionId is required for restore." }, { status: 400 });
      const target = await db.caseVersion.findFirst({ where: { id: body.versionId, caseId: id } });
      if (!target) return NextResponse.json({ error: "Version not found." }, { status: 404 });
    } else if (!body.masterRecord || typeof body.masterRecord !== "object") {
      return NextResponse.json({ error: "masterRecord must be a JSON object." }, { status: 400 });
    }

    const versionCount = await db.caseVersion.count({ where: { caseId: id } });
    await db.caseVersion.create({
      data: {
        caseId: id,
        version: versionCount + 1,
        changeType: body.action === "restore" ? "restore" : "manual_edit",
        rawInput: kase.rawInput,
        masterRecord: kase.masterRecord,
        safetyAudit: kase.safetyAudit,
        status: kase.status,
      },
    });

    if (body.action === "restore") {
      const target = await db.caseVersion.findFirst({ where: { id: body.versionId, caseId: id } });
      const updated = await db.case.update({
        where: { id },
        data: {
          rawInput: target.rawInput,
          masterRecord: target.masterRecord,
          safetyAudit: target.safetyAudit,
          status: "PENDING_REVIEW",
          mccrApprovedAt: null,
          mccrApprovedBy: null,
          reviewedAt: null,
          reviewedBy: null,
        },
      });
      await recordAudit({ organizationId: kase.organizationId, caseId: id, targetType: "CASE", targetId: id, action: "CASE_VERSION_RESTORED", metadata: { versionId: body.versionId } });
      return NextResponse.json({ success: true, case: updated });
    }

    const updated = await db.case.update({
      where: { id },
      data: {
        masterRecord: body.masterRecord,
        rawInput: typeof body.rawInput === "string" ? body.rawInput : kase.rawInput,
        status: "PENDING_REVIEW",
        mccrApprovedAt: null,
        mccrApprovedBy: null,
        reviewedAt: null,
        reviewedBy: null,
      },
    });
    await recordAudit({ organizationId: kase.organizationId, caseId: id, targetType: "CASE", targetId: id, action: "MCCR_EDITED", metadata: { version: versionCount + 1 } });
    return NextResponse.json({ success: true, case: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to update case review." }, { status: 500 });
  }
}