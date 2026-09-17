import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/tenant-auth";
import { query } from "@/lib/worker-db";
import crypto from "node:crypto";

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
    const asset = (await query<any>(`SELECT ga.id, ga."status", ga."caseId", c."organizationId", c.status AS case_status FROM macula.generated_assets ga JOIN macula.cases c ON c.id=ga."caseId" WHERE ga.id=$1 LIMIT 1`, [assetId])).rows[0];
    if (!asset) return NextResponse.json({ error: "Asset not found." }, { status: 404 });
    await requireOrganizationAccess(asset.case.organizationId);
    const { rows: jobs } = await query(`SELECT * FROM macula.publication_jobs WHERE "assetId"=$1 ORDER BY "createdAt" DESC`, [assetId]);
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

    const asset = (await query<any>(`SELECT ga.id, ga."status", ga."caseId", c.id AS case_id, c."organizationId", c.status AS case_status FROM macula.generated_assets ga JOIN macula.cases c ON c.id=ga."caseId" WHERE ga.id=$1 LIMIT 1`, [assetId])).rows[0];
    if (!asset) return NextResponse.json({ error: "Asset not found." }, { status: 404 });
    await requireOrganizationAccess(asset.case.organizationId);
    if (asset.status !== "APPROVED" || asset.case_status !== "APPROVED") {
      return NextResponse.json({ error: "Only approved cases and assets can be queued for publishing." }, { status: 409 });
    }

    const existingJob = (await query(`SELECT * FROM macula.publication_jobs WHERE "assetId"=$1 AND platform=$2 AND status IN ('QUEUED','PROCESSING','PUBLISHED') ORDER BY "createdAt" DESC LIMIT 1`, [assetId, platform])).rows[0];
    if (existingJob) {
      return NextResponse.json({ error: "This asset already has an active or published job for that platform.", job: existingJob }, { status: 409 });
    }

    const { rows: jobRows } = await query(`INSERT INTO macula.publication_jobs (id, platform, "scheduledAt", "organizationId", "caseId", "assetId") VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [crypto.randomUUID(), platform, scheduledAt, asset.organizationId, asset.case_id, assetId]);
    const job = jobRows[0];

    const connection = (await query(`SELECT id FROM macula.publication_connections WHERE "organizationId"=$1 AND platform=$2 AND "isActive"=TRUE LIMIT 1`, [asset.organizationId, platform])).rows[0];

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
