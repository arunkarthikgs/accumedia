import { NextResponse } from "next/server";
import { getImagePreviewUrl } from "@/lib/r2";
import { requireOrganizationAccess } from "@/lib/tenant-auth";
import { query } from "@/lib/worker-db";

export async function GET(_req: Request, props: { params: Promise<{ id: string; assetId: string }> }) {
  try {
    const { id, assetId } = await props.params;
    const asset = (await query<any>(`SELECT ga."videoR2Key", c.id AS case_id, c."organizationId" FROM macula.generated_assets ga JOIN macula.cases c ON c.id=ga."caseId" WHERE ga.id=$1 LIMIT 1`, [assetId])).rows[0];
    if (!asset || asset.case_id !== id) return NextResponse.json({ error: "Asset not found." }, { status: 404 });
    await requireOrganizationAccess(asset.organizationId);
    if (!asset.videoR2Key) return NextResponse.json({ error: "Rendered video is not available." }, { status: 404 });
    return NextResponse.redirect(await getImagePreviewUrl(asset.videoR2Key), { status: 302 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Unable to load rendered video." }, { status: 500 });
  }
}