import { NextResponse } from "next/server";
import { query } from "@/lib/worker-db";

export async function POST(req: Request) {
  if (req.headers.get("x-render-secret") !== process.env.VIDEO_RENDER_CALLBACK_SECRET) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const body = await req.json() as { assetId: string; status: "PROCESSING" | "READY" | "FAILED"; videoR2Key?: string; durationSeconds?: number; error?: string };
    if (!body.assetId || !body.status) return NextResponse.json({ error: "assetId and status are required." }, { status: 400 });
    await query(`UPDATE macula.macula_generated_assets SET "videoStatus" = $1, "videoR2Key" = COALESCE($2, "videoR2Key"), "videoDurationSeconds" = COALESCE($3, "videoDurationSeconds"), "updatedAt" = NOW() WHERE id = $4`, [body.status === "FAILED" ? `FAILED: ${body.error || "Render failed."}` : body.status, body.videoR2Key || null, body.durationSeconds || null, body.assetId]);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Unable to update render status." }, { status: 500 });
  }
}