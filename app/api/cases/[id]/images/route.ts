import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { IMAGE_CHANNELS } from "@/lib/image-engine";
import { requireOrganizationAccess } from "@/lib/tenant-auth";

export async function GET(
  req: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await props.params;
    const kase = await db.case.findUnique({ where: { id }, select: { organizationId: true } });
    if (!kase) return NextResponse.json({ error: "Case not found." }, { status: 404 });
    await requireOrganizationAccess(kase.organizationId);
    const images = await db.imageAsset.findMany({
      where: { caseId: id },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ images });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * RFP §14 — trigger AI image generation for one channel on an approved
 * case. Requires the case's MCCR to be approved first, same as text assets —
 * an image concept shouldn't be generated from an unapproved clinical record.
 */
export async function POST(
  req: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await props.params;
    const { channel, conceptBrief } = await req.json();

    if (!channel || !IMAGE_CHANNELS.includes(channel)) {
      return NextResponse.json(
        { error: `channel is required and must be one of: ${IMAGE_CHANNELS.join(", ")}` },
        { status: 400 }
      );
    }

    const kase = await db.case.findUnique({ where: { id } });
    if (!kase) return NextResponse.json({ error: "Case not found" }, { status: 404 });
    await requireOrganizationAccess(kase.organizationId);
    if (!kase.mccrApprovedAt) {
      return NextResponse.json(
        { error: "This case's clinical record has not been approved yet — image generation is locked until it is." },
        { status: 409 }
      );
    }

    const job = await db.imageGenerationJob.create({
      data: { caseId: id, organizationId: kase.organizationId, channel, conceptBrief: conceptBrief || null },
    });
    return NextResponse.json({ success: true, job, message: "Image generation queued for background processing." }, { status: 202 });
  } catch (error: any) {
    console.error("Image generation error:", error);
    return NextResponse.json({ error: error.message || "Image generation failed." }, { status: 500 });
  }
}
