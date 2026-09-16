import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/tenant-auth";
import { recordAudit } from "@/lib/audit";
import { query } from "@/lib/worker-db";
import crypto from "node:crypto";

export async function GET(
  _req: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await props.params;
    const kase = (await query<{ organizationId: string }>(`SELECT "organizationId" FROM macula.macula_cases WHERE id = $1 LIMIT 1`, [id])).rows[0];
    if (!kase) return NextResponse.json({ error: "Case not found." }, { status: 404 });
    await requireOrganizationAccess(kase.organizationId);
    const { rows: versions } = await query(`SELECT * FROM macula.macula_case_versions WHERE "caseId" = $1 ORDER BY version DESC`, [id]);
    return NextResponse.json({ versions });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to load case versions." }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await props.params;
    const body = await req.json();
    const kase = (await query<any>(`SELECT * FROM macula.macula_cases WHERE id = $1 LIMIT 1`, [id])).rows[0];
    if (!kase) return NextResponse.json({ error: "Case not found." }, { status: 404 });
    await requireOrganizationAccess(kase.organizationId);

    if (body.action === "restore") {
      if (!body.versionId) return NextResponse.json({ error: "versionId is required for restore." }, { status: 400 });
      const target = (await query<any>(`SELECT * FROM macula.macula_case_versions WHERE id = $1 AND "caseId" = $2 LIMIT 1`, [body.versionId, id])).rows[0];
      if (!target) return NextResponse.json({ error: "Version not found." }, { status: 404 });
    } else if (!body.masterRecord || typeof body.masterRecord !== "object") {
      return NextResponse.json({ error: "masterRecord must be a JSON object." }, { status: 400 });
    }

    const versionCount = Number((await query<{ count: number }>(`SELECT COUNT(*)::int AS count FROM macula.macula_case_versions WHERE "caseId" = $1`, [id])).rows[0]?.count || 0);
    await query(`INSERT INTO macula.macula_case_versions (id, version, "changeType", raw_input, "guidedSubmission", "masterRecord", "safetyAudit", status, "caseId") VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8, $9)`, [crypto.randomUUID(), versionCount + 1, body.action === "restore" ? "restore" : "manual_edit", kase.raw_input, JSON.stringify(kase.guidedSubmission), JSON.stringify(kase.masterRecord), JSON.stringify(kase.safetyAudit), kase.status, id]);

    if (body.action === "restore") {
      const target = (await query<any>(`SELECT * FROM macula.macula_case_versions WHERE id = $1 AND "caseId" = $2 LIMIT 1`, [body.versionId, id])).rows[0];
      const { rows: updatedRows } = await query(`UPDATE macula.macula_cases SET raw_input = $1, "guidedSubmission" = $2::jsonb, "masterRecord" = $3::jsonb, "safetyAudit" = $4::jsonb, status = 'PENDING_REVIEW', mccr_approved_at = NULL, mccr_approved_by = NULL, reviewed_at = NULL, reviewed_by = NULL, "updatedAt" = NOW() WHERE id = $5 RETURNING *`, [target.raw_input, JSON.stringify(target.guidedSubmission), JSON.stringify(target.masterRecord), JSON.stringify(target.safetyAudit), id]);
      const updated = updatedRows[0];
      await recordAudit({ organizationId: kase.organizationId, caseId: id, targetType: "CASE", targetId: id, action: "CASE_VERSION_RESTORED", metadata: { versionId: body.versionId } });
      return NextResponse.json({ success: true, case: updated });
    }

    const { rows: updatedRows } = await query(`UPDATE macula.macula_cases SET "masterRecord" = $1::jsonb, raw_input = $2, status = 'PENDING_REVIEW', mccr_approved_at = NULL, mccr_approved_by = NULL, reviewed_at = NULL, reviewed_by = NULL, "updatedAt" = NOW() WHERE id = $3 RETURNING *`, [JSON.stringify(body.masterRecord), typeof body.rawInput === "string" ? body.rawInput : kase.raw_input, id]);
    const updated = updatedRows[0];
    await recordAudit({ organizationId: kase.organizationId, caseId: id, targetType: "CASE", targetId: id, action: "MCCR_EDITED", metadata: { version: versionCount + 1 } });
    return NextResponse.json({ success: true, case: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to update case review." }, { status: 500 });
  }
}