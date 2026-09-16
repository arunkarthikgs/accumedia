import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrganizationAccess, requireAuthenticatedUser } from "@/lib/tenant-auth";

export async function GET(req: Request) {
  try {
    const user = await requireAuthenticatedUser();
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get("orgId") || user?.organizationId;
    if (!orgId) return NextResponse.json({ error: "Organization ID is required." }, { status: 400 });
    await requireOrganizationAccess(orgId);

    const [globalDefault, organization] = await Promise.all([
      db.platformTemplate.findUnique({
        where: { slug: "CLINICAL_SYNTHESIS_DEFAULT" },
      }),
      db.organization.findUnique({ where: { id: orgId } }),
    ]);

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

    const updated = await db.organization.update({
      where: { id: orgId },
      data: { customSystemPrompt: prompt },
    });

    return NextResponse.json({ success: true, prompt: updated.customSystemPrompt });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
