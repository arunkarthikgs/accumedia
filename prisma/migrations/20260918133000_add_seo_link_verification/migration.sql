ALTER TABLE "macula"."seo_content_metadata"
  ADD COLUMN "internalLinkVerification" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "externalLinkVerification" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "linkVerificationStatus" TEXT NOT NULL DEFAULT 'UNRESOLVED';