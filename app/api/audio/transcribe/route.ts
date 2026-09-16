import { NextResponse } from "next/server";
import { getASRProvider } from "@/lib/asr/factory";
import { getASRPromptProfile } from "@/lib/asr/prompts";
import { redactClinicalText } from "@/lib/prompts/clinical-redaction";
import { logAIUsage } from "@/lib/ai-usage";
import { requireOrganizationAccess } from "@/lib/tenant-auth";
import { query } from "@/lib/worker-db";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const recordingId = formData.get("recordingId") as string | null;
    const audioFile = formData.get("audio") as File | null;
    const requestedModel = formData.get("model") as string | null;

    if (!recordingId) {
      return NextResponse.json({ error: "recordingId is required." }, { status: 400 });
    }

    const recording = (await query<any>(`SELECT ar.*, o.id AS organization_id, o."preferredAsrModel" AS preferred_asr_model FROM macula.macula_audio_recordings ar JOIN macula.macula_organizations o ON o.id = ar."organizationId" WHERE ar.id = $1 LIMIT 1`, [recordingId])).rows[0];
    if (!recording) return NextResponse.json({ error: "Recording not found." }, { status: 404 });
    await requireOrganizationAccess(recording.organizationId);

    if (!audioFile) {
      return NextResponse.json({ error: "Audio file payload is required." }, { status: 400 });
    }

    // Resolve Organization-specific preference if not explicitly supplied in request
    let selectedModel = requestedModel;
    if (!selectedModel) {
      // Supports org-level model mapping if added to schema
      selectedModel = recording?.preferred_asr_model || process.env.DEFAULT_ASR_MODEL || "whisper-1";
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
    const recordingMeta = { organizationId: recording.organizationId, durationSeconds: recording.durationSeconds, caseId: recording.caseId };

    // Execute Transcription
    const result = await provider.transcribe({
      buffer,
      fileName,
      mimeType,
      prompt: promptProfile.prompt || undefined,
    });

    const redactionRules = recordingMeta
      ? (await query<{ patternOrCheck: string; description: string }>(`SELECT "patternOrCheck", description FROM macula.macula_compliance_rules WHERE "ruleType" = 'DPDP_REDACTION' AND "isActive" = TRUE AND ("organizationId" IS NULL OR "organizationId" = $1)`, [recordingMeta.organizationId])).rows
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
    const { rows: updatedRows } = await query(`UPDATE macula.macula_audio_recordings SET "rawTranscript" = $1, "transcriptionStatus" = 'ASR_COMPLETED', "transcriptionAgent" = $2, "updatedAt" = NOW() WHERE id = $3 RETURNING id, "transcriptionStatus"`, [sanitizedTranscript, result.modelIdentifier, recordingId]);
    const updated = updatedRows[0];

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
