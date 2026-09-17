import { NextResponse } from "next/server";
import { getResolvedAiPrompts } from "@/lib/ai-prompts";
import { normalizeBrandColor } from "@/lib/brand";
import { submitImageRenderJob } from "@/lib/image-render-service";
import { DEFAULT_IMAGE_GENERATION_PROMPT, DEFAULT_IMAGE_SAFETY_PROMPT } from "@/lib/image-prompts";
import { recordAudit } from "@/lib/audit";
import { requireOrganizationAccess } from "@/lib/tenant-auth";
import { query } from "@/lib/worker-db";
import crypto from "node:crypto";

const CHANNEL_SPECS: Record<string, { size: "1024x1024" | "1536x1024" | "1024x1536"; label: string }> = {
  linkedin_cover: { size: "1536x1024", label: "LinkedIn article cover" },
  linkedin_carousel: { size: "1024x1024", label: "LinkedIn carousel card" },
  facebook_post: { size: "1024x1024", label: "Facebook post image" },
  ig_reels: { size: "1024x1536", label: "Instagram/Reels graphic" },
  x_image: { size: "1536x1024", label: "X/Twitter image" },
  yt_thumbnail: { size: "1536x1024", label: "YouTube thumbnail" },
  blog_featured: { size: "1536x1024", label: "Blog featured image" },
};

function safeImageTitle(title: string, masterRecord: Record<string, unknown> | null) {
  const candidate = String(masterRecord?.topic || masterRecord?.primaryEducationalMessage || title || "").trim();
  if (!candidate || /\b\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{4}\b/i.test(candidate) || /\b\d{1,2}:\d{2}\s*(?:am|pm)?\b/i.test(candidate)) {
    return "Clinical Education Graphic";
  }
  return candidate;
}

async function persistRenderedImage(input: {
  jobId: string;
  caseId: string;
  organizationId: string;
  channel: string;
  r2Key: string;
  faceDetected?: boolean;
  findings?: Array<{ type?: string; detail?: string; confidence?: string; region?: unknown }>;
  generationPromptTemplateId?: string | null;
  generationPromptVersion?: number;
  safetyPromptTemplateId?: string | null;
  safetyPromptVersion?: number;
}) {
  const findings = Array.isArray(input.findings) ? input.findings : [];
  const faceDetected = Boolean(input.faceDetected);
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
      input.jobId,
      imageId,
      input.caseId,
      input.organizationId,
      input.channel,
      input.r2Key,
      findings.length || faceDetected ? "FLAGGED" : "CLEAR",
      JSON.stringify({ findings, regions: findings.filter((finding) => finding.region).map((finding) => finding.region), promptVersion: input.safetyPromptVersion || 0 }),
      input.generationPromptTemplateId || null,
      input.generationPromptVersion || null,
      input.safetyPromptTemplateId || null,
      input.safetyPromptVersion || null,
      faceDetected,
    ]
  );
  if (!rows[0]) return null;
  if (findings.length || faceDetected) {
    await query(
      `INSERT INTO macula.safety_flags (id, "targetType", detail, "flagType", confidence, status, "createdAt", "caseId", "imageAssetId")
       VALUES ($1, 'IMAGE_ASSET', $2, $3, 'high', 'OPEN', NOW(), $4, $5)`,
      [crypto.randomUUID(), `Generated image safety screening returned ${findings.length} finding(s)${faceDetected ? " and detected a face" : ""}.`, faceDetected ? "face" : "phi", input.caseId, imageId]
    );
  }
  await recordAudit({
    organizationId: input.organizationId,
    caseId: input.caseId,
    targetType: "IMAGE_ASSET",
    targetId: imageId,
    action: "IMAGE_GENERATED_AND_SCREENED",
    metadata: { generationPromptVersion: input.generationPromptVersion || 0, safetyPromptVersion: input.safetyPromptVersion || 0 },
    actorId: null,
  });
  return imageId;
}

