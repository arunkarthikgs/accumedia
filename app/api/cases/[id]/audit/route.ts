import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrganizationAccess } from "@/lib/tenant-auth";

export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await props.params;
    const cursor = new URL(req.url).searchParams.get("cursor");
    const kase = await db.case.findUnique({ where: { id }, select: { organizationId: true } });
    if (!kase) return NextResponse.json({ error: "Case not found." }, { status: 404 });
    await requireOrganizationAccess(kase.organizationId);
    const events = await db.auditLog.findMany({
      where: { caseId: id },
      include: { actor: { select: { id: true, name: true, email: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 51,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = events.length > 50;
    const page = hasMore ? events.slice(0, 50) : events;
    return NextResponse.json({ events: page, nextCursor: hasMore ? page.at(-1)?.id : null });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to load audit events." }, { status: 500 });
  }
}