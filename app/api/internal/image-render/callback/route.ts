import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { recordAudit } from "@/lib/audit";
import { query } from "@/lib/worker-db";

type ImageCallback = {
  jobId: string;
  caseId: string;
  organizationId: string;
  channel: string;
  status: "PROCESSING" | "COMPLETED" | "FAILED";
  r2Key?: string;
  faceDetected?: boolean;
  findings?: Array<{ type?: string; detail?: string; confidence?: string; region?: unknown }>;
  generationPromptTemplateId?: string;
  generationPromptVersion?: number;
  safetyPromptTemplateId?: string;
  safetyPromptVersion?: number;
  error?: string;
};

export async function POST(req: Request) {
  if (req.headers.get("x-render-secret") !== process.env.VIDEO_RENDER_CALLBACK_SECRET) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const body = await req.json() as ImageCallback;
    if (!body.jobId || !body.caseId || !body.organizationId || !body.channel || !body.status) {
      return NextResponse.json({ error: "Invalid image callback." }, { status: 400 });
    }

    if (body.status === "PROCESSING") {
      await query(
        `UPDATE macula.image_generation_jobs SET status = 'PROCESSING', "startedAt" = COALESCE("startedAt", NOW()), error = NULL
         WHERE id = $1 AND "caseId" = $2 AND "organizationId" = $3 AND status IN ('QUEUED', 'PROCESSING')`,
        [body.jobId, body.caseId, body.organizationId]
      );
      return NextResponse.json({ success: true });
    }

    if (body.status === "FAILED") {
      await query(
        `UPDATE macula.image_generation_jobs SET status = 'FAILED', error = $4, "completedAt" = NOW()
         WHERE id = $1 AND "caseId" = $2 AND "organizationId" = $3 AND status <> 'COMPLETED'`,
        [body.jobId, body.caseId, body.organizationId, body.error || "Image generation failed."]
      );
      return NextResponse.json({ success: true });
    }

    if (!body.r2Key) return NextResponse.json({ error: "r2Key is required for a completed image." }, { status: 400 });
    const findings = Array.isArray(body.findings) ? body.findings : [];
    const faceDetected = Boolean(body.faceDetected);
    const imageId = crypto.randomUUID();
    const { rows } = await query<{ id: string }>(
      `WITH completed_job AS (
         UPDATE macula.image_generation_jobs
         SET status = 'COMPLETED', "completedAt" = NOW(), error = NULL
         WHERE id = $1 AND "caseId" = $3 AND "organizationId" = $4 AND channel = $5 AND status = 'PROCESSING'
         RETURNING id
       ), inserted_image AS (
         INSERT INTO macula.image_assets
           (id, channel, "sourceType", "r2Key", "storageUrl", "publicUseApproved", "consentConfirmed", "phiReviewStatus", "safetyFindings", "generationPromptTemplateId", "generationPromptVersion", "safetyPromptTemplateId", "safetyPromptVersion", "faceDetected", "screenedAt", "caseId", "createdAt", "updatedAt")
         SELECT $2, $5, 'ai_generated', $6, $6, FALSE, TRUE, $7, $8::jsonb, $9, $10, $11, $12, $13, NOW(), $3, NOW(), NOW()
         FROM completed_job
         RETURNING id
       )
       SELECT id FROM inserted_image`,
      [
        body.jobId,
        imageId,
        body.caseId,
        body.organizationId,
        body.channel,
        body.r2Key,
        findings.length || faceDetected ? "FLAGGED" : "CLEAR",
        JSON.stringify({ findings, regions: findings.filter((finding) => finding.region).map((finding) => finding.region), promptVersion: body.safetyPromptVersion || 0 }),
        body.generationPromptTemplateId || null,
        body.generationPromptVersion || null,
        body.safetyPromptTemplateId || null,
        body.safetyPromptVersion || null,
        faceDetected,
      ]
    );
    const inserted = rows[0];
    if (!inserted) return NextResponse.json({ success: true, duplicate: true });

    if (findings.length || faceDetected) {
      await query(
        `INSERT INTO macula.safety_flags (id, "targetType", detail, "flagType", confidence, status, "createdAt", "caseId", "imageAssetId")
         VALUES ($1, 'IMAGE_ASSET', $2, $3, 'high', 'OPEN', NOW(), $4, $5)`,
        [crypto.randomUUID(), `Generated image safety screening returned ${findings.length} finding(s)${faceDetected ? " and detected a face" : ""}.`, faceDetected ? "face" : "phi", body.caseId, imageId]
      );
    }
    await recordAudit({
      organizationId: body.organizationId,
      caseId: body.caseId,
      targetType: "IMAGE_ASSET",
      targetId: imageId,
      action: "IMAGE_GENERATED_AND_SCREENED",
      metadata: { generationPromptVersion: body.generationPromptVersion || 0, safetyPromptVersion: body.safetyPromptVersion || 0 },
      actorId: null,
    });
    return NextResponse.json({ success: true, imageId });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Unable to update image generation status." }, { status: 500 });
  }
}
