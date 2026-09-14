import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { uploadImageToR2 } from "@/lib/r2";

/**
 * RFP §15 — "The system should include a clear 'Use this image publicly:
 * Yes/No' selection and obtain a user confirmation that patient-identifying
 * information has been removed and appropriate consent exists where
 * required. Uploaded clinical images should never be auto-published without
 * explicit approval."
 *
 * consentConfirmed and publicUseApproved are therefore both required,
 * explicit booleans from the caller — neither defaults to true, and this
 * route refuses to set publicUseApproved=true without consentConfirmed=true
 * also being present in the same request.
 */
export async function POST(
  req: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await props.params;
    const formData = await req.formData();
    const imageFile = formData.get("image") as File | null;
    const channel = formData.get("channel") as string | null;
    const consentConfirmed = formData.get("consentConfirmed") === "true";
    const publicUseApproved = formData.get("publicUseApproved") === "true";

    if (!imageFile) {
      return NextResponse.json({ error: "image file is required." }, { status: 400 });
    }
    if (!channel) {
      return NextResponse.json({ error: "channel is required." }, { status: 400 });
    }
    if (publicUseApproved && !consentConfirmed) {
      return NextResponse.json(
        { error: "Cannot approve an image for public use without consentConfirmed=true." },
        { status: 400 }
      );
    }

    const kase = await db.case.findUnique({ where: { id } });
    if (!kase) return NextResponse.json({ error: "Case not found" }, { status: 404 });

    const arrayBuffer = await imageFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const mimeType = imageFile.type || "image/jpeg";

    const { r2Key, storageUrl } = await uploadImageToR2(
      buffer,
      imageFile.name || "clinical-image.jpg",
      mimeType,
      kase.organizationId
    );

    // Doctor-uploaded images always start PENDING on the PHI review status —
    // a face/identifier check is a separate, deterministic pass this route
    // does not perform itself (see the safety-flags TODO in the changelog).
    const image = await db.imageAsset.create({
      data: {
        caseId: id,
        channel,
        sourceType: "doctor_uploaded",
        r2Key,
        storageUrl,
        consentConfirmed,
        publicUseApproved: consentConfirmed ? publicUseApproved : false,
        phiReviewStatus: "PENDING",
      },
    });

    return NextResponse.json({ success: true, image });
  } catch (error: any) {
    console.error("Image upload error:", error);
    return NextResponse.json({ error: error.message || "Image upload failed." }, { status: 500 });
  }
}
