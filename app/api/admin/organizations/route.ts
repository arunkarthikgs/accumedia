import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuthenticatedUser, requireOrganizationAccess } from "@/lib/tenant-auth";

export async function GET() {
  try {
    const user = await requireAuthenticatedUser();
    const organizations = await db.organization.findMany({
      where: user?.isSuperAdmin ? undefined : user?.organizationId ? { id: user.organizationId } : { id: "__no_organization__" },
      select: {
        id: true,
        name: true,
        slug: true,
        brandingHex: true,
        logoUrl: true,
        brandFont: true,
        brandTagline: true,
        location: true,
        websiteUrl: true,
        linkedinUrl: true,
        facebookUrl: true,
        instagramUrl: true,
        xUrl: true,
        youtubeUrl: true,
        contactEmail: true,
        contactPhone: true,
        preferredTone: true,
        callToAction: true,
        hospitalPhotoUrls: true,
        preferredAsrModel: true,
        customSystemPrompt: true,
        defaultDisclaimer: true,
        createdAt: true,
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

    return NextResponse.json({ success: true, organizations, isSuperAdmin: Boolean(user?.isSuperAdmin) });
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
    const user = await requireAuthenticatedUser();
    const body = await req.json();
    const {
      name,
      slug,
      brandingHex,
      preferredAsrModel,
      customSystemPrompt,
      defaultDisclaimer,
      logoUrl,
      brandFont,
      brandTagline,
      location,
      websiteUrl,
      linkedinUrl,
      facebookUrl,
      instagramUrl,
      xUrl,
      youtubeUrl,
      contactEmail,
      contactPhone,
      preferredTone,
      callToAction,
      hospitalPhotoUrls,
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
        preferredAsrModel: user?.isSuperAdmin ? preferredAsrModel || "whisper-1" : "whisper-1",
        customSystemPrompt: customSystemPrompt?.trim() || null,
        logoUrl: logoUrl?.trim() || null,
        brandFont: brandFont?.trim() || "Arial",
        brandTagline: brandTagline?.trim() || null,
        location: location?.trim() || null,
        websiteUrl: websiteUrl?.trim() || null,
        linkedinUrl: linkedinUrl?.trim() || null,
        facebookUrl: facebookUrl?.trim() || null,
        instagramUrl: instagramUrl?.trim() || null,
        xUrl: xUrl?.trim() || null,
        youtubeUrl: youtubeUrl?.trim() || null,
        contactEmail: contactEmail?.trim() || null,
        contactPhone: contactPhone?.trim() || null,
        preferredTone: preferredTone?.trim() || null,
        callToAction: callToAction?.trim() || null,
        hospitalPhotoUrls: Array.isArray(hospitalPhotoUrls) ? hospitalPhotoUrls : null,
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
    const user = await requireAuthenticatedUser();
    const body = await req.json();
    const {
      id,
      name,
      slug,
      brandingHex,
      preferredAsrModel,
      customSystemPrompt,
      defaultDisclaimer,
      logoUrl,
      brandFont,
      brandTagline,
      location,
      websiteUrl,
      linkedinUrl,
      facebookUrl,
      instagramUrl,
      xUrl,
      youtubeUrl,
      contactEmail,
      contactPhone,
      preferredTone,
      callToAction,
      hospitalPhotoUrls,
    } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Organization ID is required." },
        { status: 400 }
      );
    }
    await requireOrganizationAccess(id);
    const existing = await db.organization.findUnique({ where: { id }, select: { preferredAsrModel: true } });
    if (!existing) return NextResponse.json({ error: "Organization not found." }, { status: 404 });

    const updated = await db.organization.update({
      where: { id },
      data: {
        name: name?.trim(),
        slug: slug?.trim(),
        brandingHex: brandingHex?.trim() || "#0f766e",
        preferredAsrModel: user?.isSuperAdmin ? preferredAsrModel || "whisper-1" : existing.preferredAsrModel,
        customSystemPrompt: customSystemPrompt?.trim() || null,
        logoUrl: logoUrl?.trim() || null,
        brandFont: brandFont?.trim() || "Arial",
        brandTagline: brandTagline?.trim() || null,
        location: location?.trim() || null,
        websiteUrl: websiteUrl?.trim() || null,
        linkedinUrl: linkedinUrl?.trim() || null,
        facebookUrl: facebookUrl?.trim() || null,
        instagramUrl: instagramUrl?.trim() || null,
        xUrl: xUrl?.trim() || null,
        youtubeUrl: youtubeUrl?.trim() || null,
        contactEmail: contactEmail?.trim() || null,
        contactPhone: contactPhone?.trim() || null,
        preferredTone: preferredTone?.trim() || null,
        callToAction: callToAction?.trim() || null,
        hospitalPhotoUrls: Array.isArray(hospitalPhotoUrls) ? hospitalPhotoUrls : null,
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
    const user = await requireAuthenticatedUser();
    const body = await req.json();
    if (!body.organizationId) return NextResponse.json({ error: "Organization ID is required." }, { status: 400 });
    await requireOrganizationAccess(body.organizationId);
    const updated = await db.organization.update({
      where: { id: body.organizationId },
      data: {
        name: body.name?.trim(),
        brandingHex: body.brandingHex?.trim(),
        logoUrl: body.logoUrl?.trim() || null,
        brandFont: body.brandFont?.trim() || "Arial",
        brandTagline: body.brandTagline?.trim() || null,
        location: body.location?.trim() || null,
        websiteUrl: body.websiteUrl?.trim() || null,
        linkedinUrl: body.linkedinUrl?.trim() || null,
        facebookUrl: body.facebookUrl?.trim() || null,
        instagramUrl: body.instagramUrl?.trim() || null,
        xUrl: body.xUrl?.trim() || null,
        youtubeUrl: body.youtubeUrl?.trim() || null,
        contactEmail: body.contactEmail?.trim() || null,
        contactPhone: body.contactPhone?.trim() || null,
        preferredTone: body.preferredTone?.trim() || null,
        callToAction: body.callToAction?.trim() || null,
        hospitalPhotoUrls: Array.isArray(body.hospitalPhotoUrls) ? body.hospitalPhotoUrls : null,
        defaultDisclaimer: body.defaultDisclaimer?.trim(),
      },
    });
    return NextResponse.json({ success: true, organization: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to update brand settings." }, { status: 500 });
  }
}
