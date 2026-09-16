import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/tenant-auth";
import { query } from "@/lib/worker-db";

export async function PATCH(req: Request, props: { params: Promise<{ jobId: string }> }) {
  try {
    const { jobId } = await props.params;
    const { action } = await req.json();
    const job = (await query<any>(`SELECT * FROM macula.macula_publication_jobs WHERE id = $1 LIMIT 1`, [jobId])).rows[0];
    if (!job) return NextResponse.json({ error: "Publishing job not found." }, { status: 404 });
    await requireOrganizationAccess(job.organizationId);
    if (action === "cancel") {
      if (["PUBLISHED", "CANCELLED"].includes(job.status)) return NextResponse.json({ error: "This job cannot be cancelled." }, { status: 409 });
      const { rows } = await query(`UPDATE macula.macula_publication_jobs SET status = 'CANCELLED', "failureReason" = NULL, "nextAttemptAt" = NULL, "updatedAt" = NOW() WHERE id = $1 RETURNING *`, [jobId]);
      const updated = rows[0];
      return NextResponse.json({ success: true, job: updated });
    }
    if (action === "retry") {
      if (job.status !== "FAILED") return NextResponse.json({ error: "Only failed jobs can be retried." }, { status: 409 });
      const { rows } = await query(`UPDATE macula.macula_publication_jobs SET status = 'QUEUED', "failureReason" = NULL, "nextAttemptAt" = NULL, "updatedAt" = NOW() WHERE id = $1 RETURNING *`, [jobId]);
      const updated = rows[0];
      return NextResponse.json({ success: true, job: updated });
    }
    return NextResponse.json({ error: "action must be cancel or retry." }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to update publishing job." }, { status: 500 });
  }
}