import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const organizationId = searchParams.get("orgId");
    if (!organizationId) return NextResponse.json({ error: "orgId is required." }, { status: 400 });

    const [logs, summary] = await Promise.all([
      db.aIUsageLog.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" }, take: 100 }),
      db.aIUsageLog.aggregate({
        where: { organizationId },
        _sum: { inputTokens: true, outputTokens: true, audioSeconds: true, estimatedCostUsd: true },
        _count: { _all: true },
      }),
    ]);

    return NextResponse.json({ logs, summary });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to load usage." }, { status: 500 });
  }
}