import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrganizationAccess } from "@/lib/tenant-auth";
import { getOrganizationQuota } from "@/lib/quotas";
import { requirePermission } from "@/lib/auth";

async function requireSubscriptionManager() {
  const user = await requirePermission("SUBSCRIPTION_MANAGE");
  if (!user.isSuperAdmin) throw new Error("Forbidden: only super administrators can manage commercial plans.");
  return user;
}

export async function GET(req: Request) {
  try {
    const searchParams = new URL(req.url).searchParams;
    const organizationId = searchParams.get("orgId");
    await requireSubscriptionManager();
    if (!organizationId && searchParams.get("catalog") === "true") {
      const plans = await db.plan.findMany({ orderBy: { sortOrder: "asc" } });
      return NextResponse.json({ plans });
    }
    if (!organizationId) return NextResponse.json({ error: "orgId is required." }, { status: 400 });
    await requireOrganizationAccess(organizationId);

    const [subscription, plans, quota] = await Promise.all([
      db.subscription.findUnique({ where: { organizationId }, include: { plan: true } }),
      db.plan.findMany({ orderBy: { sortOrder: "asc" } }),
      getOrganizationQuota(organizationId),
    ]);
    return NextResponse.json({ subscription, plans, quota });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to load subscription." }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const { organizationId, planId, status, currentPeriodEnd } = await req.json();
    if (!organizationId || !planId) return NextResponse.json({ error: "organizationId and planId are required." }, { status: 400 });
    await requireSubscriptionManager();
    await requireOrganizationAccess(organizationId);

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

export async function PATCH(req: Request) {
  try {
    const { organizationId, action } = await req.json();
    if (!organizationId || !["activate", "cancel", "renew", "past_due"].includes(action)) return NextResponse.json({ error: "organizationId and a valid lifecycle action are required." }, { status: 400 });
    await requireSubscriptionManager();
    await requireOrganizationAccess(organizationId);
    const existing = await db.subscription.findUnique({ where: { organizationId } });
    if (!existing) return NextResponse.json({ error: "Subscription is not configured." }, { status: 404 });
    const now = new Date();
    const subscription = await db.subscription.update({
      where: { organizationId },
      data: action === "cancel"
        ? { status: "CANCELLED" }
        : action === "past_due"
          ? { status: "PAST_DUE" }
          : { status: "ACTIVE", currentPeriodStart: action === "renew" ? now : undefined, currentPeriodEnd: action === "renew" ? new Date(Date.now() + 30 * 86400000) : undefined },
      include: { plan: true },
    });
    return NextResponse.json({ success: true, subscription });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to update subscription lifecycle." }, { status: 500 });
  }
}
