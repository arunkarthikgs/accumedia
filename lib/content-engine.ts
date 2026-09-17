import crypto from "node:crypto";
import { query } from "@/lib/worker-db";
import { createOpenAIChatCompletion } from "@/lib/openai-fetch";
import { validateGeneratedContent } from "./content-validation";
import { logAIUsage } from "./ai-usage";
import { assertAssetQuota, assertPublishingGenerationQuota, assertTokenQuota } from "./quotas";

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
  organization: any;
  channel: any;
  skipAssetQuota?: boolean;
  skipTokenQuota?: boolean;
  generationContext?: {
    platformCharacterLimit: number;
    seoKeywordSet: any;
  };
}

function prepareChannelPrompt(
  masterRecord: Record<string, any>,
  organization: any,
  channel: any,
  generationContext: { platformCharacterLimit: number; seoKeywordSet: any }
) {
  const outputType = channel.outputType || "SEO_BLOG";
  const basePrompt = channel.systemPrompt?.trim() || DEFAULT_PROMPTS[outputType];
  const systemPrompt = `${basePrompt}

Never include anything listed under the record's confidentialityFlags or confidentiality_flags.
Never state or imply a guaranteed outcome. Respect the record's
terminologyRetain, terminologySimplify, terminology_retain, and terminology_simplify guidance. Include this disclaimer
where applicable: "${organization.defaultDisclaimer}".
Organization writing tone: ${organization.preferredTone || "clinically precise, educational, and respectful"}.
Default call to action, where appropriate and non-promotional: ${organization.callToAction || "None configured"}.`;
  const seoKeywordSet = outputType === "SEO_BLOG" ? generationContext.seoKeywordSet : null;
  const resolvedPrompt = systemPrompt
    .replace("{duration}", channel.durationLabel || "60 seconds")
    .replace("{platform_char_limit}", String(generationContext.platformCharacterLimit)) +
    (seoKeywordSet ? `\nUse this approved keyword strategy; do not invent replacement keywords:\n${JSON.stringify(seoKeywordSet, null, 2)}` : "");
  const masterRecordJson = JSON.stringify(masterRecord, null, 2);
  return {
    outputType,
    resolvedPrompt,
    masterRecordJson,
    estimatedTokens: Math.ceil((resolvedPrompt.length + masterRecordJson.length) / 4) + 4096,
    promptTemplateVersion: `${channel.promptVersion}:${crypto.createHash("sha256").update(resolvedPrompt).digest("hex").slice(0, 12)}`,
  };
}

export async function generateChannelAsset({
  caseId,
  masterRecord,
  organization,
  channel,
  skipAssetQuota,
  skipTokenQuota,
  generationContext,
}: GenerateOptions) {
  if (!skipAssetQuota) await assertAssetQuota(organization.id);
  const context = generationContext || {
    platformCharacterLimit: (await query<{ maxCharacters: number | null }>(`SELECT "maxCharacters" FROM macula.platform_limits WHERE platform = 'x' LIMIT 1`)).rows[0]?.maxCharacters || 280,
    seoKeywordSet: channel.outputType === "SEO_BLOG"
      ? (await query(`SELECT "primaryKeyword", "secondaryKeywords", "longTailKeywords", "localKeywords", "questionKeywords", "semanticKeywords", "searchIntent" FROM macula.seo_keyword_sets WHERE "caseId" = $1 LIMIT 1`, [caseId])).rows[0]
      : null,
  };
  const prepared = prepareChannelPrompt(masterRecord, organization, channel, context);
  const { outputType, resolvedPrompt, masterRecordJson, promptTemplateVersion } = prepared;

  if (!skipTokenQuota) await assertTokenQuota(organization.id, prepared.estimatedTokens);

  const response = await createOpenAIChatCompletion({
    model: "gpt-4o",
    temperature: 0.3,
    jsonMode: outputType !== "VIDEO_SCRIPT",
    messages: [
      { role: "system", content: resolvedPrompt },
      { role: "user", content: `Approved Master Clinical Content Record:\n${masterRecordJson}` },
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

  const raw = response.choices?.[0]?.message?.content || "";
  const content = outputType === "VIDEO_SCRIPT" ? { script: raw } : safeJsonParse(raw);
  const validation = validateGeneratedContent(content, channel);

  const { rows } = await query(`INSERT INTO macula.generated_assets (id, "caseId", "channelKey", "channelName", "outputType", variant, content, status, "validationWarnings", "validationWordCount", "validationCharacterCount", "validationDurationSeconds", version, "promptTemplateId", "promptTemplateVersion", "modelUsed") VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9::jsonb, $10, $11, $12, 1, $13, $14, 'gpt-4o') RETURNING *`, [crypto.randomUUID(), caseId, channel.channelKey, channel.displayName, outputType, channel.durationLabel || null, JSON.stringify(content), validation.valid ? "DRAFT" : "REVIEW", JSON.stringify(validation.warnings || []), validation.wordCount, validation.characterCount, validation.estimatedDurationSeconds, channel.id, promptTemplateVersion]);
  return rows[0];
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
  const kase = (await query<any>(`SELECT c.*, row_to_json(o) AS organization FROM macula.cases c JOIN macula.organizations o ON o.id = c."organizationId" WHERE c.id = $1 LIMIT 1`, [caseId])).rows[0];
  if (!kase) throw new Error("Case not found.");

  const [channelResult, existingAssetResult, platformLimitResult, seoKeywordResult] = await Promise.all([
    query<any>(`SELECT * FROM macula.channel_definitions WHERE "isActive" = TRUE AND "outputType" IS NOT NULL AND ("organizationId" = $1 OR "organizationId" IS NULL) ORDER BY ("organizationId" IS NOT NULL) DESC`, [kase.organizationId]),
    query<{ channelKey: string }>(`SELECT "channelKey" FROM macula.generated_assets WHERE "caseId" = $1`, [caseId]),
    query<{ maxCharacters: number | null }>(`SELECT "maxCharacters" FROM macula.platform_limits WHERE platform = 'x' LIMIT 1`),
    query(`SELECT "primaryKeyword", "secondaryKeywords", "longTailKeywords", "localKeywords", "questionKeywords", "semanticKeywords", "searchIntent" FROM macula.seo_keyword_sets WHERE "caseId" = $1 LIMIT 1`, [caseId]),
  ]);
  let channels = channelResult.rows;

  if (channels.length === 0) {
    channels = (await query<any>(`SELECT * FROM macula.channel_definitions WHERE "organizationId" IS NULL AND "outputType" IS NOT NULL`)).rows;
  }
  channels = Array.from(new Map(channels.map((channel: any) => [channel.channelKey, channel])).values());

  const existingAssets = existingAssetResult.rows;
  const existingChannelKeys = new Set(existingAssets.map((asset) => asset.channelKey));
  const missingChannels = channels.filter((channel) => !existingChannelKeys.has(channel.channelKey));
  if (missingChannels.length === 0) return [];

  const generationContext = {
    platformCharacterLimit: platformLimitResult.rows[0]?.maxCharacters || 280,
    seoKeywordSet: seoKeywordResult.rows[0] || null,
  };
  const estimatedTokens = missingChannels.reduce(
    (total, channel) => total + prepareChannelPrompt(kase.masterRecord, kase.organization, channel, generationContext).estimatedTokens,
    0
  );
  await assertPublishingGenerationQuota(kase.organizationId, missingChannels.length, estimatedTokens);

  return mapWithConcurrency(missingChannels, 3, (channel) =>
    generateChannelAsset({
      caseId,
      masterRecord: kase.masterRecord as Record<string, any>,
      organization: kase.organization,
      channel,
      skipAssetQuota: true,
      skipTokenQuota: true,
      generationContext,
    })
  );
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, mapper: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  let firstError: unknown;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (!firstError && nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        results[index] = await mapper(items[index]);
      } catch (error) {
        firstError = error;
      }
    }
  });
  await Promise.all(workers);
  if (firstError) throw firstError;
  return results;
}
