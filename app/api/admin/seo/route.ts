import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assessSeoQuality } from "@/lib/seo-quality";
import { requireOrganizationAccess } from "@/lib/tenant-auth";

export async function GET(req: Request) {
  try {
    const organizationId = new URL(req.url).searchParams.get("orgId");
    if (!organizationId) return NextResponse.json({ error: "orgId is required." }, { status: 400 });
    await requireOrganizationAccess(organizationId);
    const sets = await db.seoKeywordSet.findMany({ where: { case: { organizationId } }, include: { case: { select: { id: true, title: true, status: true } } }, orderBy: { updatedAt: "desc" } });
    return NextResponse.json({ sets });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to load SEO records." }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const existing = await db.seoKeywordSet.findUnique({ where: { id: body.id }, include: { case: { select: { organizationId: true } } } });
    if (!existing) return NextResponse.json({ error: "SEO record not found." }, { status: 404 });
    await requireOrganizationAccess(existing.case.organizationId);
    const quality = assessSeoQuality(body);
    const duplicate = await db.seoKeywordSet.findFirst({ where: { contentHash: quality.contentHash, NOT: { id: body.id } }, select: { id: true, caseId: true } });
    const validationIssues = duplicate ? [...quality.issues, "This SEO package duplicates another case's keyword/content hash."] : quality.issues;
    const set = await db.seoKeywordSet.update({ where: { id: body.id }, data: { primaryKeyword: body.primaryKeyword || null, secondaryKeywords: body.secondaryKeywords || [], longTailKeywords: body.longTailKeywords || [], localKeywords: body.localKeywords || [], questionKeywords: body.questionKeywords || [], semanticKeywords: body.semanticKeywords || [], searchIntent: body.searchIntent || null, qualityScore: duplicate ? Math.max(0, quality.score - 20) : quality.score, validationIssues, contentHash: quality.contentHash, reviewedAt: new Date(), reviewedBy: body.reviewedBy || "SEO editor" } });
    return NextResponse.json({ success: true, set });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to update SEO record." }, { status: 500 });
  }
}