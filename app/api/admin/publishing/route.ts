import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuthenticatedUser, requireOrganizationAccess } from "@/lib/tenant-auth";
import { timeDbOperation } from "@/lib/perf";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const organizationId = searchParams.get("orgId");
    const user = await requireAuthenticatedUser();
    const scopedOrgId = organizationId || user?.organizationId;
    if (scopedOrgId) await requireOrganizationAccess(scopedOrgId);
    const status = searchParams.get("status");
    const jobs = await timeDbOperation("admin publishing jobs", () => db.publicationJob.findMany({
      where: {
        ...(scopedOrgId ? { organizationId: scopedOrgId } : {}),
        ...(status && status !== "ALL" ? { status: status as any } : {}),
      },
      include: {
        case: { select: { id: true, title: true } },
        asset: { select: { id: true, channelName: true, status: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }));
    return NextResponse.json({ jobs });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to load publishing jobs." }, { status: 500 });
  }
}
