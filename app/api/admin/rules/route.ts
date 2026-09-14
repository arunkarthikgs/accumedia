import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const [rules, channels] = await Promise.all([
      db.complianceRule.findMany({ orderBy: { createdAt: "desc" } }),
      db.channelDefinition.findMany({ orderBy: { createdAt: "desc" } }),
    ]);
    return NextResponse.json({ rules, channels });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { type, data } = await req.json();

    if (type === "RULE") {
      const rule = await db.complianceRule.create({
        data: {
          ruleType: data.ruleType,
          patternOrCheck: data.patternOrCheck,
          description: data.description,
          severity: data.severity,
        },
      });
      return NextResponse.json({ rule }, { status: 201 });
    }

    if (type === "CHANNEL") {
      const channel = await db.channelDefinition.create({
        data: {
          channelKey: data.channelKey,
          displayName: data.displayName,
          targetAudience: data.targetAudience,
          systemPrompt: data.systemPrompt,
        },
      });
      return NextResponse.json({ channel }, { status: 201 });
    }

    return NextResponse.json({ error: "Invalid entity type" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
