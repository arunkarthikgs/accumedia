import { NextResponse } from "next/server";
import { uploadAudioToR2 } from "@/lib/r2";
import { assertAudioQuota, assertCaseQuota } from "@/lib/quotas";
import { requireOrganizationAccess } from "@/lib/tenant-auth";
import { query } from "@/lib/worker-db";
import crypto from "node:crypto";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const audioFile = formData.get("audio") as File | null;
    const orgId = formData.get("orgId") as string | null;
    const userId = formData.get("userId") as string | null;
    const durationSeconds = parseInt(
      (formData.get("durationSeconds") as string) || "0",
      10
    );

    if (!audioFile) {
      return NextResponse.json(
        { error: "Audio file payload is required." },
        { status: 400 }
      );
    }

    if (!orgId) {
      return NextResponse.json(
        { error: "Organization ID is required." },
        { status: 400 }
      );
    }

    await assertCaseQuota(orgId);
    await assertAudioQuota(orgId, Number.isFinite(durationSeconds) ? durationSeconds : 0);
    await requireOrganizationAccess(orgId);

    // Resolve attending physician
    let physicianId = userId;
    if (!physicianId) {
      const defaultUser = (await query<{ id: string }>(`SELECT id FROM macula.users WHERE "organizationId" = $1 ORDER BY name ASC LIMIT 1`, [orgId])).rows[0];
      physicianId = defaultUser?.id || null;
    }

    if (!physicianId) {
      return NextResponse.json(
        { error: "A valid physician user is required to associate with the clinical case." },
        { status: 400 }
      );
    }

    const arrayBuffer = await audioFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const mimeType = audioFile.type || "audio/webm";

    // 1. Upload to Cloudflare R2
    const { r2Key, storageUrl } = await uploadAudioToR2(
      buffer,
      audioFile.name || "dictation.webm",
      mimeType,
      orgId
    );

    // 2. Create the Clinical Case immediately for strict chain-of-custody
    const timestampStr = new Date().toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    });

    const caseId = crypto.randomUUID();
    const safetyAudit = { auditLoggedAt: new Date().toISOString(), source: "AUDIO_DICTATION", status: "AWAITING_TRANSCRIPTION" };
    const { rows: caseRows } = await query(`INSERT INTO macula.cases (id, title, raw_input, status, "organizationId", "physicianId", "masterRecord", "safetyAudit") VALUES ($1, $2, '', 'PENDING_REVIEW', $3, $4, '{}'::jsonb, $5::jsonb) RETURNING id`, [caseId, `Dictated Case - ${timestampStr}`, orgId, physicianId, JSON.stringify(safetyAudit)]);
    const newCase = caseRows[0];

    // 3. Create Audio Recording linked to the new Case
    const { rows: recordingRows } = await query(`INSERT INTO macula.audio_recordings (id, "r2Key", "storageUrl", "fileName", "durationSeconds", "transcriptionStatus", "organizationId", "userId", "caseId", "mimeType") VALUES ($1, $2, $3, $4, $5, 'UPLOADED', $6, $7, $8, $9) RETURNING id, "r2Key", "storageUrl", "durationSeconds"`, [crypto.randomUUID(), r2Key, storageUrl, audioFile.name || "dictation.webm", durationSeconds, orgId, physicianId, newCase.id, mimeType]);
    const recording = recordingRows[0];

    return NextResponse.json({
      success: true,
      caseId: newCase.id,
      recordingId: recording.id,
      r2Key: recording.r2Key,
      storageUrl: recording.storageUrl,
      durationSeconds: recording.durationSeconds,
    });
  } catch (error: any) {
    console.error("Audio upload & case creation failed:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process audio ingestion." },
      { status: 500 }
    );
  }
}
