import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateChannelAsset } from "@/lib/content-engine";

/**
 * RFP §17 — "Regenerate only one platform output", "Retain version history".
 * Every mutation here snapshots the asset's current content into
 * AssetVersion before changing it, and never touches any other asset for
 * the case.
 */
async function snapshotCurrentVersion(assetId: string, content: any, version: number, changeType: string) {
  await db.assetVersion.create({
    data: { assetId, content, version, changeType },
  });
}

export async function PATCH(
  req: Request,
  props: { params: Promise<{ id: string; assetId: string }> }
) {
  try {
    const { assetId } = await props.params;
    const body = await req.json();
    const { action, content, editedBy } = body as {
      action: "manual_edit" | "regenerate" | "approve" | "transform";
      content?: any;
      editedBy?: string;
    };

    const asset = await db.generatedAsset.findUnique({
      where: { id: assetId },
      include: { case: { include: { organization: true } } },
    });
    if (!asset) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    if (action === "approve") {
      const updated = await db.generatedAsset.update({
        where: { id: assetId },
        data: { status: "APPROVED" },
      });
      return NextResponse.json({ success: true, asset: updated });
    }

    if (action === "manual_edit") {
      if (content === undefined) {
        return NextResponse.json({ error: "content is required for manual_edit" }, { status: 400 });
      }
      await snapshotCurrentVersion(asset.id, asset.content, asset.version, "manual_edit");
      const updated = await db.generatedAsset.update({
        where: { id: assetId },
        data: { content, version: asset.version + 1, status: "DRAFT" },
      });
      return NextResponse.json({ success: true, asset: updated });
    }

    if (action === "regenerate") {
      // Find the ChannelDefinition this asset was generated from so the
      // regeneration uses the same prompt/output-type contract.
      const channel = asset.promptTemplateId
        ? await db.channelDefinition.findUnique({ where: { id: asset.promptTemplateId } })
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
      });

      // Fold the freshly generated content into the existing asset row
      // (bump version) rather than creating a duplicate asset — this only
      // ever touches this one asset, never siblings for other channels.
      const updated = await db.generatedAsset.update({
        where: { id: assetId },
        data: {
          content: regenerated.content,
          version: asset.version + 1,
          status: "DRAFT",
        },
      });

      // Clean up the throwaway row generateChannelAsset created, since we
      // folded its content into the original asset instead of keeping two.
      await db.generatedAsset.delete({ where: { id: regenerated.id } });

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
    const { assetId } = await props.params;
    const asset = await db.generatedAsset.findUnique({
      where: { id: assetId },
      include: { versions: { orderBy: { version: "desc" } } },
    });
    if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    return NextResponse.json({ asset });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
