import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { query } from "@/lib/worker-db";

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-razorpay-signature") || "";
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET || process.env.RAZORPAY_KEY_SECRET || "";
    const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
    if (!signature || signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
      return NextResponse.json({ error: "Invalid Razorpay webhook signature." }, { status: 401 });
    }
    const payload = JSON.parse(rawBody) as { event?: string; payload?: { payment?: { entity?: { order_id?: string; id?: string } } } };
    if (payload.event !== "payment.captured") return NextResponse.json({ received: true });
    const payment = payload.payload?.payment?.entity;
    if (!payment?.order_id || !payment.id) return NextResponse.json({ error: "Payment order details are missing." }, { status: 400 });
    const transaction = (await query<any>(`SELECT * FROM macula.payment_transactions WHERE "orderId"=$1 LIMIT 1`, [payment.order_id])).rows[0];
    if (!transaction) return NextResponse.json({ received: true });
    await query(`UPDATE macula.payment_transactions SET "paymentId"=COALESCE("paymentId",$1), status='CAPTURED', "updatedAt"=NOW() WHERE id=$2`, [payment.id, transaction.id]);
    const interval = String(transaction.metadata?.billingInterval || "monthly").toLowerCase();
    const periodEnd = new Date(Date.now() + (interval === "yearly" ? 365 : 30) * 86400000);
    await query(`INSERT INTO macula.subscriptions (id,status,"currentPeriodStart","currentPeriodEnd","organizationId","planId","externalSubscriptionId") VALUES ($1,'ACTIVE',NOW(),$2,$3,$4,$5) ON CONFLICT ("organizationId") DO UPDATE SET "planId"=EXCLUDED."planId",status='ACTIVE',"currentPeriodStart"=NOW(),"currentPeriodEnd"=EXCLUDED."currentPeriodEnd","externalSubscriptionId"=EXCLUDED."externalSubscriptionId","updatedAt"=NOW()`, [crypto.randomUUID(), periodEnd, transaction.organizationId, transaction.planId, payment.id]);
    return NextResponse.json({ received: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Unable to process Razorpay webhook." }, { status: 500 });
  }
}
