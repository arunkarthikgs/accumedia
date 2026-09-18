import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { requireOrganizationAccess } from "@/lib/tenant-auth";
import { requirePermission } from "@/lib/auth";
import { query } from "@/lib/worker-db";

export async function POST(req: Request) {
  try {
    const user = await requirePermission("SUBSCRIPTION_MANAGE");
    const { organizationId, planId } = await req.json();
    if (!user.isSuperAdmin) return NextResponse.json({ error: "Only authorized subscription managers can start checkout." }, { status: 403 });
    await requireOrganizationAccess(organizationId);
    const plan = (await query<any>(`SELECT id, name, "monthlyPrice", currency, "billingInterval", "isCustom" FROM macula.plans WHERE id=$1 LIMIT 1`, [planId])).rows[0];
    if (!plan) return NextResponse.json({ error: "Plan not found." }, { status: 404 });
    if (plan.isCustom || plan.monthlyPrice == null || Number(plan.monthlyPrice) <= 0) return NextResponse.json({ error: "This plan requires manual commercial configuration and cannot use online checkout." }, { status: 400 });
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) return NextResponse.json({ error: "Razorpay is not configured for this deployment." }, { status: 503 });
    const amount = Math.round(Number(plan.monthlyPrice) * 100);
    const receipt = `macula_${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`;
    const response = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { Authorization: `Basic ${btoa(`${keyId}:${keySecret}`)}`, "Content-Type": "application/json" },
      body: JSON.stringify({ amount, currency: plan.currency || "INR", receipt, notes: { organizationId, planId } }),
    });
    const order = await response.json() as { id?: string; amount?: number; currency?: string; error?: { description?: string } };
    if (!response.ok || !order.id) return NextResponse.json({ error: order.error?.description || "Razorpay order creation failed." }, { status: 502 });
    await query(`INSERT INTO macula.payment_transactions (id,"orderId",amount,currency,status,"organizationId","planId",metadata) VALUES ($1,$2,$3,$4,'PENDING',$5,$6,$7::jsonb)`, [crypto.randomUUID(), order.id, amount, order.currency || plan.currency || "INR", organizationId, planId, JSON.stringify({ planName: plan.name, billingInterval: plan.billingInterval, receipt })]);
    return NextResponse.json({ keyId, orderId: order.id, amount, currency: order.currency || plan.currency || "INR", planName: plan.name });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Unable to start Razorpay checkout." }, { status: 500 });
  }
}