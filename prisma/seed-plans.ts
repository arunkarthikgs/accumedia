import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const plans = [
    { name: "Starter", monthlyCaseLimit: 2, monthlyAudioMinutes: 30, monthlyAiTokens: 100000, monthlyAssetLimit: 20 },
    { name: "Professional", monthlyCaseLimit: 5, monthlyAudioMinutes: 120, monthlyAiTokens: 300000, monthlyAssetLimit: 60 },
    { name: "Premium", monthlyCaseLimit: 10, monthlyAudioMinutes: 300, monthlyAiTokens: 750000, monthlyAssetLimit: 140 },
    { name: "Clinic", monthlyCaseLimit: 20, monthlyAudioMinutes: 600, monthlyAiTokens: 1500000, monthlyAssetLimit: 300 },
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