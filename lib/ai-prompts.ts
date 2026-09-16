import { query } from "@/lib/worker-db";

export type AiPromptRecord = {
  id: string;
  promptKey: string;
  content: string;
  version: number;
  organizationId: string | null;
};

export async function getResolvedAiPrompts(organizationId: string, promptKeys?: string[]) {
  const values: unknown[] = [organizationId];
  const keyFilter = promptKeys?.length ? `AND "promptKey" = ANY($2::text[])` : "";
  if (promptKeys?.length) values.push(promptKeys);
  const { rows: prompts } = await query<AiPromptRecord>(
    `SELECT id, "promptKey" AS "promptKey", content, version, "organizationId" AS "organizationId"
     FROM macula.macula_ai_prompt_templates
     WHERE "isActive" = TRUE AND ("organizationId" = $1 OR "organizationId" IS NULL) ${keyFilter}
     ORDER BY "promptKey" ASC, "organizationId" DESC NULLS LAST, version DESC`,
    values
  );

  const resolved = new Map<string, AiPromptRecord>();
  for (const prompt of prompts) {
    if (!resolved.has(prompt.promptKey) || prompt.organizationId === organizationId) {
      resolved.set(prompt.promptKey, prompt);
    }
  }
  return resolved;
}