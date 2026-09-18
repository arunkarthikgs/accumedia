import crypto from "node:crypto";
import { query } from "@/lib/worker-db";
import { verifySeoLinks } from "@/lib/seo-links";
import type { SeoLinkVerification } from "@/lib/seo-links";

function stringValue(content: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    if (typeof content[key] === "string" && content[key].trim()) return content[key].trim();
  }
  return null;
}

function arrayValue(content: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    if (Array.isArray(content[key])) return content[key].filter(Boolean);
  }
  return [];
}

/** Keep structured SEO fields queryable without removing the original asset JSON. */
export async function upsertSeoContentMetadata(assetId: string, content: unknown, websiteUrl?: string | null, linkVerification?: SeoLinkVerification) {
  if (!content || typeof content !== "object" || Array.isArray(content)) return;
  const value = content as Record<string, unknown>;
  if (!stringValue(value, "full_article", "fullArticle") && !stringValue(value, "seo_title", "seoTitle")) return;
  const verification = linkVerification || await verifySeoLinks(content, websiteUrl);

  await query(`INSERT INTO macula.seo_content_metadata
    (id, "assetId", "contentType", "seoTitle", h1, "urlSlug", "metaTitle", "metaDescription", "primaryKeyword", "secondaryKeywords", "longTailKeywords", "searchIntent", "suggestedHeadings", "fullArticle", "faqSection", "internalLinkSuggestions", "externalReferenceSuggestions", "imageAltText", "featuredImageBrief", "schemaRecommendations", "internalLinkVerification", "externalLinkVerification", "linkVerificationStatus")
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12,$13::jsonb,$14,$15::jsonb,$16::jsonb,$17::jsonb,$18,$19,$20::jsonb,$21::jsonb,$22::jsonb,$23)
    ON CONFLICT ("assetId") DO UPDATE SET
      "contentType"=EXCLUDED."contentType", "seoTitle"=EXCLUDED."seoTitle", h1=EXCLUDED.h1,
      "urlSlug"=EXCLUDED."urlSlug", "metaTitle"=EXCLUDED."metaTitle", "metaDescription"=EXCLUDED."metaDescription",
      "primaryKeyword"=EXCLUDED."primaryKeyword", "secondaryKeywords"=EXCLUDED."secondaryKeywords", "longTailKeywords"=EXCLUDED."longTailKeywords",
      "searchIntent"=EXCLUDED."searchIntent", "suggestedHeadings"=EXCLUDED."suggestedHeadings", "fullArticle"=EXCLUDED."fullArticle",
      "faqSection"=EXCLUDED."faqSection", "internalLinkSuggestions"=EXCLUDED."internalLinkSuggestions", "externalReferenceSuggestions"=EXCLUDED."externalReferenceSuggestions",
      "imageAltText"=EXCLUDED."imageAltText", "featuredImageBrief"=EXCLUDED."featuredImageBrief", "schemaRecommendations"=EXCLUDED."schemaRecommendations", "internalLinkVerification"=EXCLUDED."internalLinkVerification", "externalLinkVerification"=EXCLUDED."externalLinkVerification", "linkVerificationStatus"=EXCLUDED."linkVerificationStatus", "updatedAt"=NOW()`, [
    crypto.randomUUID(), assetId,
    stringValue(value, "content_type", "contentType"), stringValue(value, "seo_title", "seoTitle"), stringValue(value, "h1"),
    stringValue(value, "url_slug", "urlSlug"), stringValue(value, "meta_title", "metaTitle"), stringValue(value, "meta_description", "metaDescription"),
    stringValue(value, "primary_keyword", "primaryKeyword"), JSON.stringify(arrayValue(value, "secondary_keywords", "secondaryKeywords")),
    JSON.stringify(arrayValue(value, "long_tail_keywords", "longTailKeywords")), stringValue(value, "search_intent", "searchIntent"),
    JSON.stringify(arrayValue(value, "suggested_headings", "suggestedHeadings")), stringValue(value, "full_article", "fullArticle"),
    JSON.stringify(arrayValue(value, "faq_section", "faqSection")), JSON.stringify(arrayValue(value, "internal_link_suggestions", "internalLinkSuggestions")),
    JSON.stringify(arrayValue(value, "external_reference_suggestions", "externalReferenceSuggestions")), stringValue(value, "image_alt_text", "imageAltText"),
    stringValue(value, "featured_image_brief", "featuredImageBrief"), JSON.stringify(arrayValue(value, "schema_recommendations", "schemaRecommendations")),
    JSON.stringify(verification.internal), JSON.stringify(verification.external), verification.status,
  ]);
}