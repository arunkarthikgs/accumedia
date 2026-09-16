import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/tenant-auth";
import { query } from "@/lib/worker-db";
import crypto from "node:crypto";

export async function GET() {
  try {
    const user = await requireAuthenticatedUser();
    const scope = user?.isSuperAdmin ? null : user?.organizationId;
    const [{ rows: rules }, { rows: channels }] = await Promise.all([
      query(`SELECT * FROM macula.macula_compliance_rules WHERE ($1::text IS NULL OR "organizationId" IS NULL OR "organizationId" = $1) ORDER BY "createdAt" DESC`, [scope]),
      query(`SELECT * FROM macula.macula_channel_definitions WHERE ($1::text IS NULL OR "organizationId" IS NULL OR "organizationId" = $1) ORDER BY "createdAt" DESC`, [scope]),
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
      const { rows } = await query(`INSERT INTO macula.macula_compliance_rules (id, "ruleType", "patternOrCheck", description, severity, "organizationId") VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`, [crypto.randomUUID(), data.ruleType, data.patternOrCheck, data.description, data.severity, organizationId]);
      const rule = rows[0];
      return NextResponse.json({ rule }, { status: 201 });
    }

    if (type === "CHANNEL") {
      const { rows } = await query(`INSERT INTO macula.macula_channel_definitions (id, "channelKey", "displayName", "targetAudience", "systemPrompt", "organizationId") VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`, [crypto.randomUUID(), data.channelKey, data.displayName, data.targetAudience, data.systemPrompt, organizationId]);
      const channel = rows[0];
      return NextResponse.json({ channel }, { status: 201 });
    }

    return NextResponse.json({ error: "Invalid entity type" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
