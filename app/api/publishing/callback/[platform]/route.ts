import { NextResponse } from "next/server";
import { encryptedOAuthConnection, exchangeOAuthCode, readOAuthState, type OAuthPlatform } from "@/lib/publishing-oauth";
import { requireOrganizationAccess } from "@/lib/tenant-auth";
import { query } from "@/lib/worker-db";
import crypto from "node:crypto";

export async function GET(req: Request, props: { params: Promise<{ platform: string }> }) {
  const { platform } = await props.params;
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin).replace(/\/$/, "");
  try {
    const url = new URL(req.url);
    const stateCookie = req.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith("macula_oauth_state="))?.split("=").slice(1).join("=");
    const state = readOAuthState(url.searchParams.get("state") || "");
    if (!stateCookie || stateCookie !== url.searchParams.get("state")) throw new Error("OAuth state validation failed.");
    if (state.platform !== platform) throw new Error("OAuth platform mismatch.");
    await requireOrganizationAccess(state.organizationId);
    if (url.searchParams.get("error")) throw new Error(url.searchParams.get("error_description") || url.searchParams.get("error") || "OAuth was denied.");
    const code = url.searchParams.get("code");
    if (!code) throw new Error("OAuth authorization code is missing.");
    const connection = encryptedOAuthConnection(await exchangeOAuthCode(platform as OAuthPlatform, code, state, req));
    await query(`INSERT INTO macula.macula_publication_connections (id, "organizationId", platform, "externalAccountId", "accountLabel", "accessTokenEncrypted", "refreshTokenEncrypted", "expiresAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT ("organizationId", platform, "externalAccountId") DO UPDATE SET "accountLabel"=EXCLUDED."accountLabel", "accessTokenEncrypted"=EXCLUDED."accessTokenEncrypted", "refreshTokenEncrypted"=EXCLUDED."refreshTokenEncrypted", "expiresAt"=EXCLUDED."expiresAt", "isActive"=TRUE, "updatedAt"=NOW()`, [crypto.randomUUID(), connection.organizationId, connection.platform, connection.externalAccountId, connection.accountLabel, connection.accessTokenEncrypted, connection.refreshTokenEncrypted, connection.expiresAt]);
    const response = NextResponse.redirect(`${appUrl}/admin/publishing?connected=${encodeURIComponent(platform)}`);
    response.cookies.delete("macula_oauth_state");
    return response;
  } catch (error: any) {
    return NextResponse.redirect(`${appUrl}/admin/publishing?oauthError=${encodeURIComponent(error.message || "OAuth connection failed.")}`);
  }
}