import { NextResponse } from "next/server";
import { runAdaptationEngine } from "@/lib/content-engine";
import { requireOrganizationAccess } from "@/lib/tenant-auth";
import { query } from "@/lib/worker-db";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await props.params;
    const kase = (await query<any>(`SELECT id, "organizationId" FROM macula.cases WHERE id = $1 LIMIT 1`, [id])).rows[0];
    if (!kase) return NextResponse.json({ error: "Case not found." }, { status: 404 });
    await requireOrganizationAccess(kase.organizationId);
    const { rows: channelRows } = await query<any>(
      `SELECT "channelKey", "displayName", "outputType", "durationLabel" FROM macula.channel_definitions WHERE "isActive" = TRUE AND "outputType" IS NOT NULL AND ("organizationId" = $1 OR "organizationId" IS NULL) ORDER BY ("organizationId" IS NOT NULL) DESC`,
      [kase.organizationId],
    );
    let channels = channelRows;
    if (channels.length === 0) {
      channels = (await query<any>(`SELECT "channelKey", "displayName", "outputType", "durationLabel" FROM macula.channel_definitions WHERE "organizationId" IS NULL AND "outputType" IS NOT NULL`)).rows;
    }
    channels = Array.from(new Map(channels.map((channel: any) => [channel.channelKey, channel])).values());
    const { rows: existingAssets } = await query<{ channelKey: string }>(`SELECT "channelKey" FROM macula.generated_assets WHERE "caseId" = $1`, [id]);
    const existingChannelKeys = new Set(existingAssets.map((asset) => asset.channelKey));
    const result = channels.map((channel) => ({ ...channel, alreadyGenerated: existingChannelKeys.has(channel.channelKey) }));
    return NextResponse.json({ channels: result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to load publishing channels." }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  props: { params: Promise<{ id: string }> }
) {
  const startedAt = performance.now();
  const { id } = await props.params;
  const body = await req.json().catch(() => ({}));
  const channelKeys = Array.isArray(body.channelKeys) && body.channelKeys.length ? body.channelKeys.map(String) : undefined;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Record<string, any>) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        const kase = (await query<any>(`SELECT c.*, c.mccr_approved_at AS "mccrApprovedAt", row_to_json(o) AS organization FROM macula.cases c JOIN macula.organizations o ON o.id = c."organizationId" WHERE c.id = $1 LIMIT 1`, [id])).rows[0];
        if (!kase) {
          send({ type: "error", error: "Case not found." });
          return;
        }
        await requireOrganizationAccess(kase.organizationId);
        if (kase.status !== "APPROVED" || !kase.mccrApprovedAt) {
          send({ type: "error", error: "Approve the clinical record before generating publishing assets." });
          return;
        }
        const assets = await runAdaptationEngine(id, kase, {
          channelKeys,
          onProgress: (completed, total, channelKey) => send({ type: "progress", completed, total, channelKey }),
        });
        const completedAt = performance.now();
        send({
          type: "done",
          success: true,
          assetsGenerated: assets.length,
          assets,
          durationMs: Number((completedAt - startedAt).toFixed(1)),
        });
      } catch (error: any) {
        send({ type: "error", error: error.message || "Failed to generate publishing assets." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-store",
    },
  });
}