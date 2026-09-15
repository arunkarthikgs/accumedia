import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrganizationAccess } from "@/lib/tenant-auth";
import { renderClinicalVideo } from "@/lib/video-renderer";
import { uploadVideoToR2 } from "@/lib/r2";

export async function POST(req: Request, props: { params: Promise<{ id: string; assetId: string }> }) {
  try {
    const { id, assetId } = await props.params;
    const asset = await db.generatedAsset.findUnique({ where: { id: assetId }, include: { case: { include: { organization: true } } } });
    if (!asset || asset.caseId !== id) return NextResponse.json({ error: "Asset not found." }, { status: 404 });
    await requireOrganizationAccess(asset.case.organizationId);
    if (asset.status !== "APPROVED") return NextResponse.json({ error: "Approve the video script asset before rendering." }, { status: 409 });
    if (asset.outputType !== "VIDEO_SCRIPT") return NextResponse.json({ error: "Only video script assets can be rendered." }, { status: 400 });
    const form = req.headers.get("content-type")?.includes("multipart/form-data") ? await req.formData() : null;
    const voice = form?.get("voice");
    const content = asset.content as Record<string, unknown>;
    const script = typeof content.script === "string" ? content.script : String(content.raw_text || "");
    if (!script.trim()) return NextResponse.json({ error: "The video script is empty." }, { status: 400 });
    const rendered = await renderClinicalVideo({ script, title: asset.case.title, accent: asset.case.organization.brandingHex || "#0f766e", disclaimer: asset.case.organization.defaultDisclaimer, logoUrl: asset.case.organization.logoUrl, voiceFile: voice instanceof File ? Buffer.from(await voice.arrayBuffer()) : undefined });
    const stored = await uploadVideoToR2(rendered.buffer, `${asset.channelKey}-${Date.now()}.mp4`, rendered.mimeType, asset.case.organizationId);
    const updated = await db.generatedAsset.update({ where: { id: assetId }, data: { videoR2Key: stored.r2Key, videoStorageUrl: stored.storageUrl, videoDurationSeconds: rendered.durationSeconds, videoStatus: "READY", content: { ...content, videoUrl: stored.storageUrl, videoDurationSeconds: rendered.durationSeconds } } });
    return NextResponse.json({ success: true, asset: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Video rendering failed." }, { status: 500 });
  }
}