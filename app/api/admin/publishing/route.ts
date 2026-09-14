import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const organizationId = searchParams.get("orgId");
    const status = searchParams.get("status");
    const jobs = await db.publicationJob.findMany({
      where: {
        ...(organizationId ? { organizationId } : {}),
        ...(status && status !== "ALL" ? { status: status as any } : {}),
      },
      include: {
        case: { select: { id: true, title: true } },
        asset: { select: { id: true, channelName: true, status: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return NextResponse.json({ jobs });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to load publishing jobs." }, { status: 500 });
  }
}
