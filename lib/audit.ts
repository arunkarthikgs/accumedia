import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

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
  return db.auditLog.create({
    data: {
      organizationId: input.organizationId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      caseId: input.caseId,
      actorId,
      detail: input.detail,
      metadata: input.metadata as any,
    },
  });
}