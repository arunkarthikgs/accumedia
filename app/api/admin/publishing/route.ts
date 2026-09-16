import { NextResponse } from "next/server";
import { requireAuthenticatedUser, requireOrganizationAccess } from "@/lib/tenant-auth";
import { timeDbOperation } from "@/lib/perf";
import { query } from "@/lib/worker-db";

export const dynamic = "force-dynamic";

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
    const { rows: jobRows } = await timeDbOperation("admin publishing jobs", () => query<any>(`SELECT id, platform, status, "scheduledAt", "publishedAt", "externalId", "failureReason", "attemptCount", "lastAttemptAt", "nextAttemptAt", "createdAt", "updatedAt", "organizationId", "caseId", "assetId" FROM macula.macula_publication_jobs pj ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""} ORDER BY "createdAt" DESC LIMIT 25`, values));
    const caseIds = jobRows.map((job) => job.caseId).filter(Boolean);
    const assetIds = jobRows.map((job) => job.assetId).filter(Boolean);
    const [{ rows: cases }, { rows: assets }] = await Promise.all([
      caseIds.length ? query<{ id: string; title: string }>(`SELECT id, title FROM macula.macula_cases WHERE id = ANY($1::uuid[])`, [caseIds]) : Promise.resolve({ rows: [] }),
      assetIds.length ? query<{ id: string; channelName: string; status: string }>(`SELECT id, "channelName", status FROM macula.macula_generated_assets WHERE id = ANY($1::uuid[])`, [assetIds]) : Promise.resolve({ rows: [] }),
    ]);
    const caseById = new Map(cases.map((item) => [item.id, item]));
    const assetById = new Map(assets.map((item) => [item.id, item]));
    const jobs = jobRows.map((job) => ({ ...job, case: caseById.get(job.caseId) || { id: job.caseId, title: "Unknown case" }, asset: assetById.get(job.assetId) || { id: job.assetId, channelName: "Unknown asset", status: "UNKNOWN" } }));
    return NextResponse.json({ jobs }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to load publishing jobs." }, { status: 500 });
  }
}
