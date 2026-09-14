import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrganizationAccess } from "@/lib/tenant-auth";
import { encryptPublishingSecret } from "@/lib/publishing";

const PLATFORMS = new Set(["linkedin", "facebook", "instagram", "x", "youtube", "cms"]);

function publicConnection(connection: any) {
  return {
    id: connection.id,
    platform: connection.platform,
    accountLabel: connection.accountLabel,
    externalAccountId: connection.externalAccountId,
    expiresAt: connection.expiresAt,
    isActive: connection.isActive,
    hasAccessToken: Boolean(connection.accessTokenEncrypted),
    hasWebhookUrl: Boolean(connection.webhookUrlEncrypted),
  };
}

export async function GET(req: Request) {
  try {
    const orgId = new URL(req.url).searchParams.get("orgId");
    if (!orgId) return NextResponse.json({ error: "orgId is required." }, { status: 400 });
    await requireOrganizationAccess(orgId);
    const connections = await db.publicationConnection.findMany({ where: { organizationId: orgId }, orderBy: { platform: "asc" } });
    return NextResponse.json({ connections: connections.map(publicConnection) });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to load publishing connections." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const organizationId = String(body.organizationId || "");
    const platform = String(body.platform || "").toLowerCase();
    if (!organizationId || !PLATFORMS.has(platform)) return NextResponse.json({ error: "organizationId and a supported platform are required." }, { status: 400 });
    await requireOrganizationAccess(organizationId);
    if (!body.accessToken && !body.webhookUrl) return NextResponse.json({ error: "accessToken or webhookUrl is required." }, { status: 400 });

    const connection = await db.publicationConnection.upsert({
      where: { organizationId_platform_externalAccountId: { organizationId, platform, externalAccountId: body.externalAccountId || null } },
      create: {
        organizationId,
        platform,
        accountLabel: body.accountLabel || null,
        externalAccountId: body.externalAccountId || null,
        accessTokenEncrypted: body.accessToken ? encryptPublishingSecret(String(body.accessToken)) : null,
        refreshTokenEncrypted: body.refreshToken ? encryptPublishingSecret(String(body.refreshToken)) : null,
        webhookUrlEncrypted: body.webhookUrl ? encryptPublishingSecret(String(body.webhookUrl)) : null,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      },
      update: {
        accountLabel: body.accountLabel || null,
        accessTokenEncrypted: body.accessToken ? encryptPublishingSecret(String(body.accessToken)) : undefined,
        refreshTokenEncrypted: body.refreshToken ? encryptPublishingSecret(String(body.refreshToken)) : undefined,
        webhookUrlEncrypted: body.webhookUrl ? encryptPublishingSecret(String(body.webhookUrl)) : undefined,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
        isActive: true,
      },
    });
    return NextResponse.json({ success: true, connection: publicConnection(connection) });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to save publishing connection." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { connectionId } = await req.json();
    const connection = await db.publicationConnection.findUnique({ where: { id: connectionId } });
    if (!connection) return NextResponse.json({ error: "Connection not found." }, { status: 404 });
    await requireOrganizationAccess(connection.organizationId);
    const updated = await db.publicationConnection.update({ where: { id: connectionId }, data: { isActive: false, accessTokenEncrypted: null, refreshTokenEncrypted: null, webhookUrlEncrypted: null } });
    return NextResponse.json({ success: true, connection: publicConnection(updated) });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to revoke publishing connection." }, { status: 500 });
  }
}