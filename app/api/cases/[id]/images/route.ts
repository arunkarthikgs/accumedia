import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/tenant-auth";
import { query } from "@/lib/worker-db";
import crypto from "node:crypto";

const IMAGE_CHANNELS = ["linkedin_cover", "linkedin_carousel", "facebook_post", "ig_reels", "x_image", "yt_thumbnail", "blog_featured"] as const;

export async function GET(
  req: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await props.params;
    const kase = (await query<{ organizationId: string }>(`SELECT "organizationId" FROM macula.macula_cases WHERE id = $1 LIMIT 1`, [id])).rows[0];
    if (!kase) return NextResponse.json({ error: "Case not found." }, { status: 404 });
    await requireOrganizationAccess(kase.organizationId);
    const [{ rows: images }, { rows: jobs }] = await Promise.all([
      query(`SELECT * FROM macula.macula_image_assets WHERE "caseId" = $1 ORDER BY "createdAt" DESC`, [id]),
      query(`SELECT id, channel, status, error, "createdAt", "startedAt", "completedAt" FROM macula.macula_image_generation_jobs WHERE "caseId" = $1 AND status IN ('QUEUED', 'PROCESSING', 'FAILED') ORDER BY "createdAt" DESC`, [id]),
    ]);
    return NextResponse.json({ images, jobs });
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

    const kase = (await query<any>(`SELECT * FROM macula.macula_cases WHERE id = $1 LIMIT 1`, [id])).rows[0];
    if (!kase) return NextResponse.json({ error: "Case not found" }, { status: 404 });
    await requireOrganizationAccess(kase.organizationId);
    if (!kase.mccrApprovedAt) {
      return NextResponse.json(
        { error: "This case's clinical record has not been approved yet — image generation is locked until it is." },
        { status: 409 }
      );
    }

    const { rows } = await query(`INSERT INTO macula.macula_image_generation_jobs (id, channel, "conceptBrief", status, "caseId", "organizationId") VALUES ($1, $2, $3, 'QUEUED', $4, $5) RETURNING *`, [crypto.randomUUID(), channel, conceptBrief || null, id, kase.organizationId]);
    const job = rows[0];
    return NextResponse.json({ success: true, job, message: "Image generation queued for background processing." }, { status: 202 });
  } catch (error: any) {
    console.error("Image generation error:", error);
    return NextResponse.json({ error: error.message || "Image generation failed." }, { status: 500 });
  }
}
