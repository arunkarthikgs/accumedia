CREATE TABLE "macula"."payment_transactions" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'RAZORPAY',
    "orderId" TEXT NOT NULL,
    "paymentId" TEXT,
    "signature" TEXT,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "organizationId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "payment_transactions_orderId_key" ON "macula"."payment_transactions"("orderId");
CREATE INDEX "payment_transactions_organizationId_status_createdAt_idx" ON "macula"."payment_transactions"("organizationId", "status", "createdAt");
CREATE INDEX "payment_transactions_planId_idx" ON "macula"."payment_transactions"("planId");
ALTER TABLE "macula"."payment_transactions" ADD CONSTRAINT "payment_transactions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "macula"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;