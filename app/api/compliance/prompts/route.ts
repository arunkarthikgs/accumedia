import { NextResponse } from "next/server";
import { DEFAULT_CLINICAL_REFINER_PROMPT } from "@/lib/clinical-refiner";
import { DEFAULT_IMAGE_GENERATION_PROMPT, DEFAULT_IMAGE_SAFETY_PROMPT } from "@/lib/image-prompts";
import { getResolvedAiPrompts } from "@/lib/ai-prompts";
import { requireAuthenticatedUser, requireOrganizationAccess } from "@/lib/tenant-auth";
import { query } from "@/lib/worker-db";
import crypto from "node:crypto";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireAuthenticatedUser();
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

    const [promptTemplates, promptDefinitions] = await Promise.all([
      getResolvedAiPrompts(organization.id),
      query(`SELECT * FROM macula.ai_prompt_definitions ORDER BY "promptKey" ASC`),
    ]);
    const { rows: channelDefinitions } = await query(`SELECT * FROM macula.channel_definitions WHERE "organizationId" = $1 ORDER BY "createdAt" ASC`, [orgId]);
    const { rows: complianceRules } = await query(`SELECT * FROM macula.compliance_rules WHERE "organizationId" = $1 AND "isActive" = TRUE`, [orgId]);
    const imagePromptVersions = [...promptTemplates.values()];
    return NextResponse.json({
      success: true,
      data: {
        orgId: organization.id,
        orgName: organization.name,
        customSystemPrompt: organization.customSystemPrompt || "",
        defaultDisclaimer: organization.defaultDisclaimer,
        clinicalRefinerPrompt: promptTemplates.get("CLINICAL_REFINER")?.content || DEFAULT_CLINICAL_REFINER_PROMPT,
        imageGenerationPrompt: promptTemplates.get("IMAGE_GENERATION")?.content || DEFAULT_IMAGE_GENERATION_PROMPT,
        imageSafetyPrompt: promptTemplates.get("IMAGE_SAFETY")?.content || DEFAULT_IMAGE_SAFETY_PROMPT,
        imagePromptVersions,
        promptDefinitions: promptDefinitions.rows,
        channelDefinitions,
        complianceRules,
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
    const sessionUser = await requireAuthenticatedUser();
    const body = await req.json();
    const {
      orgId,
      userId,
      customSystemPrompt,
      clinicalRefinerPrompt,
      imageGenerationPrompt,
      imageSafetyPrompt,
      defaultDisclaimer,
      channels,
    } = body;

    if (!orgId) {
      return NextResponse.json({ error: "orgId is required" }, { status: 400 });
    }
    await requireOrganizationAccess(orgId);

    // Verify authorized compliance or admin user role
    const allowedRoles = ["ADMIN", "COMPLIANCE_OFFICER"];
    const roleSlug = sessionUser?.role?.slug?.toLowerCase();
    const hasAllowedRole = sessionUser?.isSuperAdmin ||
      (sessionUser?.role?.slug && ["admin", "compliance-officer"].includes(roleSlug || "")) ||
      (sessionUser?.role && allowedRoles.includes(sessionUser.role.slug));
    if (!hasAllowedRole) {
      return NextResponse.json(
        { error: "Access Denied: Only Compliance Officers and Admins can update system prompts." },
        { status: 403 }
      );
    }

    // Organization-level system prompt and disclaimer remain separate settings.
    const { rows: updatedOrgRows } = await query(`UPDATE macula.organizations SET "customSystemPrompt"=$1, "clinicalRefinerPrompt"=$2, "defaultDisclaimer"=$3, "updatedAt"=NOW() WHERE id=$4 RETURNING *`, [customSystemPrompt, clinicalRefinerPrompt?.trim() || null, defaultDisclaimer, orgId]);
    const updatedOrg = updatedOrgRows[0];

    for (const [promptKey, content] of [["CLINICAL_REFINER", clinicalRefinerPrompt], ["IMAGE_GENERATION", imageGenerationPrompt], ["IMAGE_SAFETY", imageSafetyPrompt]] as const) {
      if (typeof content !== "string" || !content.trim()) continue;
      const normalizedContent = content.trim();
      const master = (await query<any>(`SELECT * FROM macula.ai_prompt_templates WHERE "organizationId" IS NULL AND "promptKey"=$1 AND "isActive"=TRUE ORDER BY version DESC LIMIT 1`, [promptKey])).rows[0];
      const current = (await query<any>(`SELECT * FROM macula.ai_prompt_templates WHERE "organizationId"=$1 AND "promptKey"=$2 AND "isActive"=TRUE ORDER BY version DESC LIMIT 1`, [orgId, promptKey])).rows[0];
      if (master?.content === normalizedContent) {
        await query(`UPDATE macula.ai_prompt_templates SET "isActive"=FALSE, "updatedAt"=NOW() WHERE "organizationId"=$1 AND "promptKey"=$2 AND "isActive"=TRUE`, [orgId, promptKey]);
        continue;
      }
      if (current?.content === normalizedContent) continue;
      await query(`UPDATE macula.ai_prompt_templates SET "isActive"=FALSE, "updatedAt"=NOW() WHERE "organizationId"=$1 AND "promptKey"=$2 AND "isActive"=TRUE`, [orgId, promptKey]);
      await query(`INSERT INTO macula.ai_prompt_templates (id, "promptKey", content, version, "isActive", "organizationId") VALUES ($1,$2,$3,$4,TRUE,$5)`, [crypto.randomUUID(), promptKey, normalizedContent, (current?.version || master?.version || 0) + 1, orgId]);
    }

    // Update channel definitions if provided
    if (Array.isArray(channels)) {
      for (const ch of channels) {
        if (ch.id) {
          await query(`UPDATE macula.channel_definitions SET "systemPrompt"=$1, "promptVersion"="promptVersion"+1, "displayName"=$2, "targetAudience"=$3, "isActive"=$4, "updatedAt"=NOW() WHERE id=$5 AND "organizationId"=$6`, [ch.systemPrompt, ch.displayName, ch.targetAudience, ch.isActive ?? true, ch.id, orgId]);
        }
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
