import { NextResponse } from "next/server";
import { requireAuthenticatedUser, requireOrganizationAccess } from "@/lib/tenant-auth";
import { timeDbOperation } from "@/lib/perf";
import { query, queryWithTimeout } from "@/lib/worker-db";

export const dynamic = "force-dynamic";

const publishingJobCache = new Map<string, { expiresAt: number; jobs: any[] }>();

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const organizationId = searchParams.get("orgId");
    const user = await requireAuthenticatedUser();
    const scopedOrgId = organizationId || user?.organizationId;
    if (scopedOrgId) await requireOrganizationAccess(scopedOrgId);
    const status = searchParams.get("status");
    const values: unknown[] = [];
    const filters: string[] = [];
    if (scopedOrgId) { values.push(scopedOrgId); filters.push(`pj."organizationId" = $${values.length}`); }
    if (status && status !== "ALL") { values.push(status); filters.push(`pj.status = $${values.length}`); }
    const cacheKey = `${scopedOrgId || "all"}:${status || "ALL"}`;
    let jobRows: any[];
    try {
      const result = await timeDbOperation("admin publishing jobs", () => queryWithTimeout<any>(`SELECT id, platform, status, "scheduledAt", "publishedAt", "externalId", "failureReason", "attemptCount", "lastAttemptAt", "nextAttemptAt", "createdAt", "updatedAt", "organizationId", "caseId", "assetId" FROM macula.publication_jobs pj ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""} ORDER BY "createdAt" DESC LIMIT 25`, values));
      jobRows = result.rows;
      publishingJobCache.set(cacheKey, { expiresAt: Date.now() + 30_000, jobs: jobRows });
    } catch (error) {
      const cached = publishingJobCache.get(cacheKey);
      if (!cached || cached.expiresAt <= Date.now()) throw error;
      console.warn("Using cached publishing jobs after a transient database timeout.");
      jobRows = cached.jobs;
    }
    const caseIds = jobRows.map((job) => job.caseId).filter(Boolean);
    const assetIds = jobRows.map((job) => job.assetId).filter(Boolean);
    const [{ rows: cases }, { rows: assets }] = await Promise.all([
      caseIds.length ? query<{ id: string; title: string }>(`SELECT id, title FROM macula.cases WHERE id = ANY($1::text[])`, [caseIds]) : Promise.resolve({ rows: [] }),
      assetIds.length ? query<{ id: string; channelName: string; status: string }>(`SELECT id, "channelName", status FROM macula.generated_assets WHERE id = ANY($1::text[])`, [assetIds]) : Promise.resolve({ rows: [] }),
    ]);
    const caseById = new Map(cases.map((item) => [item.id, item]));
    const assetById = new Map(assets.map((item) => [item.id, item]));
    const jobs = jobRows.map((job) => ({ ...job, case: caseById.get(job.caseId) || { id: job.caseId, title: "Unknown case" }, asset: assetById.get(job.assetId) || { id: job.assetId, channelName: "Unknown asset", status: "UNKNOWN" } }));
    return NextResponse.json({ jobs }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to load publishing jobs." }, { status: 500 });
  }
}
