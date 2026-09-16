import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuthenticatedUser, requireOrganizationAccess } from "@/lib/tenant-auth";
import { recordAudit } from "@/lib/audit";
import { unstable_cache } from "next/cache";

const getSafetyOrganizations = unstable_cache(
  () => db.organization.findMany({ select: { id: true, name: true, slug: true }, orderBy: { name: "asc" } }),
  ["safety-queue-organizations"],
  { revalidate: 60, tags: ["organizations"] },
);

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
    const flagId = searchParams.get("flagId");
    const status = searchParams.get("status") || "OPEN";
    const user = await requireAuthenticatedUser();
    const scopedOrgId = user?.isSuperAdmin ? orgId : user?.organizationId;
    if (scopedOrgId) await requireOrganizationAccess(scopedOrgId);

    const organizationQuery = user?.isSuperAdmin
      ? getSafetyOrganizations()
      : user?.organizationId
        ? db.organization.findMany({ where: { id: user.organizationId }, select: { id: true, name: true, slug: true } })
        : Promise.resolve([]);
    const [flags, organizations] = await Promise.all([db.safetyFlag.findMany({
      where: {
        status: status === "ALL" ? undefined : (status as any),
        ...(scopedOrgId ? { case: { organizationId: scopedOrgId } } : {}),
        ...(caseId ? { caseId } : {}),
        ...(flagId ? { id: flagId } : {}),
      },
      include: {
        case: {
          select: {
            id: true,
            title: true,
            organizationId: true,
            physician: { select: { name: true } },
            ...(flagId ? { recordings: {
              take: 1,
              orderBy: { recordedAt: "desc" },
              select: { transcribedText: true },
            } } : {}),
          },
        },
        ...(flagId ? { imageAsset: { select: { id: true, channel: true, sourceType: true, phiReviewStatus: true, safetyFindings: true } } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: flagId ? 1 : 50,
    }), organizationQuery]);

    return NextResponse.json({ flags, organizations });
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

    const existing = await db.safetyFlag.findUnique({ where: { id: flagId }, include: { case: { select: { organizationId: true } }, imageAsset: { select: { case: { select: { organizationId: true } } } } } });
    if (!existing) return NextResponse.json({ error: "Safety flag not found." }, { status: 404 });
    const organizationId = existing.case?.organizationId || existing.imageAsset?.case.organizationId;
    if (!organizationId) return NextResponse.json({ error: "Safety flag has no organization." }, { status: 400 });
    await requireOrganizationAccess(organizationId);
    const updated = await db.safetyFlag.update({
      where: { id: flagId },
      data: {
        status: decision,
        reviewedBy: reviewedBy || "Compliance officer",
        reviewedAt: new Date(),
      },
    });
    if (existing.imageAssetId) {
      await db.imageAsset.update({ where: { id: existing.imageAssetId }, data: { phiReviewStatus: decision === "REVIEWED_OK" ? "CLEAR" : "FLAGGED" } });
    }
    await recordAudit({ organizationId, caseId: existing.caseId || undefined, targetType: existing.imageAssetId ? "IMAGE_ASSET" : "CASE", targetId: existing.imageAssetId || existing.caseId || flagId, action: "SAFETY_FLAG_RESOLVED", detail: decision, metadata: { reviewedBy } });

    return NextResponse.json({ success: true, flag: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
