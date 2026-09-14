import { db } from "@/lib/db";

export async function logAIUsage(input: {
  organizationId: string;
  caseId?: string | null;
  operation: string;
  provider: string;
  model: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  audioSeconds?: number | null;
  estimatedCostUsd?: number | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    await db.aIUsageLog.create({
      data: {
        organizationId: input.organizationId,
        caseId: input.caseId || null,
        operation: input.operation,
        provider: input.provider,
        model: input.model,
        inputTokens: input.inputTokens ?? null,
        outputTokens: input.outputTokens ?? null,
        audioSeconds: input.audioSeconds ?? null,
        estimatedCostUsd: input.estimatedCostUsd ?? null,
        metadata: input.metadata,
      },
    });
  } catch (error) {
    console.error("AI usage logging failed:", error);
  }
}