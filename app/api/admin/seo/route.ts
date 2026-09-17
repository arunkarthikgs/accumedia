import { NextResponse } from "next/server";
import { assessSeoQuality } from "@/lib/seo-quality";
import { requireOrganizationAccess } from "@/lib/tenant-auth";
import { query } from "@/lib/worker-db";

export async function GET(req: Request) {
  try {
    const organizationId = new URL(req.url).searchParams.get("orgId");
    if (!organizationId) return NextResponse.json({ error: "orgId is required." }, { status: 400 });
    await requireOrganizationAccess(organizationId);
    const { rows: sets } = await query(`SELECT sk.*, json_build_object('id', c.id, 'title', c.title, 'status', c.status) AS case FROM macula.seo_keyword_sets sk JOIN macula.cases c ON c.id = sk."caseId" WHERE c."organizationId" = $1 ORDER BY sk."updatedAt" DESC`, [organizationId]);
    return NextResponse.json({ sets });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to load SEO records." }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const existing = (await query<any>(`SELECT sk.*, c."organizationId" FROM macula.seo_keyword_sets sk JOIN macula.cases c ON c.id = sk."caseId" WHERE sk.id = $1 LIMIT 1`, [body.id])).rows[0];
    if (!existing) return NextResponse.json({ error: "SEO record not found." }, { status: 404 });
    await requireOrganizationAccess(existing.case.organizationId);
    const quality = assessSeoQuality(body);
    const duplicate = (await query<any>(`SELECT id, "caseId" FROM macula.seo_keyword_sets WHERE "contentHash" = $1 AND id <> $2 LIMIT 1`, [quality.contentHash, body.id])).rows[0];
    const validationIssues = duplicate ? [...quality.issues, "This SEO package duplicates another case's keyword/content hash."] : quality.issues;
    const { rows } = await query(`UPDATE macula.seo_keyword_sets SET "primaryKeyword"=$1, "secondaryKeywords"=$2::jsonb, "longTailKeywords"=$3::jsonb, "localKeywords"=$4::jsonb, "questionKeywords"=$5::jsonb, "semanticKeywords"=$6::jsonb, "searchIntent"=$7, "qualityScore"=$8, "validationIssues"=$9::jsonb, "contentHash"=$10, "reviewedAt"=NOW(), "reviewedBy"=$11, "updatedAt"=NOW() WHERE id=$12 RETURNING *`, [body.primaryKeyword || null, JSON.stringify(body.secondaryKeywords || []), JSON.stringify(body.longTailKeywords || []), JSON.stringify(body.localKeywords || []), JSON.stringify(body.questionKeywords || []), JSON.stringify(body.semanticKeywords || []), body.searchIntent || null, duplicate ? Math.max(0, quality.score - 20) : quality.score, JSON.stringify(validationIssues), quality.contentHash, body.reviewedBy || "SEO editor", body.id]);
    const set = rows[0];
    return NextResponse.json({ success: true, set });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to update SEO record." }, { status: 500 });
  }
}