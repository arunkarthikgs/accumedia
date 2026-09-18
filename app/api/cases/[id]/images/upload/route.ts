import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { getResolvedAiPrompts } from "@/lib/ai-prompts";
import { DEFAULT_IMAGE_SAFETY_PROMPT } from "@/lib/image-prompts";
import { screenUploadedImage } from "@/lib/image-render-service";
import { uploadImageToR2 } from "@/lib/r2";
import { recordAudit } from "@/lib/audit";
import { requireOrganizationAccess } from "@/lib/tenant-auth";
import { query } from "@/lib/worker-db";

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const { id: caseId } = await props.params;
    const kase = (await query<any>(`SELECT c.id, c."organizationId" FROM macula.cases c WHERE c.id = $1 LIMIT 1`, [caseId])).rows[0];
    if (!kase) return NextResponse.json({ error: "Case not found." }, { status: 404 });
    await requireOrganizationAccess(kase.organizationId);

    const form = await req.formData();
    const file = form.get("image");
    const channel = String(form.get("channel") || "");
    const consentConfirmed = form.get("consentConfirmed") === "true";
    const publicUseApproved = form.get("publicUseApproved") === "true";
    if (!(file instanceof File)) return NextResponse.json({ error: "image file is required." }, { status: 400 });
    if (!IMAGE_TYPES.has(file.type)) return NextResponse.json({ error: "Only JPEG, PNG, and WebP images are supported." }, { status: 400 });
    if (file.size > MAX_IMAGE_BYTES) return NextResponse.json({ error: "Image must be 12 MB or smaller." }, { status: 413 });
    if (!channel) return NextResponse.json({ error: "channel is required." }, { status: 400 });
    if (!consentConfirmed) return NextResponse.json({ error: "Confirm that patient-identifying information has been removed and required consent exists." }, { status: 400 });
    if (publicUseApproved) return NextResponse.json({ error: "Uploaded images begin unapproved. Complete PHI review before public approval." }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const prompts = await getResolvedAiPrompts(kase.organizationId, ["IMAGE_SAFETY"]);
    const safetyPrompt = prompts.get("IMAGE_SAFETY")?.content || DEFAULT_IMAGE_SAFETY_PROMPT;
    const screening = await screenUploadedImage({ buffer, mimeType: file.type, safetyPrompt });
    const findings = Array.isArray(screening.findings) ? screening.findings : [];
    const phiStatus = findings.length || screening.faceDetected ? "FLAGGED" : "CLEAR";
    const uploaded = await uploadImageToR2(buffer, file.name || "clinical-image", file.type, kase.organizationId);
    const imageId = crypto.randomUUID();
    const { rows } = await query(`INSERT INTO macula.image_assets (id, channel, "sourceType", "r2Key", "storageUrl", "publicUseApproved", "consentConfirmed", "phiReviewStatus", "safetyFindings", "faceDetected", "screenedAt", "caseId") VALUES ($1,$2,'doctor_uploaded',$3,$4,FALSE,$5,$6,$7::jsonb,$8,NOW(),$9) RETURNING *`, [imageId, channel, uploaded.r2Key, uploaded.storageUrl, consentConfirmed, phiStatus, JSON.stringify({ findings, regions: findings.filter((finding) => finding.region).map((finding) => finding.region), screening: "external-image-processor" }), Boolean(screening.faceDetected), caseId]);
    if (findings.length || screening.faceDetected) await query(`INSERT INTO macula.safety_flags (id, "targetType", detail, "flagType", confidence, status, "caseId", "imageAssetId") VALUES ($1,'IMAGE_ASSET',$2,$3,'high','OPEN',$4,$5)`, [crypto.randomUUID(), `Uploaded image screening found ${findings.length} finding(s)${screening.faceDetected ? " and detected a face" : ""}.`, screening.faceDetected ? "face" : "phi", caseId, imageId]);
    await recordAudit({ organizationId: kase.organizationId, caseId, targetType: "IMAGE_ASSET", targetId: imageId, action: "IMAGE_UPLOADED_AND_SCREENED", detail: phiStatus === "CLEAR" ? "Uploaded image screened with no detected findings." : "Uploaded image quarantined for safety review.", metadata: { channel, consentConfirmed, phiStatus } });
    return NextResponse.json({ success: true, image: rows[0] }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Image upload failed." }, { status: 500 });
  }
}
