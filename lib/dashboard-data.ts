import { query } from "@/lib/worker-db";

export async function getDashboardSummary(organizationId: string | null) {
  const scope = organizationId ? `WHERE c."organizationId" = $1` : "";
  const params = organizationId ? [organizationId] : [];
  const [summaryResult, recentResult] = await Promise.all([
    query<any>(`SELECT
      COUNT(*)::int AS total_cases,
      COUNT(*) FILTER (WHERE c.status = 'PENDING_REVIEW')::int AS pending_cases,
      COUNT(*) FILTER (WHERE c.status = 'APPROVED')::int AS approved_cases,
      COUNT(*) FILTER (WHERE c.status = 'REJECTED')::int AS rejected_cases,
      (SELECT COUNT(*)::int FROM macula.safety_flags sf JOIN macula.cases sc ON sc.id = sf."caseId" WHERE sf.status = 'OPEN' ${organizationId ? 'AND sc."organizationId" = $1' : ''}) AS open_safety_flags,
      (SELECT COUNT(*)::int FROM macula.organizations ${organizationId ? 'WHERE id = $1' : ''}) AS org_count
      FROM macula.cases c ${scope}`, params),
    query<any>(`SELECT c.id, c.title, c.status,
      json_build_object('name', o.name) AS organization,
      json_build_object('name', u.name, 'specialty', u.specialty) AS physician,
      COALESCE((SELECT json_agg(json_build_object('id', ar.id, 'durationSeconds', ar."durationSeconds")) FROM macula.audio_recordings ar WHERE ar."caseId" = c.id), '[]') AS recordings,
      COALESCE((SELECT json_agg(json_build_object('detail', sf.detail)) FROM macula.safety_flags sf WHERE sf."caseId" = c.id AND sf.status = 'OPEN'), '[]') AS "safetyFlags"
      FROM macula.cases c JOIN macula.organizations o ON o.id = c."organizationId" JOIN macula.users u ON u.id = c."physicianId"
      ${scope} ORDER BY c."createdAt" DESC LIMIT 6`, params),
  ]);
  const summary = summaryResult.rows[0] || {};
  return {
    totalCases: Number(summary.total_cases || 0),
    pendingCases: Number(summary.pending_cases || 0),
    approvedCases: Number(summary.approved_cases || 0),
    rejectedCases: Number(summary.rejected_cases || 0),
    openSafetyFlags: Number(summary.open_safety_flags || 0),
    recentCases: recentResult.rows || [],
    orgCount: Number(summary.org_count || 0),
  };
}
