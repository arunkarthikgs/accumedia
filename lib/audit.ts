import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/worker-db";
import crypto from "node:crypto";

export async function recordAudit(input: {
  organizationId: string;
  action: string;
  targetType: string;
  targetId: string;
  caseId?: string;
  detail?: string;
  metadata?: Record<string, unknown>;
  actorId?: string | null;
}) {
  const actorId = input.actorId === undefined ? (await getCurrentUser())?.id || null : input.actorId;
  const { rows } = await query(
    `INSERT INTO macula.macula_audit_logs (id, "organizationId", action, "targetType", "targetId", "caseId", "actorId", detail, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb) RETURNING *`,
    [crypto.randomUUID(), input.organizationId, input.action, input.targetType, input.targetId, input.caseId || null, actorId, input.detail || null, JSON.stringify(input.metadata || {})]
  );
  return rows[0];
}