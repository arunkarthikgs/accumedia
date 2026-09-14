import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrganizationAccess } from "@/lib/tenant-auth";

const SUPPORTED_PLATFORMS = new Set([
  "linkedin",
  "facebook",
  "instagram",
  "x",
  "youtube",
  "cms",
]);

export async function GET(
  _req: Request,
  props: { params: Promise<{ assetId: string }> }
) {
  try {
    const { assetId } = await props.params;
    const asset = await db.generatedAsset.findUnique({ where: { id: assetId }, include: { case: { select: { organizationId: true } } } });
    if (!asset) return NextResponse.json({ error: "Asset not found." }, { status: 404 });
    await requireOrganizationAccess(asset.case.organizationId);
    const jobs = await db.publicationJob.findMany({
      where: { assetId },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ jobs });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to load publication jobs." }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  props: { params: Promise<{ assetId: string }> }
) {
  try {
    const { assetId } = await props.params;
    const body = await req.json();
    const platform = String(body.platform || "").toLowerCase();
    const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;

    if (!SUPPORTED_PLATFORMS.has(platform)) {
      return NextResponse.json({ error: "Unsupported publishing platform." }, { status: 400 });
    }
    if (scheduledAt && Number.isNaN(scheduledAt.getTime())) {
      return NextResponse.json({ error: "scheduledAt must be a valid date." }, { status: 400 });
    }

    const asset = await db.generatedAsset.findUnique({
      where: { id: assetId },
      include: { case: { select: { id: true, organizationId: true, status: true } } },
    });
    if (!asset) return NextResponse.json({ error: "Asset not found." }, { status: 404 });
    await requireOrganizationAccess(asset.case.organizationId);
    if (asset.status !== "APPROVED" || asset.case.status !== "APPROVED") {
      return NextResponse.json({ error: "Only approved cases and assets can be queued for publishing." }, { status: 409 });
    }

    const existingJob = await db.publicationJob.findFirst({
      where: { assetId, platform, status: { in: ["QUEUED", "PROCESSING", "PUBLISHED"] } },
      orderBy: { createdAt: "desc" },
    });
    if (existingJob) {
      return NextResponse.json({ error: "This asset already has an active or published job for that platform.", job: existingJob }, { status: 409 });
    }

    const job = await db.publicationJob.create({
      data: {
        platform,
        scheduledAt,
        organizationId: asset.case.organizationId,
        caseId: asset.case.id,
        assetId,
      },
    });

    const connection = await db.publicationConnection.findFirst({ where: { organizationId: asset.case.organizationId, platform, isActive: true }, select: { id: true } });

    return NextResponse.json({
      success: true,
      job,
      connectorConfigured: Boolean(connection),
      message: connection ? "Publication queued for the configured connector." : "Publication queued, but no active platform connector is configured.",
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to queue publication." }, { status: 500 });
  }
}
