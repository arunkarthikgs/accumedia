import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { extractSourceText } from "@/lib/source-extraction";
import { extractAudioFromVideo } from "@/lib/video-extraction";
import { getASRProvider } from "@/lib/asr/factory";
import { getASRPromptProfile } from "@/lib/asr/prompts";
import { redactClinicalText } from "@/lib/prompts/clinical-redaction";
import { logAIUsage } from "@/lib/ai-usage";

export async function POST(
  req: Request,
  props: { params: Promise<{ sourceId: string }> }
) {
  const { sourceId } = await props.params;
  const source = await db.caseSource.findUnique({ where: { id: sourceId } });
  if (!source) return NextResponse.json({ error: "Source not found." }, { status: 404 });

  await db.caseSource.update({ where: { id: sourceId }, data: { status: "PROCESSING", processingError: null } });

  try {
    const response = await fetch(source.storageUrl);
    if (!response.ok) throw new Error(`Unable to download source file (${response.status}).`);
    const sourceBuffer = Buffer.from(await response.arrayBuffer());
    let extractedText: string;
    let audioSeconds = 0;
    if (source.sourceType === "VIDEO") {
      const audio = await extractAudioFromVideo(sourceBuffer, source.fileName);
      const model = new URL(req.url).searchParams.get("model") || process.env.DEFAULT_ASR_MODEL || "whisper-1";
      const provider = getASRProvider(model);
      const result = await provider.transcribe({
        buffer: audio.buffer,
        fileName: audio.fileName,
        mimeType: audio.mimeType,
        prompt: getASRPromptProfile(model).prompt || undefined,
      });
      extractedText = redactClinicalText(result.rawTranscript);
      await db.audioRecording.create({
        data: {
          r2Key: source.r2Key,
          storageUrl: source.storageUrl,
          fileName: audio.fileName,
          mimeType: audio.mimeType,
          durationSeconds: audioSeconds,
          transcriptionStatus: "ASR_COMPLETED",
          rawTranscript: extractedText,
          transcribedText: extractedText,
          transcriptionAgent: result.modelIdentifier,
          organizationId: source.organizationId,
          userId: source.userId,
          caseId: source.caseId,
        },
      });
      await logAIUsage({
        organizationId: source.organizationId,
        caseId: source.caseId,
        operation: "video_speech_to_text",
        provider: result.provider,
        model: result.modelIdentifier,
        audioSeconds,
      });
    } else {
      extractedText = await extractSourceText(sourceBuffer, source.fileName, source.mimeType);
    }
    if (!extractedText) throw new Error("No text could be extracted from this document.");

    const updated = await db.caseSource.update({
      where: { id: sourceId },
      data: { status: "READY", extractedText },
    });
    await db.case.update({ where: { id: source.caseId }, data: { rawInput: extractedText } });
    return NextResponse.json({ success: true, source: updated, extractedText });
  } catch (error: any) {
    const message = error.message || "Document extraction failed.";
    const failed = await db.caseSource.update({ where: { id: sourceId }, data: { status: "FAILED", processingError: message } });
    return NextResponse.json({ error: message, source: failed }, { status: 422 });
  }
}
