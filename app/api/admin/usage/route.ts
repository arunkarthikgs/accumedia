import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/tenant-auth";
import { getOrganizationQuota } from "@/lib/quotas";
import { requirePermission } from "@/lib/auth";
import { query } from "@/lib/worker-db";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const organizationId = searchParams.get("orgId");
    const operation = searchParams.get("operation");
    const caseSearch = searchParams.get("caseSearch")?.trim();
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const page = Math.max(1, Number(searchParams.get("page") || "1"));
    const pageSize = Math.min(100, Math.max(10, Number(searchParams.get("pageSize") || "50")));
    if (!organizationId) return NextResponse.json({ error: "orgId is required." }, { status: 400 });
    await requirePermission("USAGE_VIEW");
    await requireOrganizationAccess(organizationId);

    const fromDate = from ? new Date(`${from}T00:00:00.000Z`) : null;
    const toDate = to ? new Date(`${to}T23:59:59.999Z`) : null;
    const params = [organizationId, operation && operation !== "ALL" ? operation : null, caseSearch ? `%${caseSearch}%` : null, fromDate, toDate];
    const filter = `l."organizationId" = $1
      AND ($2::text IS NULL OR l.operation = $2)
      AND ($3::text IS NULL OR c.title ILIKE $3)
      AND ($4::timestamptz IS NULL OR l."createdAt" >= $4)
      AND ($5::timestamptz IS NULL OR l."createdAt" <= $5)`;
    const [{ rows: logs }, { rows: countRows }, { rows: summaryRows }, quota] = await Promise.all([
      query(`SELECT l.*, CASE WHEN c.id IS NULL THEN NULL ELSE json_build_object('id', c.id, 'title', c.title) END AS case
             FROM macula.macula_ai_usage_logs l LEFT JOIN macula.macula_cases c ON c.id = l."caseId"
             WHERE ${filter} ORDER BY l."createdAt" DESC OFFSET $6 LIMIT $7`, [...params, (page - 1) * pageSize, pageSize]),
      query(`SELECT COUNT(*)::int AS count FROM macula.macula_ai_usage_logs l LEFT JOIN macula.macula_cases c ON c.id = l."caseId" WHERE ${filter}`, params),
      query(`SELECT COUNT(*)::int AS count, COALESCE(SUM(l."inputTokens"), 0)::int AS "inputTokens", COALESCE(SUM(l."outputTokens"), 0)::int AS "outputTokens", COALESCE(SUM(l."audioSeconds"), 0)::int AS "audioSeconds", COALESCE(SUM(l."estimatedCostUsd"), 0) AS "estimatedCostUsd" FROM macula.macula_ai_usage_logs l LEFT JOIN macula.macula_cases c ON c.id = l."caseId" WHERE ${filter}`, params),
      getOrganizationQuota(organizationId),
    ]);
    const count = Number(countRows[0]?.count || 0);
    const summary = { _count: { _all: Number(summaryRows[0]?.count || 0) }, _sum: summaryRows[0] };

    return NextResponse.json({ logs, summary, quota, pagination: { page, pageSize, total: count, totalPages: Math.ceil(count / pageSize) } });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to load usage." }, { status: 500 });
  }
}