import crypto from "node:crypto";
import { encryptPublishingSecret } from "@/lib/publishing";

export type OAuthPlatform = "linkedin" | "facebook" | "instagram" | "x" | "youtube";

type OAuthState = { platform: OAuthPlatform; organizationId: string; nonce: string; verifier?: string; exp: number };

function signingKey() {
  return process.env.AUTH_SECRET || process.env.ENCRYPTION_KEY || "macula-development-key";
}

function encode(value: string) { return Buffer.from(value).toString("base64url"); }
function decode(value: string) { return Buffer.from(value, "base64url").toString("utf8"); }

export function createOAuthState(input: Omit<OAuthState, "nonce" | "exp">) {
  const payload = encode(JSON.stringify({ ...input, nonce: crypto.randomBytes(16).toString("hex"), exp: Date.now() + 10 * 60 * 1000 }));
  const signature = crypto.createHmac("sha256", signingKey()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function readOAuthState(value: string): OAuthState {
  const [payload, signature] = value.split(".");
  const expected = crypto.createHmac("sha256", signingKey()).update(payload).digest("base64url");
  if (!payload || !signature || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new Error("Invalid OAuth state.");
  const state = JSON.parse(decode(payload)) as OAuthState;
  if (state.exp < Date.now()) throw new Error("OAuth state expired.");
  return state;
}

function appUrl(req: Request) {
  return (process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin).replace(/\/$/, "");
}

export function getOAuthAuthorizationUrl(platform: OAuthPlatform, organizationId: string, req: Request) {
  const redirectUri = `${appUrl(req)}/api/publishing/callback/${platform}`;
  const clientId = platform === "linkedin" ? process.env.LINKEDIN_CLIENT_ID : platform === "facebook" || platform === "instagram" ? process.env.META_CLIENT_ID : platform === "x" ? process.env.X_CLIENT_ID : process.env.YOUTUBE_CLIENT_ID;
  if (!clientId) throw new Error(`${platform} OAuth client ID is not configured.`);
  const base = platform === "linkedin" ? "https://www.linkedin.com/oauth/v2/authorization" : platform === "facebook" || platform === "instagram" ? "https://www.facebook.com/v20.0/dialog/oauth" : platform === "x" ? "https://twitter.com/i/oauth2/authorize" : "https://accounts.google.com/o/oauth2/v2/auth";
  const stateInput: Omit<OAuthState, "nonce" | "exp"> = { platform, organizationId };
  const params = new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: redirectUri, state: "" });
  if (platform === "linkedin") params.set("scope", "openid profile w_member_social");
  if (platform === "facebook" || platform === "instagram") params.set("scope", "pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish");
  if (platform === "youtube") { params.set("scope", "https://www.googleapis.com/auth/youtube.upload"); params.set("access_type", "offline"); params.set("prompt", "consent"); }
  if (platform === "x") {
    const verifier = encode(crypto.randomBytes(32).toString("hex"));
    const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
    stateInput.verifier = verifier;
    params.set("code_challenge", challenge);
    params.set("code_challenge_method", "S256");
    params.set("scope", "tweet.read tweet.write users.read offline.access");
  }
  const state = createOAuthState(stateInput);
  params.set("state", state);
  return { url: `${base}?${params.toString()}`, state, redirectUri };
}

async function parseResponse(response: Response, provider: string) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${provider} OAuth failed (${response.status}): ${JSON.stringify(data).slice(0, 500)}`);
  return data as Record<string, any>;
}

export async function exchangeOAuthCode(platform: OAuthPlatform, code: string, state: OAuthState, req: Request) {
  const redirectUri = `${appUrl(req)}/api/publishing/callback/${platform}`;
  const clientId = platform === "linkedin" ? process.env.LINKEDIN_CLIENT_ID : platform === "facebook" || platform === "instagram" ? process.env.META_CLIENT_ID : platform === "x" ? process.env.X_CLIENT_ID : process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = platform === "linkedin" ? process.env.LINKEDIN_CLIENT_SECRET : platform === "facebook" || platform === "instagram" ? process.env.META_CLIENT_SECRET : platform === "x" ? process.env.X_CLIENT_SECRET : process.env.YOUTUBE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error(`${platform} OAuth client credentials are not configured.`);
  let token: Record<string, any>;
  if (platform === "linkedin") {
    token = await parseResponse(await fetch("https://www.linkedin.com/oauth/v2/accessToken", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri, client_id: clientId, client_secret: clientSecret }) }), "LinkedIn");
  } else if (platform === "facebook" || platform === "instagram") {
    token = await parseResponse(await fetch("https://graph.facebook.com/v20.0/oauth/access_token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, code }) }), "Meta");
  } else if (platform === "x") {
    token = await parseResponse(await fetch("https://api.x.com/2/oauth2/token", { method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, grant_type: "authorization_code", redirect_uri: redirectUri, code_verifier: state.verifier || "" }) }), "X");
  } else {
    token = await parseResponse(await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }) }), "YouTube");
  }

  const accessToken = token.access_token as string;
  let externalAccountId: string | null = null;
  let accountLabel: string | null = null;
  if (platform === "linkedin") {
    const profile = await parseResponse(await fetch("https://api.linkedin.com/v2/userinfo", { headers: { Authorization: `Bearer ${accessToken}` } }), "LinkedIn");
    externalAccountId = profile.sub;
    accountLabel = profile.name || profile.email;
  } else if (platform === "facebook" || platform === "instagram") {
    const pages = await parseResponse(await fetch(`https://graph.facebook.com/v20.0/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${encodeURIComponent(accessToken)}`), "Meta");
    const page = pages.data?.[0];
    if (!page) throw new Error("No Facebook Page was available for this account.");
    externalAccountId = platform === "instagram" ? page.instagram_business_account?.id || null : page.id;
    if (!externalAccountId) throw new Error("No Instagram business account is connected to the selected Facebook Page.");
    accountLabel = page.name;
    token.access_token = page.access_token || accessToken;
  } else if (platform === "x") {
    const profile = await parseResponse(await fetch("https://api.x.com/2/users/me", { headers: { Authorization: `Bearer ${accessToken}` } }), "X");
    externalAccountId = profile.data?.id;
    accountLabel = profile.data?.name || profile.data?.username;
  } else {
    const channel = await parseResponse(await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", { headers: { Authorization: `Bearer ${accessToken}` } }), "YouTube");
    externalAccountId = channel.items?.[0]?.id || null;
    accountLabel = channel.items?.[0]?.snippet?.title || null;
  }
  return { organizationId: state.organizationId, platform, externalAccountId, accountLabel, accessToken: token.access_token, refreshToken: token.refresh_token, expiresAt: token.expires_in ? new Date(Date.now() + Number(token.expires_in) * 1000) : null };
}

