import OpenAI from "openai";
import { db } from "@/lib/db";
import type { ChannelDefinition, Organization } from "@prisma/client";
import { validateGeneratedContent } from "./content-validation";
import { logAIUsage } from "./ai-usage";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * RFP §7-12 output-type prompt library. Each entry is deliberately kept as
 * plain, versionable template text — this is the Prompt Management Layer
 * (RFP §25): an admin can edit ChannelDefinition.systemPrompt per org without
 * touching this code, but if systemPrompt is blank we fall back to these
 * defaults so every org gets the six required outputs out of the box.
 */
const DEFAULT_PROMPTS: Record<string, string> = {
  VIDEO_SCRIPT: `Write a spoken video script a doctor can read on camera or use as a
teleprompter, based only on the approved clinical record below.
Structure: Hook -> Case/context -> Clinical challenge -> Decision -> Learning -> Takeaway.
Sound like a doctor speaking naturally, not an advertisement. Avoid promotional
or guaranteed-outcome language. Target duration: {duration}.
Return only the spoken script text.`,

  LINKEDIN_ARTICLE: `Write a LinkedIn long-form article (800-1500 words) for a healthcare
professional audience, based only on the approved clinical record below.
Structure: headline + hook, clinical context and challenge, decision-making and
approach, outcome and follow-up, key learning and broader relevance, closing
takeaway. Use subheadings and bullets. No promotional or guaranteed-outcome claims.
Also propose a one-line non-sensational image concept for a LinkedIn cover image.
Return JSON: { "article_markdown": string, "image_brief": string }`,

  LINKEDIN_SHORT_POST: `Write a short LinkedIn post (150-300 words) based only on the approved
clinical record below: strong opening, brief context, key insight, educational
takeaway, soft CTA, 3-6 relevant hashtags. No promotional/guaranteed-outcome claims.
Also propose an optional 3-5 card carousel outline (one short line per card).
Return JSON: { "post_text": string, "hashtags": string[], "carousel_cards": string[] }`,

  FACEBOOK_POST: `Write a Facebook post (150-350 words) for a patient/family audience,
based only on the approved clinical record below. Simpler, warmer, less technical
than the LinkedIn version. No jargon without a plain-language explanation. No
promotional/guaranteed-outcome claims. Propose one image concept (poster / quote
card / case-learning graphic / doctor insight graphic).
Return JSON: { "post_text": string, "image_brief": string }`,

  X_POST: `Write X/Twitter content based only on the approved clinical record below.
Produce a single concise educational post within {platform_char_limit} characters,
and if the topic needs more room, an optional thread of 3-7 numbered posts each
within the same limit. No promotional/guaranteed-outcome claims.
Return JSON: { "single_post": string, "thread": string[], "image_brief": string }`,

  YOUTUBE_REELS_METADATA: `Based on the approved clinical record below, generate metadata for
Instagram Reels, Facebook Reels, YouTube Shorts, YouTube long-form, and LinkedIn
video: video_title, short_description, detailed_description, key_learning_points
(3-5), keywords (5-10), hashtags (5-10), thumbnail_title, cta.
Return JSON matching those fields exactly.`,

  SEO_BLOG: `Write an SEO-oriented blog article (1000-1800 words) based only on the
approved clinical record below. First decide if this is patient-education or
professional/clinical content. Include: seo_title, h1, url_slug, meta_title,
meta_description, primary_keyword, secondary_keywords (5-10), long_tail_keywords
(5-10), search_intent, suggested_headings, full_article, faq_section (3-6 Q&A),
image_alt_text, featured_image_brief. No promotional/guaranteed-outcome claims.
Return JSON matching those fields.`,
};

interface GenerateOptions {
  caseId: string;
  masterRecord: Record<string, any>;
  organization: Organization;
  channel: ChannelDefinition;
}

export async function generateChannelAsset({
  caseId,
  masterRecord,
  organization,
  channel,
}: GenerateOptions) {
  const outputType = channel.outputType || "SEO_BLOG";
  const basePrompt = channel.systemPrompt?.trim() || DEFAULT_PROMPTS[outputType];
  const platformLimit = await db.platformLimit.findUnique({ where: { platform: "x" } });

  const systemPrompt = `${basePrompt}

Never include anything listed under the record's confidentiality_flags.
Never state or imply a guaranteed outcome. Respect the record's
terminology_retain / terminology_simplify guidance. Include this disclaimer
where applicable: "${organization.defaultDisclaimer}".`;

  const resolvedPrompt = systemPrompt
    .replace("{duration}", channel.durationLabel || "60 seconds")
    .replace("{platform_char_limit}", String(platformLimit?.maxCharacters || 280));

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    temperature: 0.3,
    response_format: outputType === "VIDEO_SCRIPT" ? undefined : { type: "json_object" },
    messages: [
      { role: "system", content: resolvedPrompt },
      { role: "user", content: `Approved Master Clinical Content Record:\n${JSON.stringify(masterRecord, null, 2)}` },
    ],
  });

  await logAIUsage({
    organizationId: organization.id,
    caseId,
    operation: "channel_asset_generation",
    provider: "OpenAI",
    model: "gpt-4o",
    inputTokens: response.usage?.prompt_tokens,
    outputTokens: response.usage?.completion_tokens,
    metadata: { channelKey: channel.channelKey, outputType },
  });

  const raw = response.choices[0]?.message?.content || "";
  const content = outputType === "VIDEO_SCRIPT" ? { script: raw } : safeJsonParse(raw);
  const validation = validateGeneratedContent(content, channel);

  return db.generatedAsset.create({
    data: {
      caseId,
      channelKey: channel.channelKey,
      channelName: channel.displayName,
      outputType: outputType as any,
      variant: channel.durationLabel || undefined,
      content,
      status: validation.valid ? "DRAFT" : "REVIEW",
      validationWarnings: validation.warnings,
      validationWordCount: validation.wordCount,
      validationCharacterCount: validation.characterCount,
      validationDurationSeconds: validation.estimatedDurationSeconds,
      version: 1,
      promptTemplateId: channel.id,
      modelUsed: "gpt-4o",
    },
  });
}

function safeJsonParse(raw: string) {
  try {
    return JSON.parse(raw);
  } catch {
    return { raw_text: raw, parse_error: true };
  }
}

/**
 * RFP §6 — fans out generation across every active channel for the org,
 * only ever called after the MCCR has been approved (see approve/route.ts).
 * Falls back to the six required output types if the org hasn't configured
 * ChannelDefinitions yet, so no org ships with zero required outputs.
 */
export async function runAdaptationEngine(caseId: string) {
  const kase = await db.case.findUniqueOrThrow({
    where: { id: caseId },
    include: { organization: true },
  });

  let channels = await db.channelDefinition.findMany({
    where: { isActive: true, OR: [{ organizationId: kase.organizationId }, { organizationId: null }] },
  });

  if (channels.length === 0) {
    channels = await db.channelDefinition.findMany({ where: { organizationId: null } });
  }

  const created = [];
  for (const channel of channels) {
    const asset = await generateChannelAsset({
      caseId,
      masterRecord: kase.masterRecord as Record<string, any>,
      organization: kase.organization,
      channel,
    });
    created.push(asset);
  }
  return created;
}
