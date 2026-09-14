import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const plans = [
    { name: "Starter", monthlyCaseLimit: 2, monthlyAudioMinutes: 30, monthlyAiTokens: 100000, monthlyAssetLimit: 20 },
    { name: "Professional", monthlyCaseLimit: 5, monthlyAudioMinutes: 120, monthlyAiTokens: 300000, monthlyAssetLimit: 60 },
    { name: "Premium", monthlyCaseLimit: 10, monthlyAudioMinutes: 300, monthlyAiTokens: 750000, monthlyAssetLimit: 140 },
    { name: "Clinic", monthlyCaseLimit: 20, monthlyAudioMinutes: 600, monthlyAiTokens: 1500000, monthlyAssetLimit: 300 },
  ];

  for (const plan of plans) await db.plan.upsert({ where: { name: plan.name }, create: plan, update: plan });
}

main().finally(() => db.$disconnect());