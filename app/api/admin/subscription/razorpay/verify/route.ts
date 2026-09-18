import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { requireOrganizationAccess } from "@/lib/tenant-auth";
import { requirePermission } from "@/lib/auth";
import { query } from "@/lib/worker-db";

export async function POST(req: Request) {
  try {
    const user = await requirePermission("SUBSCRIPTION_MANAGE");
    const body = await req.json();
    const { organizationId, razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = body;
    if (!user.isSuperAdmin) return NextResponse.json({ error: "Only authorized subscription managers can verify checkout." }, { status: 403 });
    await requireOrganizationAccess(organizationId);
    if (!orderId || !paymentId || !signature) return NextResponse.json({ error: "Razorpay payment details are incomplete." }, { status: 400 });
    const transaction = (await query<any>(`SELECT * FROM macula.payment_transactions WHERE "orderId"=$1 AND "organizationId"=$2 LIMIT 1`, [orderId, organizationId])).rows[0];
    if (!transaction) return NextResponse.json({ error: "Payment order not found." }, { status: 404 });
    const expected = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "").update(`${orderId}|${paymentId}`).digest("hex");
    if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return NextResponse.json({ error: "Razorpay signature verification failed." }, { status: 400 });
    await query(`UPDATE macula.payment_transactions SET "paymentId"=$1, signature=$2, status='CAPTURED', "updatedAt"=NOW() WHERE id=$3`, [paymentId, signature, transaction.id]);
    const periodEnd = new Date(Date.now() + (String(transaction.metadata?.billingInterval || "monthly").toLowerCase() === "yearly" ? 365 : 30) * 86400000);
    const { rows } = await query(`INSERT INTO macula.subscriptions (id,status,"currentPeriodStart","currentPeriodEnd","organizationId","planId", "externalSubscriptionId") VALUES ($1,'ACTIVE',NOW(),$2,$3,$4,$5) ON CONFLICT ("organizationId") DO UPDATE SET "planId"=EXCLUDED."planId",status='ACTIVE',"currentPeriodStart"=NOW(),"currentPeriodEnd"=EXCLUDED."currentPeriodEnd","externalSubscriptionId"=EXCLUDED."externalSubscriptionId","updatedAt"=NOW() RETURNING *`, [crypto.randomUUID(), periodEnd, organizationId, transaction.planId, paymentId]);
    return NextResponse.json({ success: true, subscription: rows[0] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Unable to verify Razorpay payment." }, { status: 500 });
  }
}