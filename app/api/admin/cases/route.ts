import { NextResponse } from "next/server";
import { requireAuthenticatedUser, requireOrganizationAccess } from "@/lib/tenant-auth";
import { recordAudit } from "@/lib/audit";
import { timeDbOperation } from "@/lib/perf";
import { query } from "@/lib/worker-db";

export async function GET(req: Request) {
  try {
    const user = await requireAuthenticatedUser();
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get("orgId");
    const status = searchParams.get("status");
    const fromDate = searchParams.get("fromDate");
    const toDate = searchParams.get("toDate");
    const includeContent = searchParams.get("includeContent") === "true";
    const page = Math.max(1, Number(searchParams.get("page") || "1"));
    const pageSize = Math.min(100, Math.max(10, Number(searchParams.get("pageSize") || (includeContent ? "100" : "25"))));

    const filters: string[] = [];
    const values: unknown[] = [];
    const scopedOrgId = user?.isSuperAdmin ? (orgId && orgId !== "ALL" ? orgId : null) : user?.organizationId;
    values.push(scopedOrgId); filters.push(`c."organizationId" = COALESCE($${values.length}::text, c."organizationId")`);
    if (status && status !== "ALL") { values.push(status); filters.push(`c.status = $${values.length}`); }
    if (fromDate) { values.push(new Date(`${fromDate}T00:00:00.000Z`)); filters.push(`c."createdAt" >= $${values.length}`); }
    if (toDate) { values.push(new Date(`${toDate}T23:59:59.999Z`)); filters.push(`c."createdAt" <= $${values.length}`); }
    const filterSql = filters.join(" AND ");

    const assetSelect = includeContent
      ? `json_build_object('id', ga.id, 'channelKey', ga."channelKey", 'channelName', ga."channelName", 'outputType', ga."outputType", 'status', ga.status, 'content', ga.content, 'validationWarnings', ga."validationWarnings", 'validationWordCount', ga."validationWordCount", 'validationCharacterCount', ga."validationCharacterCount", 'validationDurationSeconds', ga."validationDurationSeconds")`
      : `json_build_object('id', ga.id, 'channelKey', ga."channelKey", 'channelName', ga."channelName")`;
    const recordingSelect = includeContent
      ? `json_build_object('id', ar.id, 'durationSeconds', ar."durationSeconds", 'transcriptionStatus', ar."transcriptionStatus", 'r2Key', ar."r2Key", 'rawTranscript', ar."rawTranscript", 'transcribedText', ar."transcribedText")`
      : `json_build_object('id', ar.id, 'durationSeconds', ar."durationSeconds", 'transcriptionStatus', ar."transcriptionStatus")`;
    const adminCaseQuery = `SELECT c.id, c.title, c.status, c.rejection_reason AS "rejectionReason", c.reviewed_by AS "reviewedBy", c.reviewed_at AS "reviewedAt", c."createdAt" AS "createdAt", COUNT(*) OVER()::int AS "totalCount"${includeContent ? ', c."masterRecord" AS "masterRecord", c."safetyAudit" AS "safetyAudit"' : ''},
      json_build_object('id', u.id, 'name', u.name, 'email', u.email, 'registrationNo', u."registrationNo", 'specialty', u.specialty) AS physician,
      json_build_object('id', o.id, 'name', o.name) AS organization,
      COALESCE((SELECT json_agg(${recordingSelect}) FROM macula.macula_audio_recordings ar WHERE ar."caseId" = c.id), '[]') AS recordings,
      COALESCE((SELECT json_agg(${assetSelect}) FROM macula.macula_generated_assets ga WHERE ga."caseId" = c.id), '[]') AS assets,
      (SELECT COUNT(*)::int FROM macula.macula_generated_assets ga WHERE ga."caseId" = c.id) AS "_count_assets",
      COALESCE((SELECT json_agg(json_build_object('id', sf.id, 'flagType', sf."flagType", 'detail', sf.detail, 'confidence', sf.confidence)) FROM macula.macula_safety_flags sf WHERE sf."caseId" = c.id AND sf.status = 'OPEN'), '[]') AS "safetyFlags"
      FROM macula.macula_cases c JOIN macula.macula_users u ON u.id = c."physicianId" JOIN macula.macula_organizations o ON o.id = c."organizationId"
      WHERE ${filterSql} ORDER BY c."createdAt" DESC OFFSET $${values.length + 1} LIMIT $${values.length + 2}`;
    const listValues = [...values, (page - 1) * pageSize, pageSize];
    const organizationQuery = user?.isSuperAdmin
      ? query(`SELECT id, name, slug FROM macula.macula_organizations ORDER BY name ASC`)
      : user?.organizationId
        ? query(`SELECT id, name, slug FROM macula.macula_organizations WHERE id = $1`, [user.organizationId])
        : Promise.resolve({ rows: [] });
    const [{ rows: cases }, { rows: organizations }] = await Promise.all([
      query(adminCaseQuery, listValues), organizationQuery,
    ]);
    const count = Number(cases[0]?.totalCount || 0);

    return NextResponse.json({ success: true, cases, organizations, pagination: { page, pageSize, total: count, totalPages: Math.ceil(count / pageSize) } });
  } catch (error: any) {
    console.error("Admin cases fetch error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch admin cases." },
      { status: 500 }
    );
  }
}

/**
 * NOTE: this PATCH no longer accepts status: "APPROVED". Approval must go
 * through POST /api/cases/[id]/approve, which checks for open SafetyFlags
 * and triggers the Adaptation Engine — this route previously let an admin
 * flip status straight to APPROVED with neither check, which made the
 * safety gate bypassable in practice. REJECTED (and any future non-approval
 * status change) still goes through here.
 */
export async function PATCH(req: Request) {
  try {
    await requireAuthenticatedUser();
    const { caseId, status, rejectionReason, reviewedBy } = await req.json();

    if (!caseId || !status) {
      return NextResponse.json(
        { error: "caseId and status are required." },
        { status: 400 }
      );
    }

    if (status === "APPROVED") {
      return NextResponse.json(
        {
          error:
            "Approval must go through POST /api/cases/{id}/approve so the safety-flag gate and Adaptation Engine run. This endpoint no longer permits a direct APPROVED transition.",
        },
        { status: 400 }
      );
    }

    const existingCase = (await query<{ organizationId: string }>(`SELECT "organizationId" FROM macula.macula_cases WHERE id = $1 LIMIT 1`, [caseId])).rows[0];
    if (!existingCase) return NextResponse.json({ error: "Case not found." }, { status: 404 });
    await requireOrganizationAccess(existingCase.organizationId);

    const { rows: updatedRows } = await query(`UPDATE macula.macula_cases SET status = $1, rejection_reason = $2, reviewed_by = $3, reviewed_at = NOW(), "updatedAt" = NOW() WHERE id = $4 RETURNING *`, [status, status === "REJECTED" ? rejectionReason : null, reviewedBy || "Admin / Compliance Officer", caseId]);
    const updated = updatedRows[0];
    await recordAudit({ organizationId: updated.organizationId, caseId: updated.id, targetType: "CASE", targetId: updated.id, action: status === "REJECTED" ? "CASE_REJECTED" : "CASE_STATUS_CHANGED", detail: rejectionReason || undefined, metadata: { status } });

    return NextResponse.json({ success: true, case: updated });
  } catch (error: any) {
    console.error("Admin case status update error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update case status." },
      { status: 500 }
    );
  }
}
