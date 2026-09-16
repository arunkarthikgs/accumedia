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
    const pageSize = Math.min(100, Math.max(10, Number(searchParams.get("pageSize") || "25")));
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
    const [{ rows: usageRows }, quota] = await Promise.all([
      query<any>(`WITH filtered AS (
        SELECT l.*, c.id AS case_id, c.title AS case_title
        FROM macula.macula_ai_usage_logs l LEFT JOIN macula.macula_cases c ON c.id = l."caseId"
        WHERE ${filter}
      )
      SELECT filtered.*, CASE WHEN case_id IS NULL THEN NULL ELSE json_build_object('id', case_id, 'title', case_title) END AS case,
             COUNT(*) OVER()::int AS total_count,
             SUM(COALESCE("inputTokens",0)) OVER()::int AS total_input_tokens,
             SUM(COALESCE("outputTokens",0)) OVER()::int AS total_output_tokens,
             SUM(COALESCE("audioSeconds",0)) OVER()::int AS total_audio_seconds,
             SUM(COALESCE("estimatedCostUsd",0)) OVER() AS total_cost
      FROM filtered ORDER BY "createdAt" DESC OFFSET $6 LIMIT $7`, [...params, (page - 1) * pageSize, pageSize]),
      getOrganizationQuota(organizationId),
    ]);
    const firstUsage = usageRows[0];
    const count = Number(firstUsage?.total_count || 0);
    const summary = { _count: { _all: count }, _sum: { inputTokens: firstUsage?.total_input_tokens || 0, outputTokens: firstUsage?.total_output_tokens || 0, audioSeconds: firstUsage?.total_audio_seconds || 0, estimatedCostUsd: firstUsage?.total_cost || 0 } };
    const logs = usageRows.map(({ case_id: _caseId, case_title: _caseTitle, total_count: _count, total_input_tokens: _input, total_output_tokens: _output, total_audio_seconds: _audio, total_cost: _cost, ...log }) => log);

    return NextResponse.json({ logs, summary, quota, pagination: { page, pageSize, total: count, totalPages: Math.ceil(count / pageSize) } });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to load usage." }, { status: 500 });
  }
}