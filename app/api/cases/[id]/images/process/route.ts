import { NextResponse } from "next/server";
import { getResolvedAiPrompts } from "@/lib/ai-prompts";
import { normalizeBrandColor } from "@/lib/brand";
import { submitImageRenderJob } from "@/lib/image-render-service";
import { DEFAULT_IMAGE_GENERATION_PROMPT, DEFAULT_IMAGE_SAFETY_PROMPT } from "@/lib/image-prompts";
import { requireOrganizationAccess } from "@/lib/tenant-auth";
import { query } from "@/lib/worker-db";

const CHANNEL_SPECS: Record<string, { size: "1024x1024" | "1536x1024" | "1024x1536"; label: string }> = {
  linkedin_cover: { size: "1536x1024", label: "LinkedIn article cover" },
  linkedin_carousel: { size: "1024x1024", label: "LinkedIn carousel card" },
  facebook_post: { size: "1024x1024", label: "Facebook post image" },
  ig_reels: { size: "1024x1536", label: "Instagram/Reels graphic" },
  x_image: { size: "1536x1024", label: "X/Twitter image" },
  yt_thumbnail: { size: "1536x1024", label: "YouTube thumbnail" },
  blog_featured: { size: "1536x1024", label: "Blog featured image" },
};

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
        const prompt = (generationPrompt?.content || DEFAULT_IMAGE_GENERATION_PROMPT)
          .replaceAll("{channelLabel}", spec.label)
          .replaceAll("{brief}", String(brief))
          .replaceAll("{accent}", accent);
        const callbackOrigin = (process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin).replace(/\/+$/, "");
        await submitImageRenderJob({
          jobId: job.id,
          caseId: id,
          organizationId: kase.organizationId,
          channel: job.channel,
          prompt,
          size: spec.size,
          safetyPrompt: safetyPrompt?.content || DEFAULT_IMAGE_SAFETY_PROMPT,
          title: kase.title,
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
        results.push({ id: job.id, channel: job.channel, status: "PROCESSING" });
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
