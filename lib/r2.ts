import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const accountId = (process.env.CLOUDFLARE_ACCOUNT_ID || "").trim();
const accessKeyId = (process.env.R2_ACCESS_KEY_ID || "").trim();
const secretAccessKey = (process.env.R2_SECRET_ACCESS_KEY || "").trim();
const bucketName = (process.env.R2_BUCKET_NAME || "").trim();

if (!accountId) {
  console.error("CRITICAL: CLOUDFLARE_ACCOUNT_ID is not defined in environment variables.");
}

const cleanAccountId = accountId.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
const endpoint = `https://${cleanAccountId}.r2.cloudflarestorage.com`;

export const r2Client = new S3Client({
  region: "auto",
  endpoint,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
  forcePathStyle: true,
});

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

  await r2Client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: r2Key,
      Body: fileBuffer,
      ContentType: mimeType,
    })
  );

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

  return getSignedUrl(
    r2Client,
    new GetObjectCommand({ Bucket: bucketName, Key: r2Key }),
    { expiresIn: 900 }
  );
}

export async function getImagePreviewUrl(r2Key: string) {
  if (!bucketName || !r2Key) {
    throw new Error("Image preview configuration is missing.");
  }

  return getSignedUrl(
    r2Client,
    new GetObjectCommand({ Bucket: bucketName, Key: r2Key }),
    { expiresIn: 900 }
  );
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
