import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get("orgId");

    const [globalDefault, organization] = await Promise.all([
      db.platformTemplate.findUnique({
        where: { slug: "CLINICAL_SYNTHESIS_DEFAULT" },
      }),
      orgId
        ? db.organization.findUnique({ where: { id: orgId } })
        : db.organization.findFirst({ orderBy: { createdAt: "asc" } }),
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
    const { orgId, prompt } = await req.json();

    if (!orgId || !prompt) {
      return NextResponse.json(
        { error: "Organization ID and prompt are required." },
        { status: 400 }
      );
    }

    const updated = await db.organization.update({
      where: { id: orgId },
      data: { customSystemPrompt: prompt },
    });

    return NextResponse.json({ success: true, prompt: updated.customSystemPrompt });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
