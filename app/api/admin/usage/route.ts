import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrganizationAccess } from "@/lib/tenant-auth";
import { getOrganizationQuota } from "@/lib/quotas";
import { requirePermission } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const organizationId = searchParams.get("orgId");
    const operation = searchParams.get("operation");
    const caseSearch = searchParams.get("caseSearch")?.trim();
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const page = Math.max(1, Number(searchParams.get("page") || "1"));
    const pageSize = Math.min(100, Math.max(10, Number(searchParams.get("pageSize") || "50")));
    const createdAt = {
      ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
      ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
    };
    const where = { organizationId, ...(operation && operation !== "ALL" ? { operation } : {}), ...(caseSearch ? { case: { title: { contains: caseSearch, mode: "insensitive" as const } } } : {}), ...(Object.keys(createdAt).length ? { createdAt } : {}) };
    if (!organizationId) return NextResponse.json({ error: "orgId is required." }, { status: 400 });
    await requirePermission("USAGE_VIEW");
    await requireOrganizationAccess(organizationId);

    const [logs, count, summary, quota] = await Promise.all([
      db.aIUsageLog.findMany({ where, include: { case: { select: { id: true, title: true } } }, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
      db.aIUsageLog.count({ where }),
      db.aIUsageLog.aggregate({
        where,
        _sum: { inputTokens: true, outputTokens: true, audioSeconds: true, estimatedCostUsd: true },
        _count: { _all: true },
      }),
      getOrganizationQuota(organizationId),
    ]);

    return NextResponse.json({ logs, summary, quota, pagination: { page, pageSize, total: count, totalPages: Math.ceil(count / pageSize) } });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to load usage." }, { status: 500 });
  }
}