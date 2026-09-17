import { NextResponse } from "next/server";
import { requireAuthenticatedUser, requireOrganizationAccess } from "@/lib/tenant-auth";
import { contentToText, decryptPublishingSecret, publishToConnection } from "@/lib/publishing";
import { refreshOAuthToken } from "@/lib/publishing-oauth";
import { query } from "@/lib/worker-db";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const cronAuthorized = Boolean(process.env.PUBLISHING_CRON_SECRET && req.headers.get("x-publishing-cron-secret") === process.env.PUBLISHING_CRON_SECRET);
    const user = cronAuthorized ? null : await requireAuthenticatedUser();
    const body = await req.json().catch(() => ({}));
    const organizationId = body.organizationId || user?.organizationId;
    if (!organizationId && !cronAuthorized) return NextResponse.json({ error: "organizationId is required." }, { status: 400 });
    if (organizationId) await requireOrganizationAccess(organizationId);
    const now = new Date();
    const jobValues: unknown[] = [];
    const jobFilters = [`pj.status = 'QUEUED'`, `(pj."scheduledAt" IS NULL OR pj."scheduledAt" <= $${jobValues.push(now)})`, `(pj."nextAttemptAt" IS NULL OR pj."nextAttemptAt" <= $${jobValues.length})`];
    if (organizationId) jobFilters.push(`pj."organizationId" = $${jobValues.push(organizationId)}`);
    if (body.jobId) jobFilters.push(`pj.id = $${jobValues.push(body.jobId)}`);
    const { rows: jobs } = await query<any>(`SELECT pj.*, row_to_json(ga) AS asset, json_build_object('title', c.title, 'images', COALESCE((SELECT json_agg(ia) FROM macula.image_assets ia WHERE ia."caseId" = c.id), '[]')) AS case FROM macula.publication_jobs pj JOIN macula.generated_assets ga ON ga.id = pj."assetId" JOIN macula.cases c ON c.id = pj."caseId" WHERE ${jobFilters.join(" AND ")} ORDER BY pj."createdAt" ASC LIMIT ${body.jobId ? 1 : 25}`, jobValues);
    const connectionPairs = [...new Map(jobs.map((job) => [`${job.organizationId}:${job.platform}`, [job.organizationId, job.platform]])).values()];
    const connections = connectionPairs.length ? (await query<any>(`SELECT * FROM macula.publication_connections WHERE "isActive" = TRUE AND (${connectionPairs.map((_, index) => `("organizationId" = $${index * 2 + 1} AND platform = $${index * 2 + 2})`).join(" OR ")})`, connectionPairs.flat())).rows : [];
    const connectionByPlatform = new Map(connections.map((connection) => [`${connection.organizationId}:${connection.platform}`, connection]));
    const results: Array<Record<string, unknown>> = [];
    const processJob = async (job: typeof jobs[number]) => {
      const connection = connectionByPlatform.get(`${job.organizationId}:${job.platform}`);
      if (!connection) {
        await query(`UPDATE macula.publication_jobs SET status='FAILED', "failureReason"=$1, "updatedAt"=NOW() WHERE id=$2`, [`No active ${job.platform} connection is configured.`, job.id]);
        results.push({ id: job.id, status: "FAILED" });
        return;
      }
      if (connection.expiresAt && connection.expiresAt <= now && connection.refreshTokenEncrypted && ["linkedin", "x", "youtube"].includes(connection.platform)) {
        try {
          const refreshed = await refreshOAuthToken(connection.platform, decryptPublishingSecret(connection.refreshTokenEncrypted));
          await query(`UPDATE macula.publication_connections SET "accessTokenEncrypted"=$1, "refreshTokenEncrypted"=$2, "expiresAt"=$3, "updatedAt"=NOW() WHERE id=$4`, [refreshed.accessTokenEncrypted, refreshed.refreshTokenEncrypted, refreshed.expiresAt, connection.id]);
          Object.assign(connection, refreshed);
        } catch (error: any) {
          await query(`UPDATE macula.publication_jobs SET status='FAILED', "failureReason"=$1, "updatedAt"=NOW() WHERE id=$2`, [`Token refresh failed: ${error.message}`, job.id]);
          results.push({ id: job.id, status: "FAILED" });
          return;
        }
      }
      await query(`UPDATE macula.publication_jobs SET status='PROCESSING', "lastAttemptAt"=$1, "attemptCount"="attemptCount"+1, "updatedAt"=NOW() WHERE id=$2`, [now, job.id]);
      try {
        const assetContent = job.asset.content as Record<string, unknown>;
        const matchingImage = job.case.images.find((image) => image.publicUseApproved && image.phiReviewStatus === "CLEAR" && image.storageUrl);
        const mediaUrl = typeof assetContent.videoUrl === "string" ? assetContent.videoUrl : matchingImage?.storageUrl;
        const published = await publishToConnection(connection, { title: job.case.title, text: contentToText(assetContent), asset: assetContent, mediaUrl });
        await query(`UPDATE macula.publication_jobs SET status='PUBLISHED', "publishedAt"=$1, "externalId"=$2, "failureReason"=NULL, "nextAttemptAt"=NULL, "updatedAt"=NOW() WHERE id=$3`, [new Date(), published.externalId, job.id]);
        await query(`UPDATE macula.generated_assets SET status='PUBLISHED', "updatedAt"=NOW() WHERE id=$1`, [job.assetId]);
        results.push({ id: job.id, status: "PUBLISHED", externalId: published.externalId });
      } catch (error: any) {
        const attempts = job.attemptCount + 1;
        const retry = attempts < 3;
        await query(`UPDATE macula.publication_jobs SET status=$1, "failureReason"=$2, "nextAttemptAt"=$3, "updatedAt"=NOW() WHERE id=$4`, [retry ? "QUEUED" : "FAILED", error.message || "Publishing failed.", retry ? new Date(Date.now() + attempts * 5 * 60 * 1000) : null, job.id]);
        results.push({ id: job.id, status: retry ? "QUEUED" : "FAILED", error: error.message });
      }
    };
    const concurrency = 3;
    for (let index = 0; index < jobs.length; index += concurrency) {
      await Promise.all(jobs.slice(index, index + concurrency).map(processJob));
    }
    return NextResponse.json({ success: true, processed: results.length, results });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to process publishing jobs." }, { status: 500 });
  }
}