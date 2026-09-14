import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrganizationAccess } from "@/lib/tenant-auth";

export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await props.params;
    const kase = await db.case.findUnique({ where: { id }, select: { organizationId: true } });
    if (!kase) return NextResponse.json({ error: "Case not found." }, { status: 404 });
    await requireOrganizationAccess(kase.organizationId);
    const events = await db.auditLog.findMany({ where: { caseId: id }, include: { actor: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: "desc" }, take: 200 });
    return NextResponse.json({ events });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to load audit events." }, { status: 500 });
  }
}