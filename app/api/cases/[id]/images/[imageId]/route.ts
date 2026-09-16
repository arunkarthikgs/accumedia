import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrganizationAccess } from "@/lib/tenant-auth";
import { recordAudit } from "@/lib/audit";
import { query } from "@/lib/worker-db";

export async function PATCH(
  req: Request,
  props: { params: Promise<{ id: string; imageId: string }> }
) {
  try {
    const { imageId } = await props.params;
    const body = await req.json();
    const { publicUseApproved, consentConfirmed, phiReviewStatus } = body as {
      publicUseApproved?: boolean;
      consentConfirmed?: boolean;
      phiReviewStatus?: "PENDING" | "CLEAR" | "FLAGGED";
    };

    const existing = (await query<any>(`SELECT * FROM macula.macula_image_assets WHERE id = $1 LIMIT 1`, [imageId])).rows[0];
    if (!existing) return NextResponse.json({ error: "Image not found" }, { status: 404 });
    const kase = (await query<{ organizationId: string }>(`SELECT "organizationId" FROM macula.macula_cases WHERE id = $1 LIMIT 1`, [existing.caseId])).rows[0];
    if (!kase) return NextResponse.json({ error: "Case not found" }, { status: 404 });
    await requireOrganizationAccess(kase.organizationId);

    // RFP §15 — never let a public-use approval slip through without
    // consent on record, regardless of which flags this particular request
    // is trying to change.
    const nextConsent = consentConfirmed ?? existing.consentConfirmed;
    const nextPublicUse = publicUseApproved ?? existing.publicUseApproved;
    const nextPhiStatus = phiReviewStatus ?? existing.phiReviewStatus;
    if (nextPublicUse && !nextConsent) {
      return NextResponse.json(
        { error: "Cannot approve for public use without consentConfirmed." },
        { status: 400 }
      );
    }
    if (nextPublicUse && nextPhiStatus !== "CLEAR") {
      return NextResponse.json(
        { error: "Image must be marked CLEAR by PHI review before public approval." },
        { status: 409 }
      );
    }
    if (nextPublicUse) {
      const openImageFlags = Number((await query<{ count: number }>(`SELECT COUNT(*)::int AS count FROM macula.macula_safety_flags WHERE "imageAssetId" = $1 AND status = 'OPEN'`, [imageId])).rows[0]?.count || 0);
      if (openImageFlags > 0) return NextResponse.json({ error: "Resolve all open image safety flags before public approval." }, { status: 409 });
    }

    const { rows: updatedRows } = await query(`UPDATE macula.macula_image_assets SET "consentConfirmed" = $1, "publicUseApproved" = $2, "phiReviewStatus" = $3, "updatedAt" = NOW() WHERE id = $4 RETURNING *`, [nextConsent, nextPublicUse, nextPhiStatus, imageId]);
    const updated = updatedRows[0];
    await recordAudit({ organizationId: kase.organizationId, caseId: existing.caseId, targetType: "IMAGE_ASSET", targetId: imageId, action: phiReviewStatus ? "IMAGE_PHI_REVIEW_UPDATED" : "IMAGE_PUBLIC_USE_UPDATED", metadata: { phiReviewStatus: nextPhiStatus, publicUseApproved: nextPublicUse } });

    return NextResponse.json({ success: true, image: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/** Regenerate an AI-generated image in place (doctor-uploaded images can't be "regenerated" — delete + re-upload instead). */
export async function POST(
  req: Request,
  props: { params: Promise<{ id: string; imageId: string }> }
) {
  try {
    const { id, imageId } = await props.params;
    const body = await req.json().catch(() => ({}));

    const existing = await db.imageAsset.findUnique({ where: { id: imageId } });
    if (!existing) return NextResponse.json({ error: "Image not found" }, { status: 404 });
    const kase = await db.case.findUnique({ where: { id: existing.caseId }, select: { organizationId: true } });
    if (!kase) return NextResponse.json({ error: "Case not found" }, { status: 404 });
    await requireOrganizationAccess(kase.organizationId);
    if (existing.sourceType !== "ai_generated") {
      return NextResponse.json(
        { error: "Only ai_generated images can be regenerated. Delete and re-upload for doctor_uploaded images." },
        { status: 400 }
      );
    }

    const { generateCaseImage } = await import("@/lib/image-engine");
    const regenerated = await generateCaseImage(id, existing.channel as any, body.conceptBrief);
    await db.imageAsset.delete({ where: { id: imageId } });

    return NextResponse.json({ success: true, image: regenerated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  props: { params: Promise<{ id: string; imageId: string }> }
) {
  try {
    const { imageId } = await props.params;
    const existing = (await query<any>(`SELECT ia.*, c."organizationId" FROM macula.macula_image_assets ia JOIN macula.macula_cases c ON c.id = ia."caseId" WHERE ia.id = $1 LIMIT 1`, [imageId])).rows[0];
    if (!existing) return NextResponse.json({ error: "Image not found" }, { status: 404 });
    await requireOrganizationAccess(existing.organizationId);
    await query(`DELETE FROM macula.macula_image_assets WHERE id = $1`, [imageId]);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
