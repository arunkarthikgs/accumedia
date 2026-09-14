import { NextResponse } from "next/server";
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

export async function POST(req: Request) {
  try {
    let rawText: string | undefined;
    let physicianId: string | undefined;
    let organizationId: string | undefined;

    const contentType = req.headers.get("content-type") || "";

    // 1. Resilient Body Parsing (supports raw JSON, stringified text, or FormData)
    if (contentType.includes("application/json")) {
      const body = await req.json();
      rawText = body.rawText;
      physicianId = body.physicianId;
      organizationId = body.organizationId;
    } else if (
      contentType.includes("multipart/form-data") ||
      contentType.includes("application/x-www-form-urlencoded")
    ) {
      const formData = await req.formData();
      rawText = (formData.get("rawText") as string) || undefined;
      physicianId = (formData.get("physicianId") as string) || undefined;
      organizationId = (formData.get("organizationId") as string) || undefined;
    } else {
      const text = await req.text();
      try {
        const body = JSON.parse(text);
        rawText = body.rawText;
        physicianId = body.physicianId;
        organizationId = body.organizationId;
      } catch {
        return NextResponse.json(
          { error: "Invalid payload format. Expected application/json or FormData." },
          { status: 400 }
        );
      }
    }

    if (!rawText || !rawText.trim()) {
      return NextResponse.json(
        { error: "Raw clinical narrative is required." },
        { status: 400 }
      );
    }

    // 2. Resolve Organization (fallback to first DB organization if omitted)
    let targetOrgId = organizationId;
    if (!targetOrgId) {
      const defaultOrg = await db.organization.findFirst({
        orderBy: { createdAt: "asc" },
      });
      targetOrgId = defaultOrg?.id;
    }

    if (!targetOrgId) {
      return NextResponse.json(
        { error: "No healthcare organization registered in system." },
        { status: 404 }
      );
    }

    // 3. Fetch Organization, Rules, Channels & Baseline Template from DB
    const [organization, complianceRules, channelConfigs, defaultTemplate] = await Promise.all([
      db.organization.findUnique({
        where: { id: targetOrgId },
      }),
      db.complianceRule.findMany({
        where: {
          isActive: true,
          OR: [{ organizationId: targetOrgId }, { organizationId: null }],
        },
      }),
      db.channelDefinition.findMany({
        where: {
          isActive: true,
          OR: [{ organizationId: targetOrgId }, { organizationId: null }],
        },
      }),
      db.platformTemplate.findUnique({
        where: { slug: "CLINICAL_SYNTHESIS_DEFAULT" },
      }),
    ]);

    if (!organization) {
      return NextResponse.json({ error: "Hospital organization not found." }, { status: 404 });
    }

    // 4. Resolve Master System Prompt from DB
    const resolvedMasterPrompt =
      organization.customSystemPrompt ||
      defaultTemplate?.content ||
      "You are a clinical synthesis engine. De-identify all PHI and produce objective clinical outputs.";

    // 5. Pre-LLM Regex Redaction using patterns stored in DB
    let sanitizedText = rawText;
    const redactionManifest: Array<{ rule: string; matchCount: number }> = [];

    for (const rule of complianceRules.filter((r) => r.ruleType === "DPDP_REDACTION")) {
      try {
        const regex = new RegExp(rule.patternOrCheck, "gi");
        const matches = sanitizedText.match(regex);
        if (matches && matches.length > 0) {
          redactionManifest.push({ rule: rule.description, matchCount: matches.length });
          sanitizedText = sanitizedText.replace(regex, "[REDACTED_PHI]");
        }
      } catch (e) {
        console.warn(`Invalid regex check in rule ${rule.id}:`, e);
      }
    }

    // 6. Assemble dynamic statutory clauses and target channels
    const prohibitionGuidelines = complianceRules
      .filter((r) => r.ruleType === "NMC_PROHIBITION")
      .map((r) => `- ${r.description}`)
      .join("\n");

    const channelFormatGuidance = channelConfigs
      .map(
        (c) =>
          `Channel: ${c.channelKey} (${c.displayName}, Target: ${c.targetAudience})\nDirectives: ${c.systemPrompt}`
      )
      .join("\n\n");

    const dynamicSystemPrompt = `
${resolvedMasterPrompt}

INSTITUTION DETAILS:
Entity: ${organization.name}
Mandated Regulatory Disclaimer: "${organization.defaultDisclaimer}"

ACTIVE STATUTORY PROHIBITIONS (FROM DB REGISTRY):
${prohibitionGuidelines || "Strictly prohibit superlative advertising, commercial solicitation, and guaranteed cure claims."}

OUTPUT CHANNELS SPECIFICATION (FROM DB REGISTRY):
${channelFormatGuidance || "Generate structured case summary and patient guidance."}
`;

    // 7. Synthesize with GPT-4o
    const schema = z.object({
      title: z.string().describe("Descriptive de-identified clinical title"),
      masterRecord: z.object({
        presentation: z.string(),
        clinicalFindings: z.string(),
        investigations: z.string(),
        management: z.string(),
        outcome: z.string(),
      }),
      safetyAudit: z.object({
        phiDetected: z.array(z.string()),
        nmcFlaggedPhrases: z.array(z.string()),
        complianceScore: z.number().min(0).max(100),
      }),
      generatedAssets: z.array(
        z.object({
          channelKey: z.string(),
          channelName: z.string(),
          content: z.record(z.string(), z.any()),
        })
      ),
    });

    const { object } = await generateObject({
      model: openai("gpt-4o"),
      schema,
      system: dynamicSystemPrompt,
      prompt: `Synthesize this raw clinical case note:\n\n${sanitizedText}`,
    });

    // 8. Resolve Assigned Physician
    const fallbackUser = await db.user.findFirst({
      where: { organizationId: targetOrgId },
      orderBy: { createdAt: "asc" },
    });
    const assignedPhysicianId = physicianId || fallbackUser?.id;

    if (!assignedPhysicianId) {
      return NextResponse.json(
        { error: "No authorized physician found to associate with this case." },
        { status: 400 }
      );
    }

    // 9. Persist Synthesized Case and Omnichannel Assets to DB
    const savedCase = await db.case.create({
      data: {
        title: object.title,
        rawInput: rawText,
        masterRecord: object.masterRecord as Prisma.InputJsonValue,
        safetyAudit: {
          ...object.safetyAudit,
          preRedactionManifest: redactionManifest,
        } as Prisma.InputJsonValue,
        status: "PENDING_REVIEW",
        physicianId: assignedPhysicianId,
        organizationId: targetOrgId,
        assets: {
          create: object.generatedAssets.map((asset) => ({
            channelKey: asset.channelKey,
            channelName: asset.channelName,
            content: asset.content as Prisma.InputJsonValue,
          })),
        },
      },
      include: {
        assets: true,
        physician: true,
      },
    });

    return NextResponse.json({ success: true, case: savedCase });
  } catch (error: any) {
    console.error("Synthesis error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
