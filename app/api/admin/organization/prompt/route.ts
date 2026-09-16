import { NextResponse } from "next/server";
import { requireOrganizationAccess, requireAuthenticatedUser } from "@/lib/tenant-auth";
import { query } from "@/lib/worker-db";

export async function GET(req: Request) {
  try {
    const user = await requireAuthenticatedUser();
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get("orgId") || user?.organizationId;
    if (!orgId) return NextResponse.json({ error: "Organization ID is required." }, { status: 400 });
    await requireOrganizationAccess(orgId);

    const [{ rows: defaults }, { rows: organizations }] = await Promise.all([
      query<{ content: string }>(`SELECT content FROM macula.macula_platform_templates WHERE slug = 'CLINICAL_SYNTHESIS_DEFAULT' LIMIT 1`),
      query<any>(`SELECT * FROM macula.macula_organizations WHERE id = $1 LIMIT 1`, [orgId]),
    ]);
    const globalDefault = defaults[0];
    const organization = organizations[0];

    if (!organization) {
      return NextResponse.json({ error: "Organization not found." }, { status: 404 });
    }

    const defaultContent = globalDefault?.content || "";

    return NextResponse.json({
      orgId: organization.id,
      orgName: organization.name,
      prompt: organization.customSystemPrompt || defaultContent,
      defaultPrompt: defaultContent,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireAuthenticatedUser();
    const { orgId, prompt } = await req.json();

    if (!orgId || !prompt) {
      return NextResponse.json(
        { error: "Organization ID and prompt are required." },
        { status: 400 }
      );
    }
    await requireOrganizationAccess(orgId);

    const { rows } = await query(`UPDATE macula.macula_organizations SET "customSystemPrompt" = $1, "updatedAt" = NOW() WHERE id = $2 RETURNING "customSystemPrompt"`, [prompt, orgId]);
    const updated = rows[0];

    return NextResponse.json({ success: true, prompt: updated.customSystemPrompt });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
