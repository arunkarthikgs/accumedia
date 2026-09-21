import { NextResponse } from "next/server";
import { requireAuthenticatedUser, requireOrganizationAccess } from "@/lib/tenant-auth";
import { decryptPublishingSecret, fetchConnectionStats } from "@/lib/publishing";
import { refreshOAuthToken } from "@/lib/publishing-oauth";
import { query } from "@/lib/worker-db";
import crypto from "node:crypto";

export const dynamic = "force-dynamic";

const REFRESH_INTERVAL_MS = 60 * 60 * 1000; // don't re-poll a job's stats more than once an hour

export async function POST(req: Request) {
  try {
    const cronAuthorized = Boolean(process.env.PUBLISHING_CRON_SECRET && req.headers.get("x-publishing-cron-secret") === process.env.PUBLISHING_CRON_SECRET);
    const user = cronAuthorized ? null : await requireAuthenticatedUser();
    const body = await req.json().catch(() => ({}));
    const organizationId = body.organizationId || user?.organizationId;
    if (!organizationId && !cronAuthorized) return NextResponse.json({ error: "organizationId is required." }, { status: 400 });
    if (organizationId) await requireOrganizationAccess(organizationId);

    const now = new Date();
    const cutoff = new Date(now.getTime() - REFRESH_INTERVAL_MS);
    const jobValues: unknown[] = [];
    const jobFilters = [
      `pj.status = 'PUBLISHED'`,
      `pj."externalId" IS NOT NULL`,
      `NOT EXISTS (SELECT 1 FROM macula.publication_stats ps WHERE ps."jobId" = pj.id AND ps."fetchedAt" > $${jobValues.push(cutoff)})`,
    ];
    if (organizationId) jobFilters.push(`pj."organizationId" = $${jobValues.push(organizationId)}`);
    if (body.jobId) jobFilters.push(`pj.id = $${jobValues.push(body.jobId)}`);
    const { rows: jobs } = await query<any>(
      `SELECT pj.* FROM macula.publication_jobs pj WHERE ${jobFilters.join(" AND ")} ORDER BY pj."publishedAt" ASC LIMIT ${body.jobId ? 1 : 50}`,
      jobValues,
    );

    if (!jobs.length) return NextResponse.json({ success: true, processed: 0, results: [] });

    const connectionPairs = [...new Map(jobs.map((job) => [`${job.organizationId}:${job.platform}`, [job.organizationId, job.platform]])).values()];
    const connections = connectionPairs.length
      ? (await query<any>(`SELECT * FROM macula.publication_connections WHERE "isActive" = TRUE AND (${connectionPairs.map((_, index) => `("organizationId" = $${index * 2 + 1} AND platform = $${index * 2 + 2})`).join(" OR ")})`, connectionPairs.flat())).rows
      : [];
    const connectionByPlatform = new Map(connections.map((connection) => [`${connection.organizationId}:${connection.platform}`, connection]));

    const results: Array<Record<string, unknown>> = [];
    const processJob = async (job: (typeof jobs)[number]) => {
      const connection = connectionByPlatform.get(`${job.organizationId}:${job.platform}`);
      if (!connection) {
        results.push({ id: job.id, status: "SKIPPED", reason: "No active connection." });
        return;
      }
      if (connection.expiresAt && new Date(connection.expiresAt) <= now && connection.refreshTokenEncrypted && ["linkedin", "x", "youtube"].includes(connection.platform)) {
        try {
          const refreshed = await refreshOAuthToken(connection.platform, decryptPublishingSecret(connection.refreshTokenEncrypted));
          await query(`UPDATE macula.publication_connections SET "accessTokenEncrypted"=$1, "refreshTokenEncrypted"=$2, "expiresAt"=$3, "updatedAt"=NOW() WHERE id=$4`, [refreshed.accessTokenEncrypted, refreshed.refreshTokenEncrypted, refreshed.expiresAt, connection.id]);
          Object.assign(connection, refreshed);
        } catch (error: any) {
          results.push({ id: job.id, status: "ERROR", reason: `Token refresh failed: ${error.message}` });
          return;
        }
      }
      const stats = await fetchConnectionStats(connection, job.externalId);
      await query(
        `INSERT INTO macula.publication_stats (id, platform, status, impressions, likes, comments, shares, clicks, "videoViews", "errorMessage", raw, "jobId", "organizationId")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [crypto.randomUUID(), job.platform, stats.status, stats.impressions ?? null, stats.likes ?? null, stats.comments ?? null, stats.shares ?? null, stats.clicks ?? null, stats.videoViews ?? null, stats.errorMessage ?? null, stats.raw ? JSON.stringify(stats.raw) : null, job.id, job.organizationId],
      );
      results.push({ id: job.id, status: stats.status, reason: stats.errorMessage });
    };

    const concurrency = 3;
    for (let index = 0; index < jobs.length; index += concurrency) {
      await Promise.all(jobs.slice(index, index + concurrency).map(processJob));
    }

    return NextResponse.json({ success: true, processed: results.length, results });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to poll publishing stats." }, { status: 500 });
  }
}
