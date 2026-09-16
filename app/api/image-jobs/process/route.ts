import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateCaseImage } from "@/lib/image-engine";
import { requireAuthenticatedUser, requireOrganizationAccess } from "@/lib/tenant-auth";

export async function POST(req: Request) {
  return NextResponse.json({ error: "Image generation jobs require an external image-processing worker. The Cloudflare Worker cannot run the current image engine safely." }, { status: 501 });
  /*
  try {
    const cronAuthorized = Boolean(process.env.PUBLISHING_CRON_SECRET && req.headers.get("x-publishing-cron-secret") === process.env.PUBLISHING_CRON_SECRET);
    const user = cronAuthorized ? null : await requireAuthenticatedUser();
    const body = await req.json().catch(() => ({}));
    const organizationId = body.organizationId || user?.organizationId;
    if (!organizationId && !cronAuthorized) return NextResponse.json({ error: "organizationId is required." }, { status: 400 });
    if (organizationId) await requireOrganizationAccess(organizationId);

    const jobs = await db.imageGenerationJob.findMany({
      where: { status: "QUEUED", ...(organizationId ? { organizationId } : {}) },
      orderBy: { createdAt: "asc" },
      take: 3,
    });
    const results: Array<Record<string, string>> = [];
    for (const job of jobs) {
      const claimed = await db.imageGenerationJob.updateMany({
        where: { id: job.id, status: "QUEUED" },
        data: { status: "PROCESSING", startedAt: new Date(), error: null },
      });
      if (claimed.count === 0) continue;
      try {
        const image = await generateCaseImage(job.caseId, job.channel as any, job.conceptBrief || undefined);
        await db.imageGenerationJob.update({ where: { id: job.id }, data: { status: "COMPLETED", completedAt: new Date() } });
        results.push({ id: job.id, status: "COMPLETED", imageId: image.id });
      } catch (error: any) {
        await db.imageGenerationJob.update({ where: { id: job.id }, data: { status: "FAILED", error: error.message || "Image generation failed.", completedAt: new Date() } });
        results.push({ id: job.id, status: "FAILED" });
      }
    }
    return NextResponse.json({ success: true, processed: results.length, results });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to process image generation jobs." }, { status: 500 });
  }
  */
}