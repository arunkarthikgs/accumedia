import { db } from "@/lib/db";

export async function getOrganizationQuota(organizationId: string) {
  const subscription = await db.subscription.findUnique({
    where: { organizationId },
    include: { plan: true },
  });
  if (!subscription || subscription.status === "CANCELLED") return null;

  const periodStart = subscription.currentPeriodStart;
  const periodEnd = subscription.currentPeriodEnd;
  const [caseCount, audioUsage, tokenUsage] = await Promise.all([
    db.case.count({ where: { organizationId, createdAt: { gte: periodStart, lte: periodEnd } } }),
    db.aIUsageLog.aggregate({ where: { organizationId, createdAt: { gte: periodStart, lte: periodEnd } }, _sum: { audioSeconds: true } }),
    db.aIUsageLog.aggregate({ where: { organizationId, createdAt: { gte: periodStart, lte: periodEnd } }, _sum: { inputTokens: true, outputTokens: true } }),
  ]);
  const assetCount = await db.generatedAsset.count({
    where: { case: { organizationId }, createdAt: { gte: periodStart, lte: periodEnd } },
  });

  return {
    subscription,
    cases: { used: caseCount, limit: subscription.plan.monthlyCaseLimit },
    audioMinutes: { used: Math.ceil((audioUsage._sum.audioSeconds || 0) / 60), limit: subscription.plan.monthlyAudioMinutes },
    aiTokens: { used: (tokenUsage._sum.inputTokens || 0) + (tokenUsage._sum.outputTokens || 0), limit: subscription.plan.monthlyAiTokens },
    assets: { used: assetCount, limit: subscription.plan.monthlyAssetLimit },
  };
}

export async function assertAudioQuota(organizationId: string, additionalSeconds: number) {
  const quota = await getOrganizationQuota(organizationId);
  if (!quota?.audioMinutes.limit) return;
  if (quota.audioMinutes.used + Math.ceil(additionalSeconds / 60) > quota.audioMinutes.limit) {
    throw new Error(`Monthly audio quota exceeded (${quota.audioMinutes.limit} minutes).`);
  }
}

export async function assertAssetQuota(organizationId: string, additionalAssets = 1) {
  const quota = await getOrganizationQuota(organizationId);
  if (!quota?.assets.limit) return;
  if (quota.assets.used + additionalAssets > quota.assets.limit) {
    throw new Error(`Monthly asset quota exceeded (${quota.assets.limit} assets).`);
  }
}

export async function assertCaseQuota(organizationId: string) {
  const quota = await getOrganizationQuota(organizationId);
  if (!quota?.cases.limit) return;
  if (quota.cases.used >= quota.cases.limit) {
    throw new Error(`Monthly case quota exceeded (${quota.cases.limit} cases).`);
  }
}
