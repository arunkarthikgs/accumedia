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
    const { rows: jobs } = await timeDbOperation("admin publishing jobs", () => query(`SELECT pj.*, json_build_object('id', c.id, 'title', c.title) AS case, json_build_object('id', ga.id, 'channelName', ga."channelName", 'status', ga.status) AS asset FROM macula.macula_publication_jobs pj JOIN macula.macula_cases c ON c.id = pj."caseId" JOIN macula.macula_generated_assets ga ON ga.id = pj."assetId" ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""} ORDER BY pj."createdAt" DESC LIMIT 50`, values));
    return NextResponse.json({ jobs }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to load publishing jobs." }, { status: 500 });
  }
}
