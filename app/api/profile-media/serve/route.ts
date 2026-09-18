import { NextResponse } from "next/server";
import { requireAuthenticatedUser, requireOrganizationAccess } from "@/lib/tenant-auth";
import { query } from "@/lib/worker-db";
import { getImagePreviewUrl } from "@/lib/r2";

export async function GET(req: Request) {
  try {
    const user = await requireAuthenticatedUser();
    const userId = new URL(req.url).searchParams.get("userId");
    if (!userId) return NextResponse.json({ error: "userId is required." }, { status: 400 });
    const target = (await query<{ organizationId: string | null; profilePhotoR2Key: string | null }>(`SELECT "organizationId", "profilePhotoR2Key" FROM macula.users WHERE id=$1 LIMIT 1`, [userId])).rows[0];
    if (!target) return NextResponse.json({ error: "User not found." }, { status: 404 });
    if (!target.organizationId || (!user.isSuperAdmin && user.organizationId !== target.organizationId)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    await requireOrganizationAccess(target.organizationId);
    if (!target.profilePhotoR2Key) return NextResponse.json({ error: "Profile photo not found." }, { status: 404 });
    return NextResponse.redirect(await getImagePreviewUrl(target.profilePhotoR2Key), 307);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Unable to serve profile photo." }, { status: 500 });
  }
}