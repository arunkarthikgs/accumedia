import { db } from "@/lib/db";

export type AiPromptRecord = {
  id: string;
  promptKey: string;
  content: string;
  version: number;
  organizationId: string | null;
};

export async function getResolvedAiPrompts(organizationId: string, promptKeys?: string[]) {
  const prompts = await db.aiPromptTemplate.findMany({
    where: {
      isActive: true,
      ...(promptKeys?.length ? { promptKey: { in: promptKeys } } : {}),
      OR: [{ organizationId }, { organizationId: null }],
    },
    orderBy: [{ promptKey: "asc" }, { organizationId: "desc" }, { version: "desc" }],
  });

  const resolved = new Map<string, AiPromptRecord>();
  for (const prompt of prompts) {
    if (!resolved.has(prompt.promptKey) || prompt.organizationId === organizationId) {
      resolved.set(prompt.promptKey, prompt);
    }
  }
  return resolved;
}