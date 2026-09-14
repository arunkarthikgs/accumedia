import { NextResponse } from "next/server";
import { uploadAudioToR2 } from "@/lib/r2";
import { db } from "@/lib/db";
import OpenAI, { toFile } from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const audioFile = formData.get("audio") as File | null;
    const orgId = formData.get("orgId") as string | null;
    const userId = (formData.get("userId") as string | null) || undefined;
    const durationSeconds = parseInt((formData.get("durationSeconds") as string) || "0", 10);

    if (!audioFile) {
      return NextResponse.json(
        { error: "No audio file received in form submission." },
        { status: 400 }
      );
    }

    if (!orgId) {
      return NextResponse.json(
        { error: "Organization ID (orgId) is required." },
        { status: 400 }
      );
    }

    const arrayBuffer = await audioFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const sanitizedFileName = audioFile.name
      ? audioFile.name.replace(/[^a-zA-Z0-9.-]/g, "_")
      : "dictation.webm";

    // 1. Upload audio recording to Cloudflare R2 under <org_id>/audio/...
    const { r2Key, storageUrl } = await uploadAudioToR2(
      buffer,
      sanitizedFileName,
      audioFile.type || "audio/webm",
      orgId
    );

    // 2. Convert Audio to Text via AI Engine (Whisper)
    let transcribedText = "";
    try {
      const fileForWhisper = await toFile(buffer, sanitizedFileName, {
        type: audioFile.type || "audio/webm",
      });

      const transcriptionResponse = await openai.audio.transcriptions.create({
        file: fileForWhisper,
        model: "whisper-1",
        language: "en",
        prompt: "Clinical medical consultation and surgical dictation with medical terminology.",
      });

      transcribedText = transcriptionResponse.text;
    } catch (whisperErr: any) {
      console.warn("AI transcription warning:", whisperErr.message);
      // We still preserve the recording metadata even if transcription throws
    }

    // 3. Persist Recording Metadata Entry in Database
    const recordingRecord = await db.audioRecording.create({
      data: {
        r2Key,
        storageUrl,
        fileName: sanitizedFileName,
        durationSeconds: isNaN(durationSeconds) ? 0 : durationSeconds,
        transcribedText: transcribedText || null,
        mimeType: audioFile.type || "audio/webm",
        organizationId: orgId,
        userId: userId || null,
        recordedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      recordingId: recordingRecord.id,
      r2Key,
      storageUrl,
      durationSeconds: recordingRecord.durationSeconds,
      transcribedText,
    });
  } catch (error: any) {
    console.error("Audio processing error (R2/Whisper/DB):", error);
    return NextResponse.json(
      { error: error.message || "Failed to process audio recording and store metadata." },
      { status: 500 }
    );
  }
}