export async function refreshOAuthToken(platform: string, refreshToken: string) {
  const clientId = platform === "linkedin" ? process.env.LINKEDIN_CLIENT_ID : platform === "x" ? process.env.X_CLIENT_ID : process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = platform === "linkedin" ? process.env.LINKEDIN_CLIENT_SECRET : platform === "x" ? process.env.X_CLIENT_SECRET : process.env.YOUTUBE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error(`${platform} OAuth client credentials are not configured for token refresh.`);
  const endpoint = platform === "linkedin" ? "https://www.linkedin.com/oauth/v2/accessToken" : platform === "x" ? "https://api.x.com/2/oauth2/token" : "https://oauth2.googleapis.com/token";
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
  if (platform === "x") headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
  const data = await parseResponse(await fetch(endpoint, { method: "POST", headers, body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret }) }), platform);
  return { accessTokenEncrypted: encryptPublishingSecret(data.access_token), refreshTokenEncrypted: data.refresh_token ? encryptPublishingSecret(data.refresh_token) : undefined, expiresAt: data.expires_in ? new Date(Date.now() + Number(data.expires_in) * 1000) : undefined };
}

export function encryptedOAuthConnection(input: Awaited<ReturnType<typeof exchangeOAuthCode>>) {
  return { ...input, accessTokenEncrypted: encryptPublishingSecret(input.accessToken), refreshTokenEncrypted: input.refreshToken ? encryptPublishingSecret(input.refreshToken) : null };
}