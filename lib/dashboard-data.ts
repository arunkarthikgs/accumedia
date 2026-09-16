import { query } from "@/lib/worker-db";

export async function getDashboardSummary(organizationId: string | null) {
  const scope = organizationId ? `AND c."organizationId" = $1` : "";
  const params = organizationId ? [organizationId] : [];
  const [{ rows: counts }, { rows: flags }, { rows: recentCases }, { rows: organizations }] = await Promise.all([
    query<{ status: string; count: number }>(`SELECT status, COUNT(*)::int AS count FROM macula.macula_cases c WHERE TRUE ${scope} GROUP BY status`, params),
    query<{ count: number }>(`SELECT COUNT(*)::int AS count FROM macula.macula_safety_flags sf JOIN macula.macula_cases c ON c.id = sf."caseId" WHERE sf.status = 'OPEN' ${scope}`, params),
    query<any>(`SELECT c.id, c.title, c.status, json_build_object('name', o.name) AS organization, json_build_object('name', u.name, 'specialty', u.specialty) AS physician,
      COALESCE((SELECT json_agg(json_build_object('id', ar.id, 'durationSeconds', ar."durationSeconds")) FROM macula.macula_audio_recordings ar WHERE ar."caseId" = c.id), '[]') AS recordings,
      COALESCE((SELECT json_agg(json_build_object('detail', sf.detail)) FROM macula.macula_safety_flags sf WHERE sf."caseId" = c.id AND sf.status = 'OPEN'), '[]') AS "safetyFlags"
      FROM macula.macula_cases c JOIN macula.macula_organizations o ON o.id = c."organizationId" JOIN macula.macula_users u ON u.id = c."physicianId"
      WHERE TRUE ${scope} ORDER BY c."createdAt" DESC LIMIT 6`, params),
    query<{ count: number }>(`SELECT COUNT(*)::int AS count FROM macula.macula_organizations`, []),
  ]);
  const countMap = Object.fromEntries(counts.map((entry) => [entry.status, Number(entry.count)]));
  return {
    totalCases: Object.values(countMap).reduce((total, count) => total + count, 0),
    pendingCases: countMap.PENDING_REVIEW || 0,
    approvedCases: countMap.APPROVED || 0,
    rejectedCases: countMap.REJECTED || 0,
    openSafetyFlags: Number(flags[0]?.count || 0),
    recentCases,
    orgCount: Number(organizations[0]?.count || 0),
  };
}
