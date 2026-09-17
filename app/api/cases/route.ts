import { NextResponse } from "next/server";
import { assertCaseQuota } from "@/lib/quotas";
import { requireAuthenticatedUser, requireOrganizationAccess } from "@/lib/tenant-auth";
import { query } from "@/lib/worker-db";
import crypto from "node:crypto";

// GET /api/cases - List cases with optional filtering
export async function GET(req: Request) {
  try {
    const user = await requireAuthenticatedUser();
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get("orgId");
    const physicianId = searchParams.get("physicianId");
    const status = searchParams.get("status");
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const requestedOrgId = orgId && orgId !== "ALL" ? orgId : null;
    const scopedOrgId = user?.isSuperAdmin ? requestedOrgId : user?.organizationId;
    if (!scopedOrgId) {
      return NextResponse.json({ error: "An organization scope is required." }, { status: 400 });
    }
    await requireOrganizationAccess(scopedOrgId);
    const filters = ["c.\"organizationId\" = $1"];
    const values: unknown[] = [scopedOrgId];
    if (physicianId) { values.push(physicianId); filters.push(`c."physicianId" = $${values.length}`); }
    if (status && status !== "ALL") { values.push(status); filters.push(`c.status = $${values.length}`); }
    const filterSql = filters.join(" AND ");
    const caseQuery = `
      SELECT c.id, c.title, c.raw_input AS "rawInput", c."masterRecord" AS "masterRecord", c."safetyAudit" AS "safetyAudit", c.status,
             c."createdAt" AS "createdAt", c."updatedAt" AS "updatedAt",
             json_build_object('id', u.id, 'name', u.name, 'email', u.email, 'registrationNo', u."registrationNo", 'specialty', u.specialty) AS physician,
             json_build_object('id', o.id, 'name', o.name, 'slug', o.slug) AS organization,
             COALESCE((SELECT json_agg(json_build_object('id', ar.id, 'r2Key', ar."r2Key", 'fileName', ar."fileName", 'durationSeconds', ar."durationSeconds", 'transcriptionStatus', ar."transcriptionStatus", 'transcriptionAgent', ar."transcriptionAgent", 'recordedAt', ar."recordedAt") ORDER BY ar."recordedAt" DESC) FROM macula.audio_recordings ar WHERE ar."caseId" = c.id), '[]') AS recordings,
             COALESCE((SELECT json_agg(json_build_object('id', ga.id, 'channelKey', ga."channelKey", 'channelName', ga."channelName") ORDER BY ga."createdAt" DESC) FROM macula.generated_assets ga WHERE ga."caseId" = c.id), '[]') AS assets
      FROM macula.cases c
      JOIN macula.users u ON u.id = c."physicianId"
      JOIN macula.organizations o ON o.id = c."organizationId"
      WHERE ${filterSql}
      ORDER BY c."createdAt" DESC OFFSET $${values.length + 1} LIMIT $${values.length + 2}`;
    const countQuery = `SELECT COUNT(*)::int AS count FROM macula.cases c WHERE ${filterSql}`;
    values.push(offset, limit);

    const [cases, totalCount] = await Promise.all([
      query(caseQuery, values),
      query<{ count: number }>(countQuery, values.slice(0, -2)),
    ]);

    return NextResponse.json({
      success: true,
      totalCount: Number(totalCount.rows[0]?.count || 0),
      count: cases.rows.length,
      cases: cases.rows,
    });
  } catch (error: any) {
    console.error("Fetch cases error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to retrieve clinical cases." },
      { status: 500 }
    );
  }
}

// POST /api/cases - Manual case creation (direct text entry or external integration)
export async function POST(req: Request) {
  try {
    const user = await requireAuthenticatedUser();
    const body = await req.json();
    const { title, rawInput, organizationId, physicianId } = body;

    if (!organizationId) {
      return NextResponse.json(
        { error: "organizationId is required." },
        { status: 400 }
      );
    }

    if (!user?.isSuperAdmin && user?.organizationId !== organizationId) {
      return NextResponse.json({ error: "Forbidden: organization access denied." }, { status: 403 });
    }
    await assertCaseQuota(organizationId);
    await requireOrganizationAccess(organizationId);

    let targetPhysicianId = physicianId;
    const physician = targetPhysicianId
      ? (await query(`SELECT id FROM macula.users WHERE id = $1 AND "organizationId" = $2 LIMIT 1`, [targetPhysicianId, organizationId])).rows[0]
      : null;
    if (!physician) targetPhysicianId = (await query<{ id: string }>(`SELECT id FROM macula.users WHERE "organizationId" = $1 ORDER BY name ASC LIMIT 1`, [organizationId])).rows[0]?.id || null;

    if (!targetPhysicianId) {
      return NextResponse.json(
        { error: "A valid physician ID is required to link with this case." },
        { status: 400 }
      );
    }

    const defaultTitle =
      title?.trim() ||
      `Clinical Encounter - ${new Date().toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      })}`;

    const caseId = crypto.randomUUID();
    const safetyAudit = { auditLoggedAt: new Date().toISOString(), source: "MANUAL_ENTRY", status: "AWAITING_SYNTHESIS" };
    const { rows } = await query(`INSERT INTO macula.cases (id, title, raw_input, status, "organizationId", "physicianId", "masterRecord", "safetyAudit") VALUES ($1, $2, $3, 'PENDING_REVIEW', $4, $5, '{}'::jsonb, $6::jsonb) RETURNING *`, [caseId, defaultTitle, rawInput?.trim() || "", organizationId, targetPhysicianId, JSON.stringify(safetyAudit)]);
    const newCase = { ...rows[0], physician: (await query(`SELECT * FROM macula.users WHERE id = $1`, [targetPhysicianId])).rows[0], organization: (await query(`SELECT * FROM macula.organizations WHERE id = $1`, [organizationId])).rows[0] };

    return NextResponse.json({
      success: true,
      case: newCase,
    });
  } catch (error: any) {
    console.error("Create case error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create clinical case." },
      { status: 500 }
    );
  }
}
