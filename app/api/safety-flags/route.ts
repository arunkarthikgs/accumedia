import { NextResponse } from "next/server";
import { requireAuthenticatedUser, requireOrganizationAccess } from "@/lib/tenant-auth";
import { recordAudit } from "@/lib/audit";
import { query } from "@/lib/worker-db";

export const dynamic = "force-dynamic";

const getSafetyOrganizations = () => query(`SELECT id, name, slug FROM macula.organizations ORDER BY name ASC`);
let safetyOrganizationCache: { expiresAt: number; rows: unknown[] } | null = null;
const safetyFlagsCache = new Map<string, { expiresAt: number; body: { flags: unknown[]; organizations: unknown[] } }>();

/**
 * RFP §16 — "Potentially problematic content should be flagged for human
 * review, not silently altered or published." This is that queue's backend.
 * GET lists open flags (optionally scoped to an org); PATCH records a human
 * decision — it never auto-resolves anything.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get("orgId");
    const caseId = searchParams.get("caseId");
    const flagId = searchParams.get("flagId");
    const status = searchParams.get("status") || "OPEN";
    const user = await requireAuthenticatedUser();
    const scopedOrgId = user?.isSuperAdmin ? orgId : user?.organizationId;
    if (scopedOrgId) await requireOrganizationAccess(scopedOrgId);
    const cacheKey = `${scopedOrgId || "all"}:${caseId || "all"}:${flagId || "all"}:${status}`;
    const cachedFlags = safetyFlagsCache.get(cacheKey);
    if (cachedFlags && cachedFlags.expiresAt > Date.now()) {
      return NextResponse.json(cachedFlags.body, { headers: { "Cache-Control": "private, max-age=15" } });
    }

    const organizationQuery = user?.isSuperAdmin
      ? safetyOrganizationCache && safetyOrganizationCache.expiresAt > Date.now()
        ? Promise.resolve({ rows: safetyOrganizationCache.rows })
        : getSafetyOrganizations().then((result) => {
          safetyOrganizationCache = { expiresAt: Date.now() + 30_000, rows: result.rows };
          return result;
        })
      : user?.organizationId
        ? query(`SELECT id, name, slug FROM macula.organizations WHERE id = $1`, [user.organizationId])
        : Promise.resolve({ rows: [] });
    const values: unknown[] = [];
    const filters: string[] = [];
    if (status !== "ALL") { values.push(status); filters.push(`sf.status = $${values.length}`); }
    if (scopedOrgId) { values.push(scopedOrgId); filters.push(`c."organizationId" = $${values.length}`); }
    if (caseId) { values.push(caseId); filters.push(`c.id = $${values.length}`); }
    if (flagId) { values.push(flagId); filters.push(`sf.id = $${values.length}`); }
    const evidenceColumns = flagId ? `,
      COALESCE((SELECT ar."transcribedText" FROM macula.audio_recordings ar WHERE ar."caseId" = c.id AND NULLIF(BTRIM(ar."transcribedText"), '') IS NOT NULL ORDER BY ar."updatedAt" DESC LIMIT 1), NULLIF(BTRIM(c.raw_input), '')) AS "evidenceText",
      CASE WHEN EXISTS (SELECT 1 FROM macula.audio_recordings ar WHERE ar."caseId" = c.id AND NULLIF(BTRIM(ar."transcribedText"), '') IS NOT NULL) THEN 'refined_recording' ELSE 'sanitized_case_input' END AS "evidenceSource"` : "";
    const { rows: flags } = await query(`SELECT sf.id, sf."targetType", sf.detail, sf."flagType", sf.confidence, sf.status, sf."reviewedBy", sf."reviewedAt", sf."createdAt",
      CASE WHEN c.id IS NULL THEN NULL ELSE json_build_object('id', c.id, 'title', c.title, 'organizationId', c."organizationId", 'organizationName', o.name, 'physician', json_build_object('name', u.name)) END AS case,
      CASE WHEN ia.id IS NULL THEN NULL ELSE json_build_object('id', ia.id, 'channel', ia.channel, 'sourceType', ia."sourceType", 'phiReviewStatus', ia."phiReviewStatus", 'safetyFindings', ia."safetyFindings") END AS "imageAsset"
      ${evidenceColumns}
      FROM macula.safety_flags sf
      LEFT JOIN macula.image_assets ia ON ia.id = sf."imageAssetId"
      LEFT JOIN macula.cases c ON c.id = COALESCE(sf."caseId", ia."caseId")
      LEFT JOIN macula.users u ON u.id = c."physicianId"
      LEFT JOIN macula.organizations o ON o.id = c."organizationId"
      ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
      ORDER BY sf."createdAt" DESC LIMIT ${flagId ? 1 : 25}`, values);
    const organizations = (await organizationQuery).rows;

    const body = { flags, organizations };
    safetyFlagsCache.set(cacheKey, { body, expiresAt: Date.now() + 15_000 });
    return NextResponse.json(body, { headers: { "Cache-Control": "private, max-age=15" } });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const { flagId, decision, reviewedBy } = await req.json();
    // decision: "REVIEWED_OK" | "REVIEWED_REDACTED" | "REJECTED"

    if (!flagId || !decision) {
      return NextResponse.json({ error: "flagId and decision are required." }, { status: 400 });
    }
    if (!["REVIEWED_OK", "REVIEWED_REDACTED", "REJECTED"].includes(decision)) {
      return NextResponse.json({ error: "Invalid decision value." }, { status: 400 });
    }

    const existing = (await query<any>(`SELECT sf.id, sf."caseId", sf."imageAssetId", c."organizationId" AS case_org, ia."caseId" AS image_case_id, ic."organizationId" AS image_org FROM macula.safety_flags sf LEFT JOIN macula.cases c ON c.id = sf."caseId" LEFT JOIN macula.image_assets ia ON ia.id = sf."imageAssetId" LEFT JOIN macula.cases ic ON ic.id = ia."caseId" WHERE sf.id = $1 LIMIT 1`, [flagId])).rows[0];
    if (!existing) return NextResponse.json({ error: "Safety flag not found." }, { status: 404 });
    const organizationId = existing.case_org || existing.image_org;
    if (!organizationId) return NextResponse.json({ error: "Safety flag has no organization." }, { status: 400 });
    await requireOrganizationAccess(organizationId);
    const { rows: updatedRows } = await query(`UPDATE macula.safety_flags SET status = $1, "reviewedBy" = $2, "reviewedAt" = NOW() WHERE id = $3 RETURNING *`, [decision, reviewedBy || "Compliance officer", flagId]);
    safetyFlagsCache.clear();
    const updated = updatedRows[0];
    if (existing.imageAssetId) {
      await query(`UPDATE macula.image_assets SET "phiReviewStatus" = $1, "updatedAt" = NOW() WHERE id = $2`, [decision === "REVIEWED_OK" ? "CLEAR" : "FLAGGED", existing.imageAssetId]);
    }
    if (existing.caseId && decision === "REJECTED") {
      await query(
        `UPDATE macula.cases SET status = 'REJECTED', rejection_reason = $1, reviewed_by = $2, reviewed_at = NOW(), "updatedAt" = NOW() WHERE id = $3`,
        [updated.detail || "Rejected from the Safety Queue.", reviewedBy || "Compliance officer", existing.caseId],
      );
      await recordAudit({
        organizationId,
        caseId: existing.caseId,
        targetType: "CASE",
        targetId: existing.caseId,
        action: "CASE_REJECTED",
        detail: updated.detail || "Rejected from the Safety Queue.",
        metadata: { reviewedBy, source: "SAFETY_QUEUE", safetyFlagId: flagId },
      });
    }
    await recordAudit({ organizationId, caseId: existing.caseId || undefined, targetType: existing.imageAssetId ? "IMAGE_ASSET" : "CASE", targetId: existing.imageAssetId || existing.caseId || flagId, action: "SAFETY_FLAG_RESOLVED", detail: decision, metadata: { reviewedBy } });

    return NextResponse.json({ success: true, flag: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
