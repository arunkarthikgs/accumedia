import { query } from "@/lib/worker-db";

export async function getOrganizationQuota(organizationId: string) {
  const subscriptionResult = await query<any>(
    `SELECT s.*, row_to_json(p) AS plan
     FROM macula.subscriptions s
     JOIN macula.plans p ON p.id = s."planId"
     WHERE s."organizationId" = $1 LIMIT 1`,
    [organizationId]
  );
  let subscription = subscriptionResult.rows[0] as any;
  if (!subscription || subscription.status === "CANCELLED") return null;

  if (new Date(subscription.currentPeriodEnd) <= new Date() && ["TRIAL", "ACTIVE"].includes(subscription.status)) {
    const periodStart = new Date();
    const periodEnd = new Date(Date.now() + 30 * 86400000);
    const renewed = await query<any>(
      `UPDATE macula.subscriptions
       SET "currentPeriodStart" = $1, "currentPeriodEnd" = $2, "updatedAt" = NOW()
       WHERE id = $3
       RETURNING *`,
      [periodStart, periodEnd, subscription.id]
    );
    subscription = { ...renewed.rows[0], plan: subscription.plan };
  }

  const { rows: usageRows } = await query<any>(
    `SELECT
       (SELECT COUNT(*) FROM macula.cases WHERE "organizationId" = $1 AND "createdAt" BETWEEN $2 AND $3) AS case_count,
       (SELECT COALESCE(SUM("audioSeconds"), 0) FROM macula.ai_usage_logs WHERE "organizationId" = $1 AND "createdAt" BETWEEN $2 AND $3) AS audio_seconds,
       (SELECT COALESCE(SUM("inputTokens"), 0) + COALESCE(SUM("outputTokens"), 0) FROM macula.ai_usage_logs WHERE "organizationId" = $1 AND "createdAt" BETWEEN $2 AND $3) AS ai_tokens,
       (SELECT COUNT(*) FROM macula.generated_assets ga JOIN macula.cases c ON c.id = ga."caseId" WHERE c."organizationId" = $1 AND ga."createdAt" BETWEEN $2 AND $3) AS asset_count`,
    [organizationId, subscription.currentPeriodStart, subscription.currentPeriodEnd]
  );
  const usage = usageRows[0];
  const plan = subscription.plan;

  return {
    subscription,
    cases: { used: Number(usage.case_count), limit: plan.monthlyCaseLimit },
    audioMinutes: { used: Math.ceil(Number(usage.audio_seconds) / 60), limit: plan.monthlyAudioMinutes },
    aiTokens: { used: Number(usage.ai_tokens), limit: plan.monthlyAiTokens },
    assets: { used: Number(usage.asset_count), limit: plan.monthlyAssetLimit },
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

export async function assertTokenQuota(organizationId: string, additionalTokens: number) {
  const quota = await getOrganizationQuota(organizationId);
  if (!quota?.aiTokens.limit) return;
  if (quota.aiTokens.used + Math.max(0, Math.ceil(additionalTokens)) > quota.aiTokens.limit) {
    throw new Error(`Monthly AI token quota exceeded (${quota.aiTokens.limit} tokens).`);
  }
}

export async function assertCaseQuota(organizationId: string) {
  const quota = await getOrganizationQuota(organizationId);
  if (!quota?.cases.limit) return;
  if (quota.cases.used >= quota.cases.limit) {
    throw new Error(`Monthly case quota exceeded (${quota.cases.limit} cases).`);
  }
}
