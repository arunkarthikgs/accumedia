import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { DEFAULT_CLINICAL_REFINER_PROMPT } from "@/lib/clinical-refiner";
import { DEFAULT_IMAGE_GENERATION_PROMPT, DEFAULT_IMAGE_SAFETY_PROMPT } from "@/lib/image-prompts";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get("orgId");

    if (!orgId) {
      return NextResponse.json({ error: "orgId is required" }, { status: 400 });
    }

    const organization = await db.organization.findUnique({
      where: { id: orgId },
      include: {
        channelDefinitions: {
          orderBy: { createdAt: "asc" },
        },
        complianceRules: {
          where: { isActive: true },
        },
        aiPromptTemplates: {
          where: { isActive: true },
          orderBy: { version: "desc" },
        },
      },
    });

    if (!organization) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    // Default refiner template if not customized
    return NextResponse.json({
      success: true,
      data: {
        orgId: organization.id,
        orgName: organization.name,
        customSystemPrompt: organization.customSystemPrompt || "",
        defaultDisclaimer: organization.defaultDisclaimer,
        clinicalRefinerPrompt: organization.clinicalRefinerPrompt || DEFAULT_CLINICAL_REFINER_PROMPT,
        imageGenerationPrompt: organization.aiPromptTemplates.find((prompt) => prompt.promptKey === "IMAGE_GENERATION")?.content || DEFAULT_IMAGE_GENERATION_PROMPT,
        imageSafetyPrompt: organization.aiPromptTemplates.find((prompt) => prompt.promptKey === "IMAGE_SAFETY")?.content || DEFAULT_IMAGE_SAFETY_PROMPT,
        imagePromptVersions: organization.aiPromptTemplates,
        channelDefinitions: organization.channelDefinitions,
        complianceRules: organization.complianceRules,
      },
    });
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

    // Verify authorized compliance or admin user role
    if (userId) {
      const user = await db.user.findUnique({
        where: { id: userId },
        include: { assignedRole: true },
      });

      const allowedRoles = ["ADMIN", "COMPLIANCE_OFFICER"];
      const hasAllowedRole =
        (user?.role && allowedRoles.includes(user.role)) ||
        (user?.assignedRole?.slug && ["admin", "compliance-officer"].includes(user.assignedRole.slug)) ||
        user?.isSuperAdmin;

      if (!hasAllowedRole) {
        return NextResponse.json(
          { error: "Access Denied: Only Compliance Officers and Admins can update system prompts." },
          { status: 403 }
        );
      }
    }

    // Update organization-level clinical prompts and disclaimers
    const updatedOrg = await db.organization.update({
      where: { id: orgId },
      data: {
        customSystemPrompt,
        clinicalRefinerPrompt: clinicalRefinerPrompt?.trim() || null,
        defaultDisclaimer,
      },
    });

    for (const [promptKey, content] of [["IMAGE_GENERATION", imageGenerationPrompt], ["IMAGE_SAFETY", imageSafetyPrompt]] as const) {
      if (typeof content !== "string" || !content.trim()) continue;
      const current = await db.aiPromptTemplate.findFirst({ where: { organizationId: orgId, promptKey, isActive: true }, orderBy: { version: "desc" } });
      await db.aiPromptTemplate.updateMany({ where: { organizationId: orgId, promptKey, isActive: true }, data: { isActive: false } });
      await db.aiPromptTemplate.create({ data: { organizationId: orgId, promptKey, content: content.trim(), version: (current?.version || 0) + 1, isActive: true } });
    }

    // Update channel definitions if provided
    if (Array.isArray(channels)) {
      for (const ch of channels) {
        if (ch.id) {
          await db.channelDefinition.update({
            where: { id: ch.id },
            data: {
              systemPrompt: ch.systemPrompt,
              promptVersion: { increment: 1 },
              displayName: ch.displayName,
              targetAudience: ch.targetAudience,
              isActive: ch.isActive ?? true,
            },
          });
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
