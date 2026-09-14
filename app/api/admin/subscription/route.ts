import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const organizationId = new URL(req.url).searchParams.get("orgId");
    if (!organizationId) return NextResponse.json({ error: "orgId is required." }, { status: 400 });

    const [subscription, plans] = await Promise.all([
      db.subscription.findUnique({ where: { organizationId }, include: { plan: true } }),
      db.plan.findMany({ orderBy: { monthlyCaseLimit: "asc" } }),
    ]);
    return NextResponse.json({ subscription, plans });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to load subscription." }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const { organizationId, planId, status, currentPeriodEnd } = await req.json();
    if (!organizationId || !planId) return NextResponse.json({ error: "organizationId and planId are required." }, { status: 400 });

    const subscription = await db.subscription.upsert({
      where: { organizationId },
      create: {
        organizationId,
        planId,
        status: status || "ACTIVE",
        currentPeriodEnd: currentPeriodEnd ? new Date(currentPeriodEnd) : new Date(Date.now() + 30 * 86400000),
      },
      update: {
        planId,
        status: status || undefined,
        currentPeriodEnd: currentPeriodEnd ? new Date(currentPeriodEnd) : undefined,
      },
      include: { plan: true },
    });
    return NextResponse.json({ success: true, subscription });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to update subscription." }, { status: 500 });
  }
}