export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await props.params;
    const kase = (await query<any>(
      `SELECT c.id, c.title, c."organizationId", c."masterRecord", o."brandingHex", o."logoUrl", o."brandFont", o."brandTagline", o."defaultDisclaimer"
       FROM macula.cases c JOIN macula.organizations o ON o.id = c."organizationId" WHERE c.id = $1 LIMIT 1`,
      [id]
    )).rows[0];
    if (!kase) return NextResponse.json({ error: "Case not found." }, { status: 404 });
    await requireOrganizationAccess(kase.organizationId);
    const jobs = (await query<any>(`SELECT id, channel, "conceptBrief" FROM macula.image_generation_jobs WHERE "caseId" = $1 AND status = 'QUEUED' ORDER BY "createdAt" ASC LIMIT 3`, [id])).rows;
    const prompts = await getResolvedAiPrompts(kase.organizationId, ["IMAGE_GENERATION", "IMAGE_SAFETY"]);
    const generationPrompt = prompts.get("IMAGE_GENERATION");
    const safetyPrompt = prompts.get("IMAGE_SAFETY");
    const accent = normalizeBrandColor(kase.brandingHex);
    const results: Array<Record<string, string>> = [];
    for (const job of jobs) {
      const spec = CHANNEL_SPECS[job.channel];
      const claimed = (await query(`UPDATE macula.image_generation_jobs SET status = 'PROCESSING', "startedAt" = NOW(), error = NULL WHERE id = $1 AND status = 'QUEUED' RETURNING id`, [job.id])).rows[0];
      if (!claimed) continue;
      try {
        if (!spec) throw new Error(`Unsupported image channel: ${job.channel}`);
        const masterRecord = kase.masterRecord as Record<string, unknown> | null;
        const brief = job.conceptBrief || masterRecord?.keyInsight || masterRecord?.primaryEducationalMessage || kase.title;
        const title = safeImageTitle(kase.title, masterRecord);
        const prompt = (generationPrompt?.content || DEFAULT_IMAGE_GENERATION_PROMPT)
          .replaceAll("{channelLabel}", spec.label)
          .replaceAll("{brief}", String(brief))
          .replaceAll("{accent}", accent);
        const callbackOrigin = (process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin).replace(/\/+$/, "");
        const renderResult = await submitImageRenderJob({
          jobId: job.id,
          caseId: id,
          organizationId: kase.organizationId,
          channel: job.channel,
          prompt,
          size: spec.size,
          safetyPrompt: safetyPrompt?.content || DEFAULT_IMAGE_SAFETY_PROMPT,
          title,
          accent,
          logoUrl: kase.logoUrl,
          tagline: kase.brandTagline,
          disclaimer: kase.defaultDisclaimer,
          font: kase.brandFont,
          generationPromptTemplateId: generationPrompt?.id,
          generationPromptVersion: generationPrompt?.version,
          safetyPromptTemplateId: safetyPrompt?.id,
          safetyPromptVersion: safetyPrompt?.version,
          callbackUrl: `${callbackOrigin}/api/internal/image-render/callback`,
        });
        const imageId = await persistRenderedImage({
          jobId: job.id,
          caseId: id,
          organizationId: kase.organizationId,
          channel: job.channel,
          r2Key: renderResult.r2Key!,
          faceDetected: renderResult.faceDetected,
          findings: renderResult.findings,
          generationPromptTemplateId: generationPrompt?.id,
          generationPromptVersion: generationPrompt?.version,
          safetyPromptTemplateId: safetyPrompt?.id,
          safetyPromptVersion: safetyPrompt?.version,
        });
        results.push({ id: job.id, channel: job.channel, status: "COMPLETED", imageId: imageId || "" });
      } catch (error: any) {
        await query(`UPDATE macula.image_generation_jobs SET status = 'FAILED', error = $2, "completedAt" = NOW() WHERE id = $1`, [job.id, error.message || "Image generation failed."]);
        results.push({ id: job.id, channel: job.channel, status: "FAILED" });
      }
    }
    return NextResponse.json({ success: true, processed: results.length, results });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to process image generation." }, { status: 500 });
  }
}
