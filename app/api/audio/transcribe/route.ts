import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getASRProvider } from "@/lib/asr/factory";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const recordingId = formData.get("recordingId") as string | null;
    const audioFile = formData.get("audio") as File | null;
    const requestedModel = formData.get("model") as string | null;

    if (!recordingId) {
      return NextResponse.json({ error: "recordingId is required." }, { status: 400 });
    }

    if (!audioFile) {
      return NextResponse.json({ error: "Audio file payload is required." }, { status: 400 });
    }

    // Resolve Organization-specific preference if not explicitly supplied in request
    let selectedModel = requestedModel;
    if (!selectedModel) {
      const recording = await db.audioRecording.findUnique({
        where: { id: recordingId },
        include: { organization: true },
      });
      // Supports org-level model mapping if added to schema
      selectedModel = (recording?.organization as any)?.preferredAsrModel || process.env.DEFAULT_ASR_MODEL || "whisper-1";
    }

    const arrayBuffer = await audioFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const fileName = audioFile.name ? audioFile.name.replace(/[^a-zA-Z0-9.-]/g, "_") : "dictation.webm";
    const mimeType = audioFile.type || "audio/webm";

    // Resolve provider via Factory
    const provider = getASRProvider(selectedModel);

    // Execute Transcription
    const result = await provider.transcribe({
      buffer,
      fileName,
      mimeType,
      prompt: "Clinical medical consultation, pharmacology, ICD-10 diagnostics.",
    });

    // Update database record with the exact agent used
    const updated = await db.audioRecording.update({
      where: { id: recordingId },
      data: {
        rawTranscript: result.rawTranscript,
        transcriptionStatus: "ASR_COMPLETED",
        transcriptionAgent: result.modelIdentifier,
      },
    });

    return NextResponse.json({
      success: true,
      recordingId: updated.id,
      rawTranscript: result.rawTranscript,
      transcriptionStatus: updated.transcriptionStatus,
      agentUsed: result.modelIdentifier,
      durationMs: result.executionDurationMs,
    });
  } catch (error: any) {
    console.error("Dynamic ASR processing failed:", error);
    return NextResponse.json(
      { error: error.message || "Failed during speech-to-text conversion." },
      { status: 500 }
    );
  }
}
