import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const plans = [
    { name: "Starter", sortOrder: 1, monthlyPrice: 4999, currency: "INR", billingInterval: "monthly", setupFee: 0, isCustom: false, overagePolicy: "Block new case creation when the monthly case limit is reached.", monthlyCaseLimit: 2, monthlyAudioMinutes: 30, monthlyAiTokens: 100000, monthlyAssetLimit: 20 },
    { name: "Professional", sortOrder: 2, monthlyPrice: 9999, currency: "INR", billingInterval: "monthly", setupFee: 0, isCustom: false, overagePolicy: "Block new case creation when the monthly case limit is reached.", monthlyCaseLimit: 5, monthlyAudioMinutes: 120, monthlyAiTokens: 300000, monthlyAssetLimit: 60 },
    { name: "Premium", sortOrder: 3, monthlyPrice: 19999, currency: "INR", billingInterval: "monthly", setupFee: 0, isCustom: false, overagePolicy: "Block new case creation when the monthly case limit is reached.", monthlyCaseLimit: 10, monthlyAudioMinutes: 300, monthlyAiTokens: 750000, monthlyAssetLimit: 140 },
    { name: "Clinic", sortOrder: 4, monthlyPrice: 34999, currency: "INR", billingInterval: "monthly", setupFee: 0, isCustom: false, overagePolicy: "Block new case creation when the monthly case limit is reached.", monthlyCaseLimit: 20, monthlyAudioMinutes: 600, monthlyAiTokens: 1500000, monthlyAssetLimit: 300 },
    { name: "Hospital", sortOrder: 5, monthlyPrice: null, currency: "INR", billingInterval: "custom", setupFee: null, isCustom: true, overagePolicy: "Custom contract and overage terms agreed with the hospital marketing team.", monthlyCaseLimit: null, monthlyAudioMinutes: null, monthlyAiTokens: null, monthlyAssetLimit: null },
  ];

  const savedPlans = [];
  for (const plan of plans) savedPlans.push(await db.plan.upsert({ where: { name: plan.name }, create: plan, update: plan }));

  const starter = savedPlans.find((plan) => plan.name === "Starter");
  if (starter) {
    const organizations = await db.organization.findMany({ select: { id: true } });
    for (const organization of organizations) {
      await db.subscription.upsert({
        where: { organizationId: organization.id },
        create: {
          organizationId: organization.id,
          planId: starter.id,
          status: "TRIAL",
          currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
        },
        update: {},
      });
    }
  }
}

main().finally(() => db.$disconnect());