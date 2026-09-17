import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/tenant-auth";
import { query } from "@/lib/worker-db";
import crypto from "node:crypto";

export const dynamic = "force-dynamic";
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
    const { rows: connections } = await query(`SELECT * FROM macula.publication_connections WHERE "organizationId" = $1 ORDER BY platform ASC`, [orgId]);
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

    const externalAccountId = body.externalAccountId || null;
    const { rows } = await query(`INSERT INTO macula.publication_connections (id, platform, "accountLabel", "externalAccountId", "accessTokenEncrypted", "refreshTokenEncrypted", "webhookUrlEncrypted", "expiresAt", "organizationId") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT ("organizationId", platform, "externalAccountId") DO UPDATE SET "accountLabel" = EXCLUDED."accountLabel", "accessTokenEncrypted" = COALESCE(EXCLUDED."accessTokenEncrypted", macula.publication_connections."accessTokenEncrypted"), "refreshTokenEncrypted" = COALESCE(EXCLUDED."refreshTokenEncrypted", macula.publication_connections."refreshTokenEncrypted"), "webhookUrlEncrypted" = COALESCE(EXCLUDED."webhookUrlEncrypted", macula.publication_connections."webhookUrlEncrypted"), "expiresAt" = COALESCE(EXCLUDED."expiresAt", macula.publication_connections."expiresAt"), "isActive" = TRUE, "updatedAt" = NOW() RETURNING *`, [crypto.randomUUID(), platform, body.accountLabel || null, externalAccountId, body.accessToken ? encryptPublishingSecret(String(body.accessToken)) : null, body.refreshToken ? encryptPublishingSecret(String(body.refreshToken)) : null, body.webhookUrl ? encryptPublishingSecret(String(body.webhookUrl)) : null, body.expiresAt ? new Date(body.expiresAt) : null, organizationId]);
    const connection = rows[0];
    return NextResponse.json({ success: true, connection: publicConnection(connection) });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to save publishing connection." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { connectionId } = await req.json();
    const connection = (await query<any>(`SELECT * FROM macula.publication_connections WHERE id = $1 LIMIT 1`, [connectionId])).rows[0];
    if (!connection) return NextResponse.json({ error: "Connection not found." }, { status: 404 });
    await requireOrganizationAccess(connection.organizationId);
    const { rows } = await query(`UPDATE macula.publication_connections SET "isActive" = FALSE, "accessTokenEncrypted" = NULL, "refreshTokenEncrypted" = NULL, "webhookUrlEncrypted" = NULL, "updatedAt" = NOW() WHERE id = $1 RETURNING *`, [connectionId]);
    const updated = rows[0];
    return NextResponse.json({ success: true, connection: publicConnection(updated) });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to revoke publishing connection." }, { status: 500 });
  }
}