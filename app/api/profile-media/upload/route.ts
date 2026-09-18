import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { requireAuthenticatedUser, requireOrganizationAccess } from "@/lib/tenant-auth";
import { query } from "@/lib/worker-db";
import { uploadImageToR2 } from "@/lib/r2";

export async function POST(req: Request) {
  try {
    const user = await requireAuthenticatedUser();
    const form = await req.formData();
    const file = form.get("file");
    const target = String(form.get("target") || "");
    const organizationId = String(form.get("organizationId") || user.organizationId || "");
    const userId = String(form.get("userId") || "");

    if (!(file instanceof File) || !file.size) return NextResponse.json({ error: "An image file is required." }, { status: 400 });
    if (!file.type.startsWith("image/")) return NextResponse.json({ error: "Only image files are supported." }, { status: 400 });
    if (file.size > 8 * 1024 * 1024) return NextResponse.json({ error: "Images must be 8 MB or smaller." }, { status: 400 });
    if (!organizationId || !["hospital", "doctor"].includes(target)) return NextResponse.json({ error: "A valid organization and upload target are required." }, { status: 400 });
    await requireOrganizationAccess(organizationId);

    if (target === "doctor") {
      if (!userId) return NextResponse.json({ error: "A doctor user is required." }, { status: 400 });
      const targetUser = (await query<{ id: string }>(`SELECT id FROM macula.users WHERE id=$1 AND "organizationId"=$2 LIMIT 1`, [userId, organizationId])).rows[0];
      if (!targetUser) return NextResponse.json({ error: "Doctor does not belong to this organization." }, { status: 404 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const uploaded = await uploadImageToR2(buffer, `${target}-${crypto.randomUUID()}-${file.name}`, file.type, organizationId);
    if (target === "doctor") {
      const { rows } = await query(`UPDATE macula.users SET "profilePhotoUrl"=$1, "updatedAt"=NOW() WHERE id=$2 RETURNING id, "profilePhotoUrl"`, [uploaded.storageUrl, userId]);
      return NextResponse.json({ success: true, target, url: uploaded.storageUrl, user: rows[0] });
    }

    const existing = (await query<{ hospitalPhotoUrls: unknown }>(`SELECT "hospitalPhotoUrls" FROM macula.organizations WHERE id=$1 LIMIT 1`, [organizationId])).rows[0];
    const photos = Array.isArray(existing?.hospitalPhotoUrls) ? existing.hospitalPhotoUrls.filter((value): value is string => typeof value === "string") : [];
    photos.push(uploaded.storageUrl);
    const { rows } = await query(`UPDATE macula.organizations SET "hospitalPhotoUrls"=$1::jsonb, "updatedAt"=NOW() WHERE id=$2 RETURNING "hospitalPhotoUrls"`, [JSON.stringify(photos), organizationId]);
    return NextResponse.json({ success: true, target, url: uploaded.storageUrl, hospitalPhotoUrls: rows[0]?.hospitalPhotoUrls || photos });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to upload profile image." }, { status: 500 });
  }
}