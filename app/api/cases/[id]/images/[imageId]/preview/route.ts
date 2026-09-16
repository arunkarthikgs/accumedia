import { NextResponse } from "next/server";
import { getImagePreviewUrl } from "@/lib/r2";
import { requireOrganizationAccess } from "@/lib/tenant-auth";
import { query } from "@/lib/worker-db";

export async function GET(
  _req: Request,
  props: { params: Promise<{ id: string; imageId: string }> }
) {
  try {
    const { id, imageId } = await props.params;
    const image = (await query<any>(`SELECT ia."r2Key", ia."caseId", c."organizationId" FROM macula.macula_image_assets ia JOIN macula.macula_cases c ON c.id = ia."caseId" WHERE ia.id = $1 LIMIT 1`, [imageId])).rows[0];
    if (!image || image.caseId !== id) return NextResponse.json({ error: "Image not found." }, { status: 404 });
    await requireOrganizationAccess(image.organizationId);
    if (!image.r2Key) return NextResponse.json({ error: "Image storage key is missing." }, { status: 404 });
    return NextResponse.redirect(await getImagePreviewUrl(image.r2Key), { status: 302 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Unable to load image preview." }, { status: 500 });
  }
}