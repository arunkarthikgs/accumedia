import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/tenant-auth";
import { createOAuthState, getOAuthAuthorizationUrl, type OAuthPlatform } from "@/lib/publishing-oauth";

const PLATFORMS = new Set(["linkedin", "facebook", "instagram", "x", "youtube"]);

export async function GET(req: Request, props: { params: Promise<{ platform: string }> }) {
  try {
    const { platform } = await props.params;
    const organizationId = new URL(req.url).searchParams.get("orgId");
    if (!organizationId || !PLATFORMS.has(platform)) return NextResponse.json({ error: "A supported platform and organization are required." }, { status: 400 });
    await requireOrganizationAccess(organizationId);
    const authorization = getOAuthAuthorizationUrl(platform as OAuthPlatform, organizationId, req);
    const response = NextResponse.redirect(authorization.url);
    response.cookies.set("macula_oauth_state", authorization.state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600 });
    return response;
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Unable to start OAuth connection." }, { status: 500 });
  }
}