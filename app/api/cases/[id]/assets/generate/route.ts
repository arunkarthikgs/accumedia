import { NextResponse } from "next/server";
import { runAdaptationEngine } from "@/lib/content-engine";
import { requireOrganizationAccess } from "@/lib/tenant-auth";
import { query } from "@/lib/worker-db";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  props: { params: Promise<{ id: string }> }
) {
  const startedAt = performance.now();
  try {
    const { id } = await props.params;
    const kase = (await query<any>(`SELECT c.*, c.mccr_approved_at AS "mccrApprovedAt", row_to_json(o) AS organization FROM macula.cases c JOIN macula.organizations o ON o.id = c."organizationId" WHERE c.id = $1 LIMIT 1`, [id])).rows[0];
    if (!kase) return NextResponse.json({ error: "Case not found." }, { status: 404 });
    await requireOrganizationAccess(kase.organizationId);
    if (kase.status !== "APPROVED" || !kase.mccrApprovedAt) return NextResponse.json({ error: "Approve the clinical record before generating publishing assets." }, { status: 409 });
    const assets = await runAdaptationEngine(id, kase);
    return NextResponse.json({ success: true, assetsGenerated: assets.length, assets }, {
      headers: {
        "Cache-Control": "no-store",
        "Server-Timing": `publishing-assets;dur=${(performance.now() - startedAt).toFixed(1)}`,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to generate publishing assets." }, { status: 500 });
  }
}