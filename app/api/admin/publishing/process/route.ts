import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuthenticatedUser, requireOrganizationAccess } from "@/lib/tenant-auth";
import { contentToText, decryptPublishingSecret, publishToConnection } from "@/lib/publishing";
import { refreshOAuthToken } from "@/lib/publishing-oauth";

export async function POST(req: Request) {
  try {
    const cronAuthorized = Boolean(process.env.PUBLISHING_CRON_SECRET && req.headers.get("x-publishing-cron-secret") === process.env.PUBLISHING_CRON_SECRET);
    const user = cronAuthorized ? null : await requireAuthenticatedUser();
    const body = await req.json().catch(() => ({}));
    const organizationId = body.organizationId || user?.organizationId;
    if (!organizationId && !cronAuthorized) return NextResponse.json({ error: "organizationId is required." }, { status: 400 });
    if (organizationId) await requireOrganizationAccess(organizationId);
    const now = new Date();
    const jobs = await db.publicationJob.findMany({
      where: {
        ...(organizationId ? { organizationId } : {}),
        ...(body.jobId ? { id: body.jobId } : {}),
        status: "QUEUED",
        OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }],
        AND: [{ OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] }],
      },
      include: { asset: true, case: { select: { title: true, images: true } } },
      orderBy: { createdAt: "asc" },
      take: body.jobId ? 1 : 25,
    });
    const results = [];
    for (const job of jobs) {
      const connection = await db.publicationConnection.findFirst({ where: { organizationId: job.organizationId, platform: job.platform, isActive: true } });
      if (!connection) {
        await db.publicationJob.update({ where: { id: job.id }, data: { status: "FAILED", failureReason: `No active ${job.platform} connection is configured.` } });
        results.push({ id: job.id, status: "FAILED" });
        continue;
      }
      if (connection.expiresAt && connection.expiresAt <= now && connection.refreshTokenEncrypted && ["linkedin", "x", "youtube"].includes(connection.platform)) {
        try {
          const refreshed = await refreshOAuthToken(connection.platform, decryptPublishingSecret(connection.refreshTokenEncrypted));
          await db.publicationConnection.update({ where: { id: connection.id }, data: refreshed });
          Object.assign(connection, refreshed);
        } catch (error: any) {
          await db.publicationJob.update({ where: { id: job.id }, data: { status: "FAILED", failureReason: `Token refresh failed: ${error.message}` } });
          results.push({ id: job.id, status: "FAILED" });
          continue;
        }
      }
      await db.publicationJob.update({ where: { id: job.id }, data: { status: "PROCESSING", lastAttemptAt: now, attemptCount: { increment: 1 } } });
      try {
        const assetContent = job.asset.content as Record<string, unknown>;
        const matchingImage = job.case.images.find((image) => image.publicUseApproved && image.phiReviewStatus === "CLEAR" && image.storageUrl);
        const mediaUrl = typeof assetContent.videoUrl === "string" ? assetContent.videoUrl : matchingImage?.storageUrl;
        const published = await publishToConnection(connection, { title: job.case.title, text: contentToText(assetContent), asset: assetContent, mediaUrl });
        await db.publicationJob.update({ where: { id: job.id }, data: { status: "PUBLISHED", publishedAt: new Date(), externalId: published.externalId, failureReason: null, nextAttemptAt: null } });
        await db.generatedAsset.update({ where: { id: job.assetId }, data: { status: "PUBLISHED" } });
        results.push({ id: job.id, status: "PUBLISHED", externalId: published.externalId });
      } catch (error: any) {
        const attempts = job.attemptCount + 1;
        const retry = attempts < 3;
        await db.publicationJob.update({ where: { id: job.id }, data: { status: retry ? "QUEUED" : "FAILED", failureReason: error.message || "Publishing failed.", nextAttemptAt: retry ? new Date(Date.now() + attempts * 5 * 60 * 1000) : null } });
        results.push({ id: job.id, status: retry ? "QUEUED" : "FAILED", error: error.message });
      }
    }
    return NextResponse.json({ success: true, processed: results.length, results });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to process publishing jobs." }, { status: 500 });
  }
}