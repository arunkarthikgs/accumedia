import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/tenant-auth";
import { query } from "@/lib/worker-db";

export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await props.params;
    const cursor = new URL(req.url).searchParams.get("cursor");
    const kase = (await query<{ organizationId: string }>(`SELECT "organizationId" FROM macula.cases WHERE id = $1 LIMIT 1`, [id])).rows[0];
    if (!kase) return NextResponse.json({ error: "Case not found." }, { status: 404 });
    await requireOrganizationAccess(kase.organizationId);
    const cursorFilter = cursor ? `AND al.id < $2` : "";
    const params = cursor ? [id, cursor] : [id];
    const { rows: events } = await query(`SELECT al.*, CASE WHEN u.id IS NULL THEN NULL ELSE json_build_object('id', u.id, 'name', u.name, 'email', u.email) END AS actor
      FROM macula.audit_logs al LEFT JOIN macula.users u ON u.id = al."actorId"
      WHERE al."caseId" = $1 ${cursorFilter} ORDER BY al."createdAt" DESC, al.id DESC LIMIT 51`, params);
    const hasMore = events.length > 50;
    const page = hasMore ? events.slice(0, 50) : events;
    return NextResponse.json({ events: page, nextCursor: hasMore ? page.at(-1)?.id : null });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to load audit events." }, { status: 500 });
  }
}