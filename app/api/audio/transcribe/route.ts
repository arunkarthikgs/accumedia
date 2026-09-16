import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getASRProvider } from "@/lib/asr/factory";
import { getASRPromptProfile } from "@/lib/asr/prompts";
import { redactClinicalText } from "@/lib/prompts/clinical-redaction";
import { logAIUsage } from "@/lib/ai-usage";
import { requireOrganizationAccess } from "@/lib/tenant-auth";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const recordingId = formData.get("recordingId") as string | null;
    const audioFile = formData.get("audio") as File | null;
    const requestedModel = formData.get("model") as string | null;

    if (!recordingId) {
      return NextResponse.json({ error: "recordingId is required." }, { status: 400 });
    }

    const recording = await db.audioRecording.findUnique({
      where: { id: recordingId },
      include: { organization: true },
    });
    if (!recording) return NextResponse.json({ error: "Recording not found." }, { status: 404 });
    await requireOrganizationAccess(recording.organizationId);

    if (!audioFile) {
      return NextResponse.json({ error: "Audio file payload is required." }, { status: 400 });
    }

    // Resolve Organization-specific preference if not explicitly supplied in request
    let selectedModel = requestedModel;
    if (!selectedModel) {
      // Supports org-level model mapping if added to schema
      selectedModel = (recording?.organization as any)?.preferredAsrModel || process.env.DEFAULT_ASR_MODEL || "whisper-1";
    }

    const normalizedModel = selectedModel.trim().toLowerCase();
    const externalAsrModel = ["whisper-1", "openai", "deepgram", "deepgram-nova-3-medical"].includes(normalizedModel);
    if (process.env.NODE_ENV === "production" && externalAsrModel && process.env.ALLOW_EXTERNAL_ASR !== "true") {
      return NextResponse.json(
        {
          error: "External ASR is disabled in production because it would send raw audio outside the hospital environment.",
          requiredModel: "faster-whisper-self-hosted",
          configuration: "Set ALLOW_EXTERNAL_ASR=true only after privacy approval.",
        },
        { status: 409 }
      );
    }

    const arrayBuffer = await audioFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const fileName = audioFile.name ? audioFile.name.replace(/[^a-zA-Z0-9.-]/g, "_") : "dictation.webm";
    const mimeType = audioFile.type || "audio/webm";

    // Resolve provider via Factory
    const provider = getASRProvider(selectedModel);
    const promptProfile = getASRPromptProfile(selectedModel);
    const recordingMeta = {
      organizationId: recording.organizationId,
      durationSeconds: recording.durationSeconds,
      caseId: recording.caseId,
    };

    // Execute Transcription
    const result = await provider.transcribe({
      buffer,
      fileName,
      mimeType,
      prompt: promptProfile.prompt || undefined,
    });

    const redactionRules = recordingMeta
      ? await db.complianceRule.findMany({
          where: {
            ruleType: "DPDP_REDACTION",
            isActive: true,
            OR: [{ organizationId: null }, { organizationId: recordingMeta.organizationId }],
          },
          select: { patternOrCheck: true, description: true },
        })
      : [];
    const sanitizedTranscript = redactClinicalText(result.rawTranscript, redactionRules);

    if (recordingMeta) {
      await logAIUsage({
        organizationId: recordingMeta.organizationId,
        caseId: recordingMeta.caseId,
        operation: "speech_to_text",
        provider: result.provider,
        model: result.modelIdentifier,
        audioSeconds: recordingMeta.durationSeconds,
      });
    }

    // Update database record with the exact agent used
    const updated = await db.audioRecording.update({
      where: { id: recordingId },
      data: {
        rawTranscript: sanitizedTranscript,
        transcriptionStatus: "ASR_COMPLETED",
        transcriptionAgent: result.modelIdentifier,
      },
    });

    return NextResponse.json({
      success: true,
      recordingId: updated.id,
      rawTranscript: sanitizedTranscript,
      transcriptionStatus: updated.transcriptionStatus,
      agentUsed: result.modelIdentifier,
      durationMs: result.executionDurationMs,
    });
  } catch (error: any) {
    console.error("Dynamic ASR processing failed:", error);
    const causeCode = error?.cause?.code || error?.code;
    const connectionFailure = causeCode === "ECONNRESET" || error?.name === "APIConnectionError";
    return NextResponse.json(
      {
        error: connectionFailure
          ? "The ASR provider connection was interrupted while uploading audio. Please retry with a shorter recording or verify network/proxy access to api.openai.com."
          : error.message || "Failed during speech-to-text conversion.",
      },
      { status: 500 }
    );
  }
}
