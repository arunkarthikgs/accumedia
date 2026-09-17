import { NextResponse } from "next/server";
import { generateChannelAsset } from "@/lib/content-engine";
import { requireOrganizationAccess } from "@/lib/tenant-auth";
import { query } from "@/lib/worker-db";
import crypto from "node:crypto";

/**
 * RFP §17 — "Regenerate only one platform output", "Retain version history".
 * Every mutation here snapshots the asset's current content into
 * AssetVersion before changing it, and never touches any other asset for
 * the case.
 */
async function snapshotCurrentVersion(assetId: string, content: any, version: number, changeType: string) {
  await query(`INSERT INTO macula.asset_versions (id, version, content, "changeType", "assetId") VALUES ($1, $2, $3::jsonb, $4, $5)`, [crypto.randomUUID(), version, JSON.stringify(content), changeType, assetId]);
}

export async function PATCH(
  req: Request,
  props: { params: Promise<{ id: string; assetId: string }> }
) {
  try {
    const { id: caseId, assetId } = await props.params;
    const body = await req.json();
    const { action, content, editedBy } = body as {
      action: "manual_edit" | "regenerate" | "approve" | "transform";
      content?: any;
      editedBy?: string;
    };

    const assetResult = await query<any>(`SELECT ga.*, c."organizationId", c."masterRecord", o.name AS organization_name, o."brandingHex" AS branding_hex, o."defaultDisclaimer", o."logoUrl" FROM macula.generated_assets ga JOIN macula.cases c ON c.id = ga."caseId" JOIN macula.organizations o ON o.id = c."organizationId" WHERE ga.id = $1 AND ga."caseId" = $2 LIMIT 1`, [assetId, caseId]);
    const row = assetResult.rows[0];
    const asset = row ? { ...row, case: { organizationId: row.organizationId, masterRecord: row.masterRecord, organization: { name: row.organization_name, brandingHex: row.branding_hex, defaultDisclaimer: row.defaultDisclaimer, logoUrl: row.logoUrl } } } : null;
    if (!asset) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }
    await requireOrganizationAccess(asset.organizationId);

    if (action === "approve") {
      const { rows } = await query(`UPDATE macula.generated_assets SET status = 'APPROVED', "updatedAt" = NOW() WHERE id = $1 RETURNING *`, [assetId]);
      const updated = rows[0];
      return NextResponse.json({ success: true, asset: updated });
    }

    if (action === "manual_edit") {
      if (content === undefined) {
        return NextResponse.json({ error: "content is required for manual_edit" }, { status: 400 });
      }
      await snapshotCurrentVersion(asset.id, asset.content, asset.version, "manual_edit");
      const { rows } = await query(`UPDATE macula.generated_assets SET content = $1::jsonb, version = $2, status = 'DRAFT', "updatedAt" = NOW() WHERE id = $3 RETURNING *`, [JSON.stringify(content), asset.version + 1, assetId]);
      const updated = rows[0];
      return NextResponse.json({ success: true, asset: updated });
    }

    if (action === "regenerate") {
      // Find the ChannelDefinition this asset was generated from so the
      // regeneration uses the same prompt/output-type contract.
      const channel = asset.promptTemplateId
        ? (await query<any>(`SELECT * FROM macula.channel_definitions WHERE id = $1 AND ("organizationId" IS NULL OR "organizationId" = $2) LIMIT 1`, [asset.promptTemplateId, asset.organizationId])).rows[0]
        : null;

      if (!channel) {
        return NextResponse.json(
          { error: "Cannot regenerate — original channel definition not found." },
          { status: 400 }
        );
      }

      await snapshotCurrentVersion(asset.id, asset.content, asset.version, "regenerate");

      const regenerated = await generateChannelAsset({
        caseId: asset.caseId,
        masterRecord: asset.case.masterRecord as Record<string, any>,
        organization: asset.case.organization,
        channel,
        persistAsset: false,
      });

      const { rows } = await query(`UPDATE macula.generated_assets SET content = $1::jsonb, version = $2, status = $3, "validationWarnings" = $4::jsonb, "validationWordCount" = $5, "validationCharacterCount" = $6, "validationDurationSeconds" = $7, "promptTemplateVersion" = $8, "modelUsed" = $9, "updatedAt" = NOW() WHERE id = $10 AND "caseId" = $11 RETURNING *`, [JSON.stringify(regenerated.content), asset.version + 1, regenerated.status, JSON.stringify(regenerated.validationWarnings), regenerated.validationWordCount, regenerated.validationCharacterCount, regenerated.validationDurationSeconds, regenerated.promptTemplateVersion, regenerated.modelUsed, assetId, caseId]);
      const updated = rows[0];

      return NextResponse.json({ success: true, asset: updated });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error: any) {
    console.error("Asset update error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(
  req: Request,
  props: { params: Promise<{ id: string; assetId: string }> }
) {
  try {
    const { id: caseId, assetId } = await props.params;
    const { rows } = await query<any>(`SELECT ga.*, c."organizationId", COALESCE((SELECT json_agg(av ORDER BY av.version DESC) FROM macula.asset_versions av WHERE av."assetId" = ga.id), '[]') AS versions FROM macula.generated_assets ga JOIN macula.cases c ON c.id = ga."caseId" WHERE ga.id = $1 AND ga."caseId" = $2 GROUP BY ga.id, c."organizationId" LIMIT 1`, [assetId, caseId]);
    const asset = rows[0];
    if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    await requireOrganizationAccess(asset.organizationId);
    return NextResponse.json({ asset });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
