CREATE TABLE "macula"."seo_content_metadata" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "contentType" TEXT,
    "seoTitle" TEXT,
    "h1" TEXT,
    "urlSlug" TEXT,
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "primaryKeyword" TEXT,
    "secondaryKeywords" JSONB NOT NULL DEFAULT '[]',
    "longTailKeywords" JSONB NOT NULL DEFAULT '[]',
    "searchIntent" TEXT,
    "suggestedHeadings" JSONB NOT NULL DEFAULT '[]',
    "fullArticle" TEXT,
    "faqSection" JSONB NOT NULL DEFAULT '[]',
    "internalLinkSuggestions" JSONB NOT NULL DEFAULT '[]',
    "externalReferenceSuggestions" JSONB NOT NULL DEFAULT '[]',
    "imageAltText" TEXT,
    "featuredImageBrief" TEXT,
    "schemaRecommendations" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "seo_content_metadata_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "seo_content_metadata_assetId_key" ON "macula"."seo_content_metadata"("assetId");
CREATE INDEX "seo_content_metadata_contentType_idx" ON "macula"."seo_content_metadata"("contentType");
CREATE INDEX "seo_content_metadata_primaryKeyword_idx" ON "macula"."seo_content_metadata"("primaryKeyword");
ALTER TABLE "macula"."seo_content_metadata" ADD CONSTRAINT "seo_content_metadata_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "macula"."generated_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "macula"."seo_content_metadata" (
  "id", "assetId", "contentType", "seoTitle", "h1", "urlSlug", "metaTitle", "metaDescription", "primaryKeyword",
  "secondaryKeywords", "longTailKeywords", "searchIntent", "suggestedHeadings", "fullArticle", "faqSection",
  "internalLinkSuggestions", "externalReferenceSuggestions", "imageAltText", "featuredImageBrief", "schemaRecommendations"
)
SELECT
  gen_random_uuid()::text, ga."id", ga."content"->>'content_type', ga."content"->>'seo_title', ga."content"->>'h1', ga."content"->>'url_slug',
  ga."content"->>'meta_title', ga."content"->>'meta_description', ga."content"->>'primary_keyword',
  COALESCE(ga."content"->'secondary_keywords', '[]'::jsonb), COALESCE(ga."content"->'long_tail_keywords', '[]'::jsonb),
  ga."content"->>'search_intent', COALESCE(ga."content"->'suggested_headings', '[]'::jsonb), ga."content"->>'full_article',
  COALESCE(ga."content"->'faq_section', '[]'::jsonb), COALESCE(ga."content"->'internal_link_suggestions', '[]'::jsonb),
  COALESCE(ga."content"->'external_reference_suggestions', '[]'::jsonb), ga."content"->>'image_alt_text',
  ga."content"->>'featured_image_brief', COALESCE(ga."content"->'schema_recommendations', '[]'::jsonb)
FROM "macula"."generated_assets" ga
WHERE ga."outputType" = 'SEO_BLOG' AND (ga."content" ? 'full_article' OR ga."content" ? 'seo_title');