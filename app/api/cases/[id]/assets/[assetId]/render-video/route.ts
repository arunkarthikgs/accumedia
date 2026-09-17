import { NextResponse } from "next/server";
import { normalizeBrandColor } from "@/lib/brand";
import { requireOrganizationAccess } from "@/lib/tenant-auth";
import { submitVideoRenderJob } from "@/lib/video-render-service";
import { query } from "@/lib/worker-db";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, props: { params: Promise<{ id: string; assetId: string }> }) {
  try {
    const { id, assetId } = await props.params;
    const asset = (await query<any>(`SELECT ga.id, ga.content, ga.status, ga."outputType", ga."videoStatus", EXTRACT(EPOCH FROM (NOW() - ga."updatedAt")) AS "renderAgeSeconds", c.id AS case_id, c.title, c."organizationId", o."brandingHex", o."defaultDisclaimer", o."logoUrl" FROM macula.macula_generated_assets ga JOIN macula.macula_cases c ON c.id = ga."caseId" JOIN macula.macula_organizations o ON o.id = c."organizationId" WHERE ga.id = $1 LIMIT 1`, [assetId])).rows[0];
    if (!asset || asset.case_id !== id) return NextResponse.json({ error: "Asset not found." }, { status: 404 });
    await requireOrganizationAccess(asset.organizationId);
    if (asset.status !== "APPROVED") return NextResponse.json({ error: "Approve the video script asset before rendering." }, { status: 409 });
    if (asset.outputType !== "VIDEO_SCRIPT") return NextResponse.json({ error: "Only video script assets can be rendered." }, { status: 400 });
    const renderAgeSeconds = Number(asset.renderAgeSeconds);
    const activeRender = ["QUEUED", "PROCESSING"].includes(asset.videoStatus) &&
      renderAgeSeconds >= 0 && renderAgeSeconds < 15 * 60;
    if (activeRender) return NextResponse.json({ status: asset.videoStatus });
    const content = asset.content as Record<string, unknown>;
    const script = typeof content.script === "string" ? content.script : typeof content.draft_text === "string" ? content.draft_text : String(content.raw_text || "");
    if (!script.trim()) return NextResponse.json({ error: "The video script is empty." }, { status: 400 });
    const job = await submitVideoRenderJob({ caseId: id, assetId, script, title: asset.title, accent: normalizeBrandColor(asset.brandingHex), disclaimer: asset.defaultDisclaimer, logoUrl: asset.logoUrl }, new URL(_req.url).origin);
    await query(`UPDATE macula.macula_generated_assets SET "videoStatus" = 'PROCESSING', "updatedAt" = NOW() WHERE id = $1`, [assetId]);
    return NextResponse.json({ success: true, jobId: job.jobId, status: "PROCESSING" }, { status: 202 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Unable to queue video rendering." }, { status: 500 });
  }
}

export async function GET(_req: Request, props: { params: Promise<{ id: string; assetId: string }> }) {
  try {
    const { id, assetId } = await props.params;
    const asset = (await query<any>(`SELECT ga."videoR2Key", ga."videoDurationSeconds", ga."videoStatus", c.id AS case_id, c."organizationId" FROM macula.macula_generated_assets ga JOIN macula.macula_cases c ON c.id = ga."caseId" WHERE ga.id = $1 LIMIT 1`, [assetId])).rows[0];
    if (!asset || asset.case_id !== id) return NextResponse.json({ error: "Asset not found." }, { status: 404 });
    await requireOrganizationAccess(asset.organizationId);
    return NextResponse.json({ status: asset.videoStatus || (asset.videoR2Key ? "READY" : "IDLE"), durationSeconds: asset.videoDurationSeconds, videoUrl: asset.videoR2Key ? `/api/cases/${id}/assets/${assetId}/video` : null }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Unable to load render status." }, { status: 500 });
  }
}