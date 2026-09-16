import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
import { getAudioPlaybackUrl } from "@/lib/r2";
import { requireOrganizationAccess } from "@/lib/tenant-auth";
import { query } from "@/lib/worker-db";

export async function GET(req: Request) {
  try {
    const recordingId = new URL(req.url).searchParams.get("recordingId");
    if (!recordingId) {
      return NextResponse.json({ error: "recordingId is required." }, { status: 400 });
    }

    const recording = (await query<{ r2Key: string; mimeType: string; organizationId: string }>(
      `SELECT "r2Key", "mimeType", "organizationId" FROM macula.macula_audio_recordings WHERE id = $1 LIMIT 1`, [recordingId]
    )).rows[0];

    if (!recording) {
      return NextResponse.json({ error: "Recording not found." }, { status: 404 });
    }
    await requireOrganizationAccess(recording.organizationId);

    const url = await getAudioPlaybackUrl(recording.r2Key);
    return NextResponse.json({ url, mimeType: recording.mimeType });
  } catch (error: any) {
    console.error("Audio playback URL error:", error);
    return NextResponse.json(
      { error: error.message || "Unable to prepare audio playback." },
      { status: 500 }
    );
  }
}