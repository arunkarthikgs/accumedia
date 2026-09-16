import { query } from "@/lib/worker-db";
import crypto from "node:crypto";

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
    await query(`INSERT INTO macula.macula_ai_usage_logs (id, operation, provider, model, "inputTokens", "outputTokens", "audioSeconds", "estimatedCostUsd", metadata, "organizationId", "caseId") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)`, [crypto.randomUUID(), input.operation, input.provider, input.model, input.inputTokens ?? null, input.outputTokens ?? null, input.audioSeconds ?? null, input.estimatedCostUsd ?? null, JSON.stringify(input.metadata || {}), input.organizationId, input.caseId || null]);
  } catch (error) {
    console.error("AI usage logging failed:", error);
  }
}