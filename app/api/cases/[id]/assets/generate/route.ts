import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runAdaptationEngine } from "@/lib/content-engine";
import { requireOrganizationAccess } from "@/lib/tenant-auth";

export async function POST(
  _req: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await props.params;
    const kase = await db.case.findUnique({ where: { id }, select: { organizationId: true, status: true, mccrApprovedAt: true } });
    if (!kase) return NextResponse.json({ error: "Case not found." }, { status: 404 });
    await requireOrganizationAccess(kase.organizationId);
    if (kase.status !== "APPROVED" || !kase.mccrApprovedAt) return NextResponse.json({ error: "Approve the clinical record before generating publishing assets." }, { status: 409 });
    const assets = await runAdaptationEngine(id);
    return NextResponse.json({ success: true, assetsGenerated: assets.length, assets });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to generate publishing assets." }, { status: 500 });
  }
}