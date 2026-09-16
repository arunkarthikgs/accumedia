import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuthenticatedUser } from "@/lib/tenant-auth";

export async function GET() {
  try {
    const user = await requireAuthenticatedUser();
    const organizationScope = user?.isSuperAdmin
      ? undefined
      : user?.organizationId
        ? { OR: [{ organizationId: null }, { organizationId: user.organizationId }] }
        : { organizationId: "__no_organization__" };
    const [rules, channels] = await Promise.all([
      db.complianceRule.findMany({ where: organizationScope, orderBy: { createdAt: "desc" } }),
      db.channelDefinition.findMany({ where: organizationScope, orderBy: { createdAt: "desc" } }),
    ]);
    return NextResponse.json({ rules, channels });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireAuthenticatedUser();
    const { type, data } = await req.json();
    const organizationId = user?.isSuperAdmin ? data.organizationId || null : user?.organizationId;
    if (!organizationId && !user?.isSuperAdmin) return NextResponse.json({ error: "User is not assigned to an organization." }, { status: 400 });

    if (type === "RULE") {
      const rule = await db.complianceRule.create({
        data: {
          ruleType: data.ruleType,
          patternOrCheck: data.patternOrCheck,
          description: data.description,
          severity: data.severity,
          organizationId,
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
          organizationId,
        },
      });
      return NextResponse.json({ channel }, { status: 201 });
    }

    return NextResponse.json({ error: "Invalid entity type" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
