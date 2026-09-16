const accountId = (process.env.CLOUDFLARE_ACCOUNT_ID || "").trim();
const accessKeyId = (process.env.R2_ACCESS_KEY_ID || "").trim();
const secretAccessKey = (process.env.R2_SECRET_ACCESS_KEY || "").trim();
const bucketName = (process.env.R2_BUCKET_NAME || "").trim();

if (!accountId) {
  console.error("CRITICAL: CLOUDFLARE_ACCOUNT_ID is not defined in environment variables.");
}

const cleanAccountId = accountId.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
const endpoint = `https://${cleanAccountId}.r2.cloudflarestorage.com`;

/**
 * Generic uploader — both audio and images go through this. `folder` keeps
 * the R2 key namespaced (<orgId>/audio/..., <orgId>/images/...) so listing
 * or lifecycle-ruling one media type doesn't sweep up the other.
 */
async function uploadBufferToR2(
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string,
  orgId: string,
  folder: "audio" | "images" | "sources" | "videos"
) {
  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
    throw new Error(
      "Cloudflare R2 configuration missing. Ensure CLOUDFLARE_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET_NAME are set in .env."
    );
  }

  const timestamp = Date.now();
  const sanitizedName = fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
  const r2Key = `${orgId}/${folder}/${timestamp}-${sanitizedName}`;

  await uploadToR2(r2Key, fileBuffer, mimeType);

  const publicUrlBase = process.env.R2_PUBLIC_URL?.replace(/\/+$/, "");
  const storageUrl = publicUrlBase
    ? `${publicUrlBase}/${r2Key}`
    : `${endpoint}/${bucketName}/${r2Key}`;

  return { r2Key, storageUrl };
}

export async function uploadAudioToR2(
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string,
  orgId: string
) {
  return uploadBufferToR2(fileBuffer, fileName, mimeType, orgId, "audio");
}

export async function getAudioPlaybackUrl(r2Key: string) {
  if (!bucketName || !r2Key) {
    throw new Error("Audio playback configuration is missing.");
  }

  return createR2PresignedGetUrl(r2Key);
}

export async function getImagePreviewUrl(r2Key: string) {
  if (!bucketName || !r2Key) {
    throw new Error("Image preview configuration is missing.");
  }

  return createR2PresignedGetUrl(r2Key);
}

function encodeRfc3986(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

async function hmacSha256(key: string | Uint8Array, value: string) {
  const keyBytes = typeof key === "string" ? new TextEncoder().encode(key) : key;
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return new Uint8Array(
    await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(value))
  );
}

function toHex(value: Uint8Array) {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value: string) {
  return toHex(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
    )
  );
}

async function sha256HexBytes(value: Uint8Array) {
  return toHex(
    new Uint8Array(await crypto.subtle.digest("SHA-256", value as BufferSource))
  );
}

async function uploadToR2(r2Key: string, fileBuffer: Uint8Array, mimeType: string) {
  const region = "auto";
  const service = "s3";
  const host = `${cleanAccountId}.r2.cloudflarestorage.com`;
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const payloadHash = await sha256HexBytes(fileBuffer);
  const canonicalUri = `/${encodeRfc3986(bucketName)}/${r2Key
    .split("/")
    .map(encodeRfc3986)
    .join("/")}`;
  const canonicalHeaders = `content-type:${mimeType}\nhost:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = [
    "PUT",
    canonicalUri,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join("\n");
  const dateKey = await hmacSha256(`AWS4${secretAccessKey}`, dateStamp);
  const regionKey = await hmacSha256(dateKey, region);
  const serviceKey = await hmacSha256(regionKey, service);
  const signingKey = await hmacSha256(serviceKey, "aws4_request");
  const signature = toHex(await hmacSha256(signingKey, stringToSign));
  const response = await fetch(`${endpoint}${canonicalUri}`, {
    method: "PUT",
    headers: {
      Authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      "Content-Type": mimeType,
      "X-Amz-Content-Sha256": payloadHash,
      "X-Amz-Date": amzDate,
    },
    body: fileBuffer as BodyInit,
  });
  if (!response.ok) {
    throw new Error(`R2 upload failed (${response.status}): ${(await response.text()).slice(0, 240)}`);
  }
}

async function createR2PresignedGetUrl(r2Key: string) {
  const region = "auto";
  const service = "s3";
  const host = `${cleanAccountId}.r2.cloudflarestorage.com`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const canonicalUri = `/${encodeRfc3986(bucketName)}/${r2Key
    .split("/")
    .map(encodeRfc3986)
    .join("/")}`;
  const queryParameters = [
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", `${accessKeyId}/${credentialScope}`],
    ["X-Amz-Date", amzDate],
    ["X-Amz-Expires", "900"],
    ["X-Amz-SignedHeaders", "host"],
  ].sort(([left], [right]) => left.localeCompare(right));
  const canonicalQueryString = queryParameters
    .map(([key, value]) => `${encodeRfc3986(key)}=${encodeRfc3986(value)}`)
    .join("&");
  const canonicalHeaders = `host:${host}\n`;
  const canonicalRequest = [
    "GET",
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join("\n");
  const dateKey = await hmacSha256(`AWS4${secretAccessKey}`, dateStamp);
  const regionKey = await hmacSha256(dateKey, region);
  const serviceKey = await hmacSha256(regionKey, service);
  const signingKey = await hmacSha256(serviceKey, "aws4_request");
  const signature = toHex(await hmacSha256(signingKey, stringToSign));

  return `${endpoint}/${encodeRfc3986(bucketName)}/${r2Key
    .split("/")
    .map(encodeRfc3986)
    .join("/")}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
}

// RFP §14-15 — same storage path as audio, namespaced under <orgId>/images/.
// Used for both AI-generated images (lib/image-engine.ts) and doctor-uploaded
// clinical images (app/api/cases/[id]/images/upload/route.ts).
export async function uploadImageToR2(
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string,
  orgId: string
) {
  return uploadBufferToR2(fileBuffer, fileName, mimeType, orgId, "images");
}

export async function uploadSourceToR2(
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string,
  orgId: string
) {
  return uploadBufferToR2(fileBuffer, fileName, mimeType, orgId, "sources");
}

export async function uploadVideoToR2(fileBuffer: Buffer, fileName: string, mimeType: string, orgId: string) {
  return uploadBufferToR2(fileBuffer, fileName, mimeType, orgId, "videos");
}
