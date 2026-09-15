import OpenAI from "openai";
import { db } from "@/lib/db";
import { uploadImageToR2 } from "@/lib/r2";
import { screenImage } from "@/lib/image-safety";
import { recordAudit } from "@/lib/audit";
import { applyBrandOverlay } from "@/lib/brand-compositor";
import { DEFAULT_IMAGE_GENERATION_PROMPT, DEFAULT_IMAGE_SAFETY_PROMPT } from "@/lib/image-prompts";
import { getResolvedAiPrompts } from "@/lib/ai-prompts";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * RFP §14 — "Each case should have a common visual identity, with multiple
 * aspect ratios generated from the approved design concept." Brand controls:
 * logo placement, colour palette, typography, doctor/hospital name,
 * disclaimer, preferred image style.
 *
 * Note: logo overlay/typography compositing is NOT done here — this
 * generates the base concept image only. Actually stamping the org's logo
 * and exact typography onto it is a separate compositing step (e.g. with
 * sharp or a canvas library) that isn't wired up yet; flagged in the
 * changelog rather than silently skipped.
 */
const CHANNEL_SPECS: Record<string, { size: "1024x1024" | "1536x1024" | "1024x1536"; label: string }> = {
  linkedin_cover: { size: "1536x1024", label: "LinkedIn article cover" },
  linkedin_carousel: { size: "1024x1024", label: "LinkedIn carousel card" },
  facebook_post: { size: "1024x1024", label: "Facebook post image" },
  ig_reels: { size: "1024x1536", label: "Instagram/Reels graphic" },
  x_image: { size: "1536x1024", label: "X/Twitter image" },
  yt_thumbnail: { size: "1536x1024", label: "YouTube thumbnail" },
  blog_featured: { size: "1536x1024", label: "Blog featured image" },
};

export async function generateCaseImage(caseId: string, channel: keyof typeof CHANNEL_SPECS, conceptBrief?: string) {
  const spec = CHANNEL_SPECS[channel];
  if (!spec) {
    throw new Error(`Unknown image channel "${channel}". Expected one of: ${Object.keys(CHANNEL_SPECS).join(", ")}`);
  }

  const kase = await db.case.findUniqueOrThrow({
    where: { id: caseId },
    include: { organization: true },
  });

  const org = kase.organization;
  const promptTemplates = await getResolvedAiPrompts(org.id, ["IMAGE_GENERATION", "IMAGE_SAFETY"]);
  const masterRecord = kase.masterRecord as Record<string, any>;
  const brief =
    conceptBrief ||
    masterRecord?.keyInsight ||
    masterRecord?.primaryEducationalMessage ||
    kase.title;

  // RFP §16 — never depict real patients, faces, or identifying imagery in
  // an AI-generated concept image; this is a brand/educational graphic, not
  // a photo of the case.
  const generationPromptTemplate = promptTemplates.get("IMAGE_GENERATION");
  const safetyPromptTemplate = promptTemplates.get("IMAGE_SAFETY");
  const generationTemplate = generationPromptTemplate?.content || DEFAULT_IMAGE_GENERATION_PROMPT;
  const safetyTemplate = safetyPromptTemplate?.content || DEFAULT_IMAGE_SAFETY_PROMPT;
  const generationVersion = generationPromptTemplate?.version || 0;
  const safetyVersion = safetyPromptTemplate?.version || 0;
  const generationPromptTemplateId = generationPromptTemplate?.id || null;
  const safetyPromptTemplateId = safetyPromptTemplate?.id || null;
  const prompt = generationTemplate
    .replaceAll("{channelLabel}", spec.label)
    .replaceAll("{brief}", brief)
    .replaceAll("{accent}", org.brandingHex || "#0f766e");

  const result = await openai.images.generate({
    model: "gpt-image-1",
    prompt,
    size: spec.size,
    n: 1,
  });

  const b64 = result.data?.[0]?.b64_json;
  if (!b64) {
    throw new Error("Image generation returned no image data.");
  }
  const baseBuffer = Buffer.from(b64, "base64");
  const buffer = await applyBrandOverlay(baseBuffer, { accent: org.brandingHex || "#0f766e", logoUrl: org.logoUrl, title: kase.title, tagline: org.brandTagline, disclaimer: org.defaultDisclaimer, font: org.brandFont });
  const screening = await screenImage(buffer, "image/png", safetyTemplate);
  const fileName = `${channel}-${Date.now()}.png`;

  const { r2Key, storageUrl } = await uploadImageToR2(buffer, fileName, "image/png", kase.organizationId);

  const image = await db.imageAsset.create({
    data: {
      caseId,
      channel,
      sourceType: "ai_generated",
      r2Key,
      storageUrl,
      publicUseApproved: false, // RFP §15 — never auto-published, always requires explicit approval
      consentConfirmed: true, // AI-generated, no patient depicted — no consent question applies
      phiReviewStatus: screening.phiReviewStatus === "FLAGGED" ? "FLAGGED" : "CLEAR",
      ocrText: screening.ocrText || null,
      safetyFindings: { findings: screening.findings, regions: screening.regions, promptVersion: safetyVersion },
      generationPromptTemplateId,
      generationPromptVersion: generationVersion || null,
      safetyPromptTemplateId,
      safetyPromptVersion: safetyVersion || null,
      faceDetected: screening.faceDetected,
      screenedAt: new Date(),
    },
  });
  if (screening.findings.length || screening.faceDetected) {
    await db.safetyFlag.create({
      data: { targetType: "IMAGE_ASSET", flagType: screening.faceDetected ? "face" : "phi", confidence: "high", detail: "Generated image safety screening returned findings.", caseId, imageAssetId: image.id },
    });
  }
  await recordAudit({ organizationId: kase.organizationId, caseId, targetType: "IMAGE_ASSET", targetId: image.id, action: "IMAGE_GENERATED_AND_SCREENED", metadata: { generationPromptVersion: generationVersion, safetyPromptVersion: safetyVersion } });
  return image;
}

export const IMAGE_CHANNELS = Object.keys(CHANNEL_SPECS);
