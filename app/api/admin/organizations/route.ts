import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const organizations = await db.organization.findMany({
      include: {
        _count: {
          select: {
            users: true,
            cases: true,
            recordings: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, organizations });
  } catch (error: any) {
    console.error("Fetch organizations error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch organizations." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      name,
      slug,
      brandingHex,
      preferredAsrModel,
      customSystemPrompt,
      defaultDisclaimer,
    } = body;

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: "Organization name is required." },
        { status: 400 }
      );
    }

    const cleanSlug = (slug || name)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    const existing = await db.organization.findUnique({
      where: { slug: cleanSlug },
    });

    if (existing) {
      return NextResponse.json(
        { error: "An organization with this slug/identifier already exists." },
        { status: 400 }
      );
    }

    const org = await db.organization.create({
      data: {
        name: name.trim(),
        slug: cleanSlug,
        brandingHex: brandingHex?.trim() || "#0f766e",
        preferredAsrModel: preferredAsrModel || "whisper-1",
        customSystemPrompt: customSystemPrompt?.trim() || null,
        defaultDisclaimer:
          defaultDisclaimer?.trim() ||
          "This clinical summary is generated under NMC registered medical practitioner supervision.",
      },
    });

    return NextResponse.json({ success: true, organization: org });
  } catch (error: any) {
    console.error("Create organization error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create organization." },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const {
      id,
      name,
      slug,
      brandingHex,
      preferredAsrModel,
      customSystemPrompt,
      defaultDisclaimer,
    } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Organization ID is required." },
        { status: 400 }
      );
    }

    const updated = await db.organization.update({
      where: { id },
      data: {
        name: name?.trim(),
        slug: slug?.trim(),
        brandingHex: brandingHex?.trim() || "#0f766e",
        preferredAsrModel: preferredAsrModel || "whisper-1",
        customSystemPrompt: customSystemPrompt?.trim() || null,
        defaultDisclaimer: defaultDisclaimer?.trim(),
      },
    });

    return NextResponse.json({ success: true, organization: updated });
  } catch (error: any) {
    console.error("Update organization error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update organization." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    if (!body.organizationId) return NextResponse.json({ error: "Organization ID is required." }, { status: 400 });
    const updated = await db.organization.update({
      where: { id: body.organizationId },
      data: {
        name: body.name?.trim(),
        brandingHex: body.brandingHex?.trim(),
        logoUrl: body.logoUrl?.trim() || null,
        brandFont: body.brandFont?.trim() || "Arial",
        brandTagline: body.brandTagline?.trim() || null,
        defaultDisclaimer: body.defaultDisclaimer?.trim(),
      },
    });
    return NextResponse.json({ success: true, organization: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to update brand settings." }, { status: 500 });
  }
}
