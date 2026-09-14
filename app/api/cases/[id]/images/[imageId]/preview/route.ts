import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getImagePreviewUrl } from "@/lib/r2";
import { requireOrganizationAccess } from "@/lib/tenant-auth";

export async function GET(
  _req: Request,
  props: { params: Promise<{ id: string; imageId: string }> }
) {
  try {
    const { id, imageId } = await props.params;
    const image = await db.imageAsset.findUnique({
      where: { id: imageId },
      include: { case: { select: { id: true, organizationId: true } } },
    });
    if (!image || image.case.id !== id) return NextResponse.json({ error: "Image not found." }, { status: 404 });
    await requireOrganizationAccess(image.case.organizationId);
    if (!image.r2Key) return NextResponse.json({ error: "Image storage key is missing." }, { status: 404 });
    return NextResponse.redirect(await getImagePreviewUrl(image.r2Key), { status: 302 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Unable to load image preview." }, { status: 500 });
  }
}