import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getImagePreviewUrl } from "@/lib/r2";
import { requireOrganizationAccess } from "@/lib/tenant-auth";

export async function GET(_req: Request, props: { params: Promise<{ id: string; assetId: string }> }) {
  try {
    const { id, assetId } = await props.params;
    const asset = await db.generatedAsset.findUnique({ where: { id: assetId }, include: { case: { select: { id: true, organizationId: true } } } });
    if (!asset || asset.case.id !== id) return NextResponse.json({ error: "Asset not found." }, { status: 404 });
    await requireOrganizationAccess(asset.case.organizationId);
    if (!asset.videoR2Key) return NextResponse.json({ error: "Rendered video is not available." }, { status: 404 });
    return NextResponse.redirect(await getImagePreviewUrl(asset.videoR2Key), { status: 302 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Unable to load rendered video." }, { status: 500 });
  }
}