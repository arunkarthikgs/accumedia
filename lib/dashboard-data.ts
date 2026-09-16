import { query } from "@/lib/worker-db";

export async function getDashboardSummary(organizationId: string | null) {
  const scope = organizationId ? `AND c."organizationId" = $1` : "";
  const params = organizationId ? [organizationId] : [];
  const { rows } = await query<any>(`WITH scoped_cases AS (
      SELECT c.* FROM macula.macula_cases c WHERE TRUE ${scope}
    ), recent AS (
      SELECT c.id, c.title, c.status,
             json_build_object('name', o.name) AS organization,
             json_build_object('name', u.name, 'specialty', u.specialty) AS physician,
             COALESCE((SELECT json_agg(json_build_object('id', ar.id, 'durationSeconds', ar."durationSeconds")) FROM macula.macula_audio_recordings ar WHERE ar."caseId" = c.id), '[]') AS recordings,
             COALESCE((SELECT json_agg(json_build_object('detail', sf.detail)) FROM macula.macula_safety_flags sf WHERE sf."caseId" = c.id AND sf.status = 'OPEN'), '[]') AS "safetyFlags"
      FROM scoped_cases c JOIN macula.macula_organizations o ON o.id = c."organizationId" JOIN macula.macula_users u ON u.id = c."physicianId"
      ORDER BY c."createdAt" DESC LIMIT 6
    )
    SELECT
      (SELECT COUNT(*)::int FROM scoped_cases) AS total_cases,
      (SELECT COUNT(*)::int FROM scoped_cases WHERE status = 'PENDING_REVIEW') AS pending_cases,
      (SELECT COUNT(*)::int FROM scoped_cases WHERE status = 'APPROVED') AS approved_cases,
      (SELECT COUNT(*)::int FROM scoped_cases WHERE status = 'REJECTED') AS rejected_cases,
      (SELECT COUNT(*)::int FROM macula.macula_safety_flags sf JOIN scoped_cases c ON c.id = sf."caseId" WHERE sf.status = 'OPEN') AS open_safety_flags,
      (SELECT COUNT(*)::int FROM macula.macula_organizations) AS org_count,
      COALESCE((SELECT json_agg(recent) FROM recent), '[]') AS recent_cases`, params);
  const summary = rows[0] || {};
  return {
    totalCases: Number(summary.total_cases || 0),
    pendingCases: Number(summary.pending_cases || 0),
    approvedCases: Number(summary.approved_cases || 0),
    rejectedCases: Number(summary.rejected_cases || 0),
    openSafetyFlags: Number(summary.open_safety_flags || 0),
    recentCases: summary.recent_cases || [],
    orgCount: Number(summary.org_count || 0),
  };
}
