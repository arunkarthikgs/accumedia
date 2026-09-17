import { NextResponse } from "next/server";
import { DEFAULT_CLINICAL_REFINER_PROMPT } from "@/lib/clinical-refiner";
import { DEFAULT_IMAGE_GENERATION_PROMPT, DEFAULT_IMAGE_SAFETY_PROMPT } from "@/lib/image-prompts";
import { MANDATORY_CLINICAL_SYNTHESIS_PROMPT } from "@/lib/prompts/clinical-synthesis";
import { DEFAULT_SEO_KEYWORD_PROMPT } from "@/lib/seo-keyword-engine";
import { getResolvedAiPrompts } from "@/lib/ai-prompts";
import { requirePermission } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { requireAuthenticatedUser, requireOrganizationAccess } from "@/lib/tenant-auth";
import { query } from "@/lib/worker-db";
import crypto from "node:crypto";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await requireAuthenticatedUser();
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get("orgId");

    if (!orgId) {
      return NextResponse.json({ error: "orgId is required" }, { status: 400 });
    }
    await requireOrganizationAccess(orgId);

    const organization = (await query<any>(`SELECT * FROM macula.organizations WHERE id = $1 LIMIT 1`, [orgId])).rows[0];

    if (!organization) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const promptTemplates = await getResolvedAiPrompts(organization.id);
    const promptDefinitions = await query<any>(`SELECT * FROM macula.ai_prompt_definitions ORDER BY "promptKey" ASC`);
    const promptHistory = await query<any>(`SELECT apt.id, apt."promptKey", apt.content, apt.version, apt."isActive", apt."organizationId", apt."createdAt" FROM macula.ai_prompt_templates apt WHERE apt."organizationId" IS NULL OR apt."organizationId" = $1 ORDER BY apt."promptKey", apt.version DESC`, [orgId]);
    const { rows: channelRows } = await query<any>(`SELECT * FROM macula.channel_definitions WHERE "isActive" = TRUE AND "outputType" IS NOT NULL AND ("organizationId" IS NULL OR "organizationId" = $1) ORDER BY "channelKey", ("organizationId" IS NOT NULL) DESC`, [orgId]);
    const { rows: complianceRules } = await query(`SELECT * FROM macula.compliance_rules WHERE "organizationId" = $1 AND "isActive" = TRUE`, [orgId]);
    const { rows: promptAuditTrail } = await query(`SELECT al.id, al.action, al."targetType", al."targetId", al.detail, al.metadata, al."createdAt", u.name AS "actorName" FROM macula.audit_logs al LEFT JOIN macula.users u ON u.id = al."actorId" WHERE al."organizationId" = $1 AND al."targetType" IN ('AI_PROMPT', 'CHANNEL_PROMPT', 'PROMPT_SETTINGS') ORDER BY al."createdAt" DESC LIMIT 50`, [orgId]);
    const fallbackPrompts: Record<string, string> = {
      MASTER_SYNTHESIS: MANDATORY_CLINICAL_SYNTHESIS_PROMPT,
      SEO_KEYWORDS: DEFAULT_SEO_KEYWORD_PROMPT,
      CLINICAL_REFINER: DEFAULT_CLINICAL_REFINER_PROMPT,
      IMAGE_GENERATION: DEFAULT_IMAGE_GENERATION_PROMPT,
      IMAGE_SAFETY: DEFAULT_IMAGE_SAFETY_PROMPT,
    };
    const governedPrompts = promptDefinitions.rows.map((definition: any) => {
      const versions = promptHistory.rows.filter((prompt: any) => prompt.promptKey === definition.promptKey);
      const globalPrompt = versions.find((prompt: any) => prompt.organizationId === null && prompt.isActive) || versions.find((prompt: any) => prompt.organizationId === null);
      const organizationPrompt = versions.find((prompt: any) => prompt.organizationId === orgId && prompt.isActive);
      const effectivePrompt = promptTemplates.get(definition.promptKey);
      return {
        promptKey: definition.promptKey,
        name: definition.name,
        description: definition.description,
        content: effectivePrompt?.content || globalPrompt?.content || fallbackPrompts[definition.promptKey] || "",
        version: effectivePrompt?.version || globalPrompt?.version || 1,
        source: effectivePrompt?.organizationId ? "organization" : "global",
        globalContent: globalPrompt?.content || fallbackPrompts[definition.promptKey] || "",
        globalVersion: globalPrompt?.version || 1,
        organizationContent: organizationPrompt?.content || null,
        organizationVersion: organizationPrompt?.version || null,
        history: versions.map((prompt: any) => ({ id: prompt.id, version: prompt.version, source: prompt.organizationId ? "organization" : "global", isActive: prompt.isActive, createdAt: prompt.createdAt })),
      };
    });
    const globalChannels = new Map(channelRows.filter((channel: any) => !channel.organizationId).map((channel: any) => [channel.channelKey, channel]));
    const organizationChannels = new Map(channelRows.filter((channel: any) => channel.organizationId === orgId).map((channel: any) => [channel.channelKey, channel]));
    const effectiveChannels = new Map<string, any>();
    for (const channel of channelRows) if (!effectiveChannels.has(channel.channelKey)) effectiveChannels.set(channel.channelKey, channel);
    const channelDefinitions = Array.from(effectiveChannels.values()).map((channel: any) => ({
      ...channel,
      source: channel.organizationId ? "organization" : "global",
      globalSystemPrompt: (globalChannels.get(channel.channelKey) as any)?.systemPrompt || channel.systemPrompt,
      globalPromptVersion: (globalChannels.get(channel.channelKey) as any)?.promptVersion || channel.promptVersion,
      organizationSystemPrompt: (organizationChannels.get(channel.channelKey) as any)?.systemPrompt || null,
      organizationPromptVersion: (organizationChannels.get(channel.channelKey) as any)?.promptVersion || null,
    }));
    return NextResponse.json({
      success: true,
      data: {
        orgId: organization.id,
        orgName: organization.name,
        customSystemPrompt: organization.customSystemPrompt || "",
        defaultDisclaimer: organization.defaultDisclaimer,
        preferredTone: organization.preferredTone || "",
        callToAction: organization.callToAction || "",
        canEditGlobal: Boolean(user?.isSuperAdmin),
        clinicalRefinerPrompt: promptTemplates.get("CLINICAL_REFINER")?.content || DEFAULT_CLINICAL_REFINER_PROMPT,
        imageGenerationPrompt: promptTemplates.get("IMAGE_GENERATION")?.content || DEFAULT_IMAGE_GENERATION_PROMPT,
        imageSafetyPrompt: promptTemplates.get("IMAGE_SAFETY")?.content || DEFAULT_IMAGE_SAFETY_PROMPT,
        governedPrompts,
        promptDefinitions: promptDefinitions.rows,
        channelDefinitions,
        complianceRules,
        promptAuditTrail,
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    console.error("Failed to retrieve compliance prompts:", error);
    return NextResponse.json(
      { error: error.message || "Failed to retrieve prompts" },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  try {
    const sessionUser = await requirePermission("PROMPT_MANAGE");
    const body = await req.json();
    const {
      orgId,
      scope = "organization",
      customSystemPrompt,
      clinicalRefinerPrompt,
      imageGenerationPrompt,
      imageSafetyPrompt,
      defaultDisclaimer,
      preferredTone,
      callToAction,
      governedPrompts,
      channels,
    } = body;

    if (!orgId) {
      return NextResponse.json({ error: "orgId is required" }, { status: 400 });
    }
    await requireOrganizationAccess(orgId);
    if (!['organization', 'global'].includes(scope)) {
      return NextResponse.json({ error: "Invalid prompt scope." }, { status: 400 });
    }
    if (scope === "global" && !sessionUser.isSuperAdmin) {
      return NextResponse.json({ error: "Only Super Admin can edit global prompts." }, { status: 403 });
    }

    let updatedOrg: any = null;
    if (scope === "organization") {
      const previousOrg = (await query<any>(`SELECT "customSystemPrompt", "defaultDisclaimer", "preferredTone", "callToAction" FROM macula.organizations WHERE id=$1 LIMIT 1`, [orgId])).rows[0];
      const { rows: updatedOrgRows } = await query(`UPDATE macula.organizations SET "customSystemPrompt"=$1, "defaultDisclaimer"=$2, "preferredTone"=$3, "callToAction"=$4, "updatedAt"=NOW() WHERE id=$5 RETURNING *`, [customSystemPrompt?.trim() || null, defaultDisclaimer, preferredTone?.trim() || null, callToAction?.trim() || null, orgId]);
      updatedOrg = updatedOrgRows[0];
      const changedFields = ["customSystemPrompt", "defaultDisclaimer", "preferredTone", "callToAction"].filter((field) => (previousOrg?.[field] || null) !== (updatedOrg?.[field] || null));
      if (changedFields.length > 0) {
        await recordAudit({ organizationId: orgId, actorId: sessionUser.id, action: "PROMPT_SETTINGS_UPDATED", targetType: "PROMPT_SETTINGS", targetId: orgId, detail: "Updated organization AI and publishing settings.", metadata: { scope, changedFields } });
      }
    }

    const promptEntries = Array.isArray(governedPrompts)
      ? governedPrompts
      : [["CLINICAL_REFINER", clinicalRefinerPrompt], ["IMAGE_GENERATION", imageGenerationPrompt], ["IMAGE_SAFETY", imageSafetyPrompt]].map(([promptKey, content]) => ({ promptKey, content }));
    for (const promptEntry of promptEntries) {
      const { promptKey, content, resetToGlobal } = promptEntry;
      if (typeof content !== "string" || !content.trim()) continue;
      const normalizedContent = content.trim();
      const master = (await query<any>(`SELECT * FROM macula.ai_prompt_templates WHERE "organizationId" IS NULL AND "promptKey"=$1 AND "isActive"=TRUE ORDER BY version DESC LIMIT 1`, [promptKey])).rows[0];
      const targetOrganizationId = scope === "global" ? null : orgId;
      const current = (await query<any>(`SELECT * FROM macula.ai_prompt_templates WHERE "organizationId" IS NOT DISTINCT FROM $1 AND "promptKey"=$2 AND "isActive"=TRUE ORDER BY version DESC LIMIT 1`, [targetOrganizationId, promptKey])).rows[0];
      if (scope === "organization" && (resetToGlobal === true || master?.content?.trim() === normalizedContent)) {
        if (current) {
          await query(`UPDATE macula.ai_prompt_templates SET "isActive"=FALSE, "updatedAt"=NOW() WHERE id=$1`, [current.id]);
          await recordAudit({ organizationId: orgId, actorId: sessionUser.id, action: "PROMPT_OVERRIDE_RESET", targetType: "AI_PROMPT", targetId: promptKey, detail: `Reset ${promptKey} to the global default.`, metadata: { scope, promptKey, previousVersion: current.version, previousHash: crypto.createHash("sha256").update(current.content).digest("hex") } });
        }
        continue;
      }
      if (current?.content?.trim() === normalizedContent) continue;
      if (current) await query(`UPDATE macula.ai_prompt_templates SET "isActive"=FALSE, "updatedAt"=NOW() WHERE id=$1`, [current.id]);
      const definition = (await query<{ id: string }>(`SELECT id FROM macula.ai_prompt_definitions WHERE "promptKey"=$1 LIMIT 1`, [promptKey])).rows[0];
      const nextVersion = Math.max(current?.version || 0, master?.version || 0) + 1;
      const nextId = crypto.randomUUID();
      await query(`INSERT INTO macula.ai_prompt_templates (id, "promptKey", content, version, "isActive", "organizationId", "definitionId") VALUES ($1,$2,$3,$4,TRUE,$5,$6)`, [nextId, promptKey, normalizedContent, nextVersion, targetOrganizationId, definition?.id || null]);
      await recordAudit({ organizationId: orgId, actorId: sessionUser.id, action: scope === "global" ? "GLOBAL_PROMPT_UPDATED" : "PROMPT_OVERRIDE_UPDATED", targetType: "AI_PROMPT", targetId: nextId, detail: `Published ${promptKey} version ${nextVersion}.`, metadata: { scope, promptKey, previousVersion: current?.version || null, newVersion: nextVersion, previousHash: current?.content ? crypto.createHash("sha256").update(current.content).digest("hex") : null, newHash: crypto.createHash("sha256").update(normalizedContent).digest("hex") } });
    }

    if (Array.isArray(channels)) {
      for (const ch of channels) {
        if (!ch.channelKey || typeof ch.systemPrompt !== "string" || !ch.systemPrompt.trim()) continue;
        const globalChannel = (await query<any>(`SELECT * FROM macula.channel_definitions WHERE "organizationId" IS NULL AND "channelKey"=$1 ORDER BY "updatedAt" DESC LIMIT 1`, [ch.channelKey])).rows[0];
        const targetOrganizationId = scope === "global" ? null : orgId;
        const current = (await query<any>(`SELECT * FROM macula.channel_definitions WHERE "organizationId" IS NOT DISTINCT FROM $1 AND "channelKey"=$2 ORDER BY "updatedAt" DESC LIMIT 1`, [targetOrganizationId, ch.channelKey])).rows[0];
        if (scope === "organization" && (ch.resetToGlobal === true || globalChannel?.systemPrompt?.trim() === ch.systemPrompt.trim())) {
          if (current) {
            await query(`DELETE FROM macula.channel_definitions WHERE id=$1`, [current.id]);
            await recordAudit({ organizationId: orgId, actorId: sessionUser.id, action: "CHANNEL_PROMPT_OVERRIDE_RESET", targetType: "CHANNEL_PROMPT", targetId: ch.channelKey, detail: `Reset ${ch.channelKey} to the global default.`, metadata: { scope, channelKey: ch.channelKey, previousVersion: current.promptVersion } });
          }
          continue;
        }
        if (current?.systemPrompt?.trim() === ch.systemPrompt.trim()) continue;
        const nextVersion = (current?.promptVersion || globalChannel?.promptVersion || 0) + 1;
        let targetId = current?.id;
        if (current) {
          await query(`UPDATE macula.channel_definitions SET "systemPrompt"=$1, "promptVersion"=$2, "displayName"=$3, "targetAudience"=$4, "updatedAt"=NOW() WHERE id=$5`, [ch.systemPrompt.trim(), nextVersion, ch.displayName, ch.targetAudience, current.id]);
        } else if (globalChannel) {
          targetId = crypto.randomUUID();
          await query(`INSERT INTO macula.channel_definitions (id, "channelKey", "displayName", "outputType", "targetAudience", "systemPrompt", "promptVersion", "wordCountMin", "wordCountMax", "durationLabel", "isActive", "organizationId") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,TRUE,$11)`, [targetId, globalChannel.channelKey, ch.displayName || globalChannel.displayName, globalChannel.outputType, ch.targetAudience || globalChannel.targetAudience, ch.systemPrompt.trim(), nextVersion, globalChannel.wordCountMin, globalChannel.wordCountMax, globalChannel.durationLabel, targetOrganizationId]);
        }
        await recordAudit({ organizationId: orgId, actorId: sessionUser.id, action: scope === "global" ? "GLOBAL_CHANNEL_PROMPT_UPDATED" : "CHANNEL_PROMPT_OVERRIDE_UPDATED", targetType: "CHANNEL_PROMPT", targetId: targetId || ch.channelKey, detail: `Published ${ch.channelKey} version ${nextVersion}.`, metadata: { scope, channelKey: ch.channelKey, previousVersion: current?.promptVersion || null, newVersion: nextVersion } });
      }
    }

    return NextResponse.json({
      success: true,
      message: "Compliance system prompts successfully persisted to database.",
      updatedOrg,
    });
  } catch (error: any) {
    console.error("Failed to update compliance prompts:", error);
    return NextResponse.json(
      { error: error.message || "Failed to persist prompts" },
      { status: 500 }
    );
  }
}
