import { NextResponse } from "next/server";
import { db } from "@/lib/db";

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
      },
    });

    if (!organization) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    // Default refiner template if not customized
    const defaultRefinerPrompt = `You are an expert clinical documentation and medical transcription refiner for healthcare practitioners.

Your task:
1. Receive raw, phonetically transcribed speech-to-text from an ASR model.
2. Correct misrecognized clinical terminology, anatomical names, surgical procedures, and brand/generic drug names with standard medical spellings (e.g., "met for min" -> "Metformin", "apendecktomy" -> "appendectomy").
3. Fix punctuation, paragraph breaks, and capitalization of standard medical acronyms (e.g., BP, ECG, SpO2, PR, HbA1c).
4. Strictly DO NOT hallucinate, diagnose, infer unstated labs, or invent clinical details that were not in the dictation.
5. Output ONLY the refined clinical dictation narrative in clean markdown paragraphs. Do not add conversational intro or outro.`;

    return NextResponse.json({
      success: true,
      data: {
        orgId: organization.id,
        orgName: organization.name,
        customSystemPrompt: organization.customSystemPrompt || "",
        defaultDisclaimer: organization.defaultDisclaimer,
        clinicalRefinerPrompt: defaultRefinerPrompt,
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
        defaultDisclaimer,
      },
    });

    // Update channel definitions if provided
    if (Array.isArray(channels)) {
      for (const ch of channels) {
        if (ch.id) {
          await db.channelDefinition.update({
            where: { id: ch.id },
            data: {
              systemPrompt: ch.systemPrompt,
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
