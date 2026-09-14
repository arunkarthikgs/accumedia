import crypto from "node:crypto";

export type PublicationConnectionData = {
  platform: string;
  externalAccountId: string | null;
  accessTokenEncrypted: string | null;
  refreshTokenEncrypted: string | null;
  webhookUrlEncrypted: string | null;
  expiresAt?: Date | null;
};

export type PublicationPayload = {
  title: string;
  text: string;
  asset: Record<string, unknown>;
  mediaUrl?: string | null;
};

const key = () => crypto.createHash("sha256").update(process.env.AUTH_SECRET || process.env.ENCRYPTION_KEY || "macula-development-key").digest();

export function encryptPublishingSecret(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptPublishingSecret(value: string) {
  const [ivText, tagText, encryptedText] = value.split(".");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedText, "base64url")), decipher.final()]).toString("utf8");
}

export function contentToText(content: unknown) {
  if (typeof content === "string") return content;
  if (!content || typeof content !== "object") return "";
  const record = content as Record<string, unknown>;
  return Object.entries(record)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([name, value]) => `${name}: ${typeof value === "string" ? value : JSON.stringify(value)}`)
    .join("\n");
}

async function assertResponse(response: Response, provider: string) {
  if (response.ok) return;
  const detail = await response.text();
  throw new Error(`${provider} publishing failed (${response.status}): ${detail.slice(0, 500)}`);
}

export async function publishToConnection(connection: PublicationConnectionData, payload: PublicationPayload) {
  const platform = connection.platform.toLowerCase();
  const accessToken = connection.accessTokenEncrypted ? decryptPublishingSecret(connection.accessTokenEncrypted) : "";
  const text = payload.text.slice(0, platform === "x" ? 280 : 10000);

  if (platform === "cms") {
    const webhook = connection.webhookUrlEncrypted ? decryptPublishingSecret(connection.webhookUrlEncrypted) : "";
    if (!webhook) throw new Error("CMS webhook URL is not configured.");
    const response = await fetch(webhook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    await assertResponse(response, "CMS");
    return { externalId: response.headers.get("x-publication-id") || `cms-${Date.now()}` };
  }

  if (!accessToken) throw new Error(`${platform} access token is not configured.`);
  if (platform === "linkedin") {
    if (!connection.externalAccountId) throw new Error("LinkedIn author account ID is not configured.");
    const response = await fetch("https://api.linkedin.com/rest/posts", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", "X-Restli-Protocol-Version": "2.0.0", "LinkedIn-Version": "202401" },
      body: JSON.stringify({ author: `urn:li:person:${connection.externalAccountId}`, commentary: text, visibility: "PUBLIC", distribution: { feedDistribution: "MAIN_FEED" }, lifecycleState: "PUBLISHED" }),
    });
    await assertResponse(response, "LinkedIn");
    return { externalId: response.headers.get("x-restli-id") || `linkedin-${Date.now()}` };
  }

  if (platform === "facebook") {
    if (!connection.externalAccountId) throw new Error("Facebook Page ID is not configured.");
    const response = await fetch(`https://graph.facebook.com/v20.0/${connection.externalAccountId}/feed`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: text, access_token: accessToken }) });
    await assertResponse(response, "Facebook");
    const data = await response.json() as { id?: string };
    return { externalId: data.id || `facebook-${Date.now()}` };
  }

  if (platform === "instagram") {
    if (!connection.externalAccountId || !payload.mediaUrl) throw new Error("Instagram publishing requires an approved image or video media URL and business account.");
    const container = await parseJsonResponse(await fetch(`https://graph.facebook.com/v20.0/${connection.externalAccountId}/media`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image_url: payload.mediaUrl, caption: text, access_token: accessToken }) }), "Instagram");
    const published = await parseJsonResponse(await fetch(`https://graph.facebook.com/v20.0/${connection.externalAccountId}/media_publish`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ creation_id: container.id, access_token: accessToken }) }), "Instagram");
    return { externalId: published.id || `instagram-${Date.now()}` };
  }

  if (platform === "x") {
    const response = await fetch("https://api.x.com/2/tweets", { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
    await assertResponse(response, "X");
    const data = await response.json() as { data?: { id?: string } };
    return { externalId: data.data?.id || `x-${Date.now()}` };
  }

  if (platform === "youtube") {
    if (!payload.mediaUrl) throw new Error("YouTube publishing requires an approved rendered video media URL.");
    const media = await fetch(payload.mediaUrl);
    if (!media.ok) throw new Error(`Unable to download the approved YouTube video (${media.status}).`);
    const metadata = { snippet: { title: payload.title.slice(0, 100), description: text.slice(0, 5000) }, status: { privacyStatus: "private" } };
    const upload = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status&uploadType=resumable", { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": media.headers.get("content-type") || "video/mp4" }, body: JSON.stringify(metadata) });
    await assertResponse(upload, "YouTube");
    const uploadUrl = upload.headers.get("location");
    if (!uploadUrl) throw new Error("YouTube did not return an upload URL.");
    const completed = await fetch(uploadUrl, { method: "PUT", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": media.headers.get("content-type") || "video/mp4" }, body: await media.arrayBuffer() });
    const data = await parseJsonResponse(completed, "YouTube");
    return { externalId: data.id || `youtube-${Date.now()}` };
  }

  throw new Error(`No connector is registered for ${platform}.`);
}

async function parseJsonResponse(response: Response, provider: string) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${provider} publishing failed (${response.status}): ${JSON.stringify(data).slice(0, 500)}`);
  return data as Record<string, any>;
}