CREATE TABLE "macula"."publication_stats" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OK',
    "impressions" INTEGER,
    "likes" INTEGER,
    "comments" INTEGER,
    "shares" INTEGER,
    "clicks" INTEGER,
    "videoViews" INTEGER,
    "errorMessage" TEXT,
    "raw" JSONB,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "jobId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    CONSTRAINT "publication_stats_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "publication_stats_jobId_fetchedAt_idx" ON "macula"."publication_stats"("jobId", "fetchedAt");
CREATE INDEX "publication_stats_organizationId_fetchedAt_idx" ON "macula"."publication_stats"("organizationId", "fetchedAt");
ALTER TABLE "macula"."publication_stats" ADD CONSTRAINT "publication_stats_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "macula"."publication_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "macula"."publication_stats" ADD CONSTRAINT "publication_stats_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "macula"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
