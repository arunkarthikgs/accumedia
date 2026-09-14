import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrganizationAccess } from "@/lib/tenant-auth";

export async function PATCH(req: Request, props: { params: Promise<{ jobId: string }> }) {
  try {
    const { jobId } = await props.params;
    const { action } = await req.json();
    const job = await db.publicationJob.findUnique({ where: { id: jobId } });
    if (!job) return NextResponse.json({ error: "Publishing job not found." }, { status: 404 });
    await requireOrganizationAccess(job.organizationId);
    if (action === "cancel") {
      if (["PUBLISHED", "CANCELLED"].includes(job.status)) return NextResponse.json({ error: "This job cannot be cancelled." }, { status: 409 });
      const updated = await db.publicationJob.update({ where: { id: jobId }, data: { status: "CANCELLED", failureReason: null, nextAttemptAt: null } });
      return NextResponse.json({ success: true, job: updated });
    }
    if (action === "retry") {
      if (job.status !== "FAILED") return NextResponse.json({ error: "Only failed jobs can be retried." }, { status: 409 });
      const updated = await db.publicationJob.update({ where: { id: jobId }, data: { status: "QUEUED", failureReason: null, nextAttemptAt: null } });
      return NextResponse.json({ success: true, job: updated });
    }
    return NextResponse.json({ error: "action must be cancel or retry." }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to update publishing job." }, { status: 500 });
  }
}