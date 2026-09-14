import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateCaseImage } from "@/lib/image-engine";

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

    const existing = await db.imageAsset.findUnique({ where: { id: imageId } });
    if (!existing) return NextResponse.json({ error: "Image not found" }, { status: 404 });

    // RFP §15 — never let a public-use approval slip through without
    // consent on record, regardless of which flags this particular request
    // is trying to change.
    const nextConsent = consentConfirmed ?? existing.consentConfirmed;
    const nextPublicUse = publicUseApproved ?? existing.publicUseApproved;
    if (nextPublicUse && !nextConsent) {
      return NextResponse.json(
        { error: "Cannot approve for public use without consentConfirmed." },
        { status: 400 }
      );
    }

    const updated = await db.imageAsset.update({
      where: { id: imageId },
      data: {
        consentConfirmed: nextConsent,
        publicUseApproved: nextPublicUse,
        ...(phiReviewStatus ? { phiReviewStatus } : {}),
      },
    });

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
    if (existing.sourceType !== "ai_generated") {
      return NextResponse.json(
        { error: "Only ai_generated images can be regenerated. Delete and re-upload for doctor_uploaded images." },
        { status: 400 }
      );
    }

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
    await db.imageAsset.delete({ where: { id: imageId } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
