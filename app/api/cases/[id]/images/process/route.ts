import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateCaseImage } from "@/lib/image-engine";
import { requireOrganizationAccess } from "@/lib/tenant-auth";

export async function POST(_req: Request, props: { params: Promise<{ id: string }> }) {
  return NextResponse.json({ error: "Image generation is not available in the Cloudflare Worker. Configure an external image-generation processor or queue-backed service." }, { status: 501 });
  /*
  try {
    const { id } = await props.params;
    const kase = await db.case.findUnique({ where: { id }, select: { organizationId: true } });
    if (!kase) return NextResponse.json({ error: "Case not found." }, { status: 404 });
    await requireOrganizationAccess(kase.organizationId);
    const jobs = await db.imageGenerationJob.findMany({ where: { caseId: id, status: "QUEUED" }, orderBy: { createdAt: "asc" }, take: 3 });
    const results: Array<Record<string, string>> = [];
    for (const job of jobs) {
      const claimed = await db.imageGenerationJob.updateMany({ where: { id: job.id, status: "QUEUED" }, data: { status: "PROCESSING", startedAt: new Date(), error: null } });
      if (!claimed.count) continue;
      try {
        const image = await generateCaseImage(id, job.channel as any, job.conceptBrief || undefined);
        await db.imageGenerationJob.update({ where: { id: job.id }, data: { status: "COMPLETED", completedAt: new Date() } });
        results.push({ id: job.id, channel: job.channel, status: "COMPLETED", imageId: image.id });
      } catch (error: any) {
        await db.imageGenerationJob.update({ where: { id: job.id }, data: { status: "FAILED", error: error.message || "Image generation failed.", completedAt: new Date() } });
        results.push({ id: job.id, channel: job.channel, status: "FAILED" });
      }
    }
    return NextResponse.json({ success: true, processed: results.length, results });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to process image generation." }, { status: 500 });
  }
  */
}
