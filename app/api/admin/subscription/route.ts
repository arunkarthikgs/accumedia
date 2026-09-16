import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/tenant-auth";
import { getOrganizationQuota } from "@/lib/quotas";
import { requirePermission } from "@/lib/auth";
import { query } from "@/lib/worker-db";
import crypto from "node:crypto";

const planColumns = `id, name, "sortOrder", "monthlyCaseLimit", "monthlyAudioMinutes", "monthlyAiTokens", "monthlyAssetLimit", "monthlyPrice", currency, "billingInterval", "setupFee", "isCustom", "overagePolicy", "createdAt", "updatedAt"`;

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
      const { rows: plans } = await query(`SELECT ${planColumns} FROM macula.macula_plans ORDER BY "sortOrder" ASC`);
      return NextResponse.json({ plans });
    }
    if (!organizationId) return NextResponse.json({ error: "orgId is required." }, { status: 400 });
    await requireOrganizationAccess(organizationId);

    const [{ rows: subscriptionRows }, { rows: plans }, quota] = await Promise.all([
      query(`SELECT s.*, row_to_json(p) AS plan FROM macula.macula_subscriptions s JOIN macula.macula_plans p ON p.id = s."planId" WHERE s."organizationId" = $1 LIMIT 1`, [organizationId]),
      query(`SELECT ${planColumns} FROM macula.macula_plans ORDER BY "sortOrder" ASC`),
      getOrganizationQuota(organizationId),
    ]);
    return NextResponse.json({ subscription: subscriptionRows[0] || null, plans, quota });
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

    const periodEnd = currentPeriodEnd ? new Date(currentPeriodEnd) : new Date(Date.now() + 30 * 86400000);
    const { rows: subscriptionRows } = await query(`
      INSERT INTO macula.macula_subscriptions (id, status, "currentPeriodStart", "currentPeriodEnd", "organizationId", "planId")
      VALUES ($1, $2, NOW(), $3, $4, $5)
      ON CONFLICT ("organizationId") DO UPDATE SET "planId" = EXCLUDED."planId", status = EXCLUDED.status, "currentPeriodEnd" = EXCLUDED."currentPeriodEnd", "updatedAt" = NOW()
      RETURNING *`, [crypto.randomUUID(), status || "ACTIVE", periodEnd, organizationId, planId]);
    const subscription = { ...subscriptionRows[0], plan: (await query(`SELECT ${planColumns} FROM macula.macula_plans WHERE id = $1`, [planId])).rows[0] };
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
    const existing = (await query(`SELECT * FROM macula.macula_subscriptions WHERE "organizationId" = $1 LIMIT 1`, [organizationId])).rows[0];
    if (!existing) return NextResponse.json({ error: "Subscription is not configured." }, { status: 404 });
    const now = new Date();
    const nextStatus = action === "cancel" ? "CANCELLED" : action === "past_due" ? "PAST_DUE" : "ACTIVE";
    const nextStart = action === "renew" ? now : existing.currentPeriodStart;
    const nextEnd = action === "renew" ? new Date(Date.now() + 30 * 86400000) : existing.currentPeriodEnd;
    const { rows: updatedRows } = await query(`UPDATE macula.macula_subscriptions SET status = $1, "currentPeriodStart" = $2, "currentPeriodEnd" = $3, "updatedAt" = NOW() WHERE "organizationId" = $4 RETURNING *`, [nextStatus, nextStart, nextEnd, organizationId]);
    const subscription = { ...updatedRows[0], plan: (await query(`SELECT ${planColumns} FROM macula.macula_plans WHERE id = $1`, [existing.planId])).rows[0] };
    return NextResponse.json({ success: true, subscription });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to update subscription lifecycle." }, { status: 500 });
  }
}
