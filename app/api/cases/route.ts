import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assertCaseQuota } from "@/lib/quotas";
import { requireAuthenticatedUser, requireOrganizationAccess } from "@/lib/tenant-auth";
import { query } from "@/lib/worker-db";

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
             COALESCE((SELECT json_agg(json_build_object('id', ar.id, 'r2Key', ar."r2Key", 'fileName', ar."fileName", 'durationSeconds', ar."durationSeconds", 'transcriptionStatus', ar."transcriptionStatus", 'transcriptionAgent', ar."transcriptionAgent", 'recordedAt', ar."recordedAt") ORDER BY ar."recordedAt" DESC) FROM macula.macula_audio_recordings ar WHERE ar."caseId" = c.id), '[]') AS recordings,
             COALESCE((SELECT json_agg(json_build_object('id', ga.id, 'channelKey', ga."channelKey", 'channelName', ga."channelName") ORDER BY ga."createdAt" DESC) FROM macula.macula_generated_assets ga WHERE ga."caseId" = c.id), '[]') AS assets
      FROM macula.macula_cases c
      JOIN macula.macula_users u ON u.id = c."physicianId"
      JOIN macula.macula_organizations o ON o.id = c."organizationId"
      WHERE ${filterSql}
      ORDER BY c."createdAt" DESC OFFSET $${values.length + 1} LIMIT $${values.length + 2}`;
    const countQuery = `SELECT COUNT(*)::int AS count FROM macula.macula_cases c WHERE ${filterSql}`;
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
      ? await db.user.findFirst({ where: { id: targetPhysicianId, organizationId }, select: { id: true } })
      : null;
    if (!physician) {
      const defaultPhysician = await db.user.findFirst({
        where: { organizationId },
      });
      targetPhysicianId = defaultPhysician?.id || null;
    }

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

    const newCase = await db.case.create({
      data: {
        title: defaultTitle,
        rawInput: rawInput?.trim() || "",
        status: "PENDING_REVIEW",
        organizationId,
        physicianId: targetPhysicianId,
        masterRecord: {},
        safetyAudit: {
          auditLoggedAt: new Date().toISOString(),
          source: "MANUAL_ENTRY",
          status: "AWAITING_SYNTHESIS",
        },
      },
      include: {
        physician: true,
        organization: true,
      },
    });

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
