import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAudioPlaybackUrl } from "@/lib/r2";

export async function GET(req: Request) {
  try {
    const recordingId = new URL(req.url).searchParams.get("recordingId");
    if (!recordingId) {
      return NextResponse.json({ error: "recordingId is required." }, { status: 400 });
    }

    const recording = await db.audioRecording.findUnique({
      where: { id: recordingId },
      select: { r2Key: true, mimeType: true },
    });

    if (!recording) {
      return NextResponse.json({ error: "Recording not found." }, { status: 404 });
    }

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