ALTER TABLE "macula"."users"
  ADD COLUMN "mustSetPassword" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "passwordResetTokenHash" TEXT,
  ADD COLUMN "passwordResetExpiresAt" TIMESTAMP(3);