import { NextResponse } from "next/server";
import { db } from "@/lib/db";

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
    if (asset.status !== "APPROVED" || asset.case.status !== "APPROVED") {
      return NextResponse.json({ error: "Only approved cases and assets can be queued for publishing." }, { status: 409 });
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

    return NextResponse.json({
      success: true,
      job,
      connectorConfigured: false,
      message: "Publication queued. A platform OAuth connector is required to publish it.",
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to queue publication." }, { status: 500 });
  }
}
