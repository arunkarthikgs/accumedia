import { NextResponse } from "next/server";
import { runAdaptationEngine } from "@/lib/content-engine";
import { requireOrganizationAccess } from "@/lib/tenant-auth";
import { query } from "@/lib/worker-db";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await props.params;
    const kase = (await query<{ organizationId: string; status: string; mccrApprovedAt: Date | null }>(`SELECT "organizationId", status, mccr_approved_at AS "mccrApprovedAt" FROM macula.macula_cases WHERE id = $1 LIMIT 1`, [id])).rows[0];
    if (!kase) return NextResponse.json({ error: "Case not found." }, { status: 404 });
    await requireOrganizationAccess(kase.organizationId);
    if (kase.status !== "APPROVED" || !kase.mccrApprovedAt) return NextResponse.json({ error: "Approve the clinical record before generating publishing assets." }, { status: 409 });
    const assets = await runAdaptationEngine(id);
    return NextResponse.json({ success: true, assetsGenerated: assets.length, assets }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to generate publishing assets." }, { status: 500 });
  }
}