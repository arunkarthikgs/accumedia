import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { encryptedOAuthConnection, exchangeOAuthCode, readOAuthState, type OAuthPlatform } from "@/lib/publishing-oauth";

export async function GET(req: Request, props: { params: Promise<{ platform: string }> }) {
  const { platform } = await props.params;
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin).replace(/\/$/, "");
  try {
    const url = new URL(req.url);
    const stateCookie = req.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith("macula_oauth_state="))?.split("=").slice(1).join("=");
    const state = readOAuthState(url.searchParams.get("state") || "");
    if (!stateCookie || stateCookie !== url.searchParams.get("state")) throw new Error("OAuth state validation failed.");
    if (state.platform !== platform) throw new Error("OAuth platform mismatch.");
    if (url.searchParams.get("error")) throw new Error(url.searchParams.get("error_description") || url.searchParams.get("error") || "OAuth was denied.");
    const code = url.searchParams.get("code");
    if (!code) throw new Error("OAuth authorization code is missing.");
    const connection = encryptedOAuthConnection(await exchangeOAuthCode(platform as OAuthPlatform, code, state, req));
    await db.publicationConnection.upsert({
      where: { organizationId_platform_externalAccountId: { organizationId: connection.organizationId, platform: connection.platform, externalAccountId: connection.externalAccountId } },
      create: { organizationId: connection.organizationId, platform: connection.platform, externalAccountId: connection.externalAccountId, accountLabel: connection.accountLabel, accessTokenEncrypted: connection.accessTokenEncrypted, refreshTokenEncrypted: connection.refreshTokenEncrypted, expiresAt: connection.expiresAt },
      update: { accountLabel: connection.accountLabel, accessTokenEncrypted: connection.accessTokenEncrypted, refreshTokenEncrypted: connection.refreshTokenEncrypted, expiresAt: connection.expiresAt, isActive: true },
    });
    const response = NextResponse.redirect(`${appUrl}/admin/publishing?connected=${encodeURIComponent(platform)}`);
    response.cookies.delete("macula_oauth_state");
    return response;
  } catch (error: any) {
    return NextResponse.redirect(`${appUrl}/admin/publishing?oauthError=${encodeURIComponent(error.message || "OAuth connection failed.")}`);
  }
}