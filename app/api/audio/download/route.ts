import { NextResponse } from "next/server";
import { getAudioPlaybackUrl } from "@/lib/r2";
import { requireOrganizationAccess } from "@/lib/tenant-auth";
import { query } from "@/lib/worker-db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const recordingId = new URL(req.url).searchParams.get("recordingId");
    if (!recordingId) {
      return NextResponse.json({ error: "recordingId is required." }, { status: 400 });
    }

    const recording = (await query<{ r2Key: string; mimeType: string; organizationId: string }>(
      `SELECT "r2Key", "mimeType", "organizationId" FROM macula.audio_recordings WHERE id = $1 LIMIT 1`,
      [recordingId],
    )).rows[0];
    if (!recording) {
      return NextResponse.json({ error: "Recording not found." }, { status: 404 });
    }

    await requireOrganizationAccess(recording.organizationId);
    const response = await fetch(await getAudioPlaybackUrl(recording.r2Key));
    if (!response.ok || !response.body) {
      return NextResponse.json({ error: "Unable to download audio." }, { status: 502 });
    }

    return new Response(response.body, {
      headers: {
        "Content-Type": recording.mimeType || response.headers.get("content-type") || "audio/mpeg",
        "Content-Length": response.headers.get("content-length") || "",
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error: any) {
    console.error("Audio download error:", error);
    return NextResponse.json(
      { error: error.message || "Unable to download audio." },
      { status: 500 },
    );
  }
}
