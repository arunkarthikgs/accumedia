import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/tenant-auth";
import { query } from "@/lib/worker-db";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, props: { params: Promise<{ jobId: string }> }) {
  try {
    const { jobId } = await props.params;
    const job = (await query<any>(`SELECT id, platform, status, "externalId", "publishedAt", "organizationId" FROM macula.publication_jobs WHERE id = $1 LIMIT 1`, [jobId])).rows[0];
    if (!job) return NextResponse.json({ error: "Publishing job not found." }, { status: 404 });
    await requireOrganizationAccess(job.organizationId);
    const { rows: stats } = await query<any>(
      `SELECT id, status, impressions, likes, comments, shares, clicks, "videoViews", "errorMessage", "fetchedAt"
       FROM macula.publication_stats WHERE "jobId" = $1 ORDER BY "fetchedAt" DESC LIMIT 100`,
      [jobId],
    );
    return NextResponse.json({ job, stats });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to load publishing stats." }, { status: 500 });
  }
}
