import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requireAuthenticatedUser, requireOrganizationAccess } from "@/lib/tenant-auth";
import { requirePermission } from "@/lib/auth";
import { isBrandColor, normalizeBrandColor } from "@/lib/brand";
import { query } from "@/lib/worker-db";

export async function GET() {
  try {
    const user = await requireAuthenticatedUser();
    const scope = user?.isSuperAdmin ? null : user?.organizationId;
    const { rows } = await query<{
      id: string;
      name: string;
      slug: string;
      branding_hex: string | null;
      logo_url: string | null;
      brand_font: string | null;
      brand_tagline: string | null;
      location: string | null;
      website_url: string | null;
      linkedin_url: string | null;
      facebook_url: string | null;
      instagram_url: string | null;
      x_url: string | null;
      youtube_url: string | null;
      contact_email: string | null;
      contact_phone: string | null;
      preferred_tone: string | null;
      call_to_action: string | null;
      hospital_photo_urls: unknown;
      preferred_asr_model: string;
      custom_system_prompt: string | null;
      default_disclaimer: string;
      created_at: string;
      user_count: string;
      case_count: string;
      recording_count: string;
    }>(
      `SELECT o.id, o.name, o.slug, o."brandingHex" AS branding_hex,
              o."logoUrl" AS logo_url, o."brandFont" AS brand_font,
              o."brandTagline" AS brand_tagline, o.location,
              o."websiteUrl" AS website_url, o."linkedinUrl" AS linkedin_url,
              o."facebookUrl" AS facebook_url, o."instagramUrl" AS instagram_url,
              o."xUrl" AS x_url, o."youtubeUrl" AS youtube_url,
              o."contactEmail" AS contact_email, o."contactPhone" AS contact_phone,
              o."preferredTone" AS preferred_tone, o."callToAction" AS call_to_action,
              o."hospitalPhotoUrls" AS hospital_photo_urls,
              o."preferredAsrModel" AS preferred_asr_model,
              o."customSystemPrompt" AS custom_system_prompt,
              o."defaultDisclaimer" AS default_disclaimer, o."createdAt" AS created_at,
              (SELECT COUNT(*) FROM macula.macula_users u WHERE u."organizationId" = o.id) AS user_count,
              (SELECT COUNT(*) FROM macula.macula_cases c WHERE c."organizationId" = o.id) AS case_count,
              (SELECT COUNT(*) FROM macula.macula_audio_recordings ar WHERE ar."organizationId" = o.id) AS recording_count
       FROM macula.macula_organizations o
       WHERE ($1::text IS NULL OR o.id = $1)
       ORDER BY o."createdAt" DESC`,
      [scope]
    );
    const organizations = rows.map((organization) => ({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      brandingHex: organization.branding_hex,
      logoUrl: organization.logo_url,
      brandFont: organization.brand_font,
      brandTagline: organization.brand_tagline,
      location: organization.location,
      websiteUrl: organization.website_url,
      linkedinUrl: organization.linkedin_url,
      facebookUrl: organization.facebook_url,
      instagramUrl: organization.instagram_url,
      xUrl: organization.x_url,
      youtubeUrl: organization.youtube_url,
      contactEmail: organization.contact_email,
      contactPhone: organization.contact_phone,
      preferredTone: organization.preferred_tone,
      callToAction: organization.call_to_action,
      hospitalPhotoUrls: organization.hospital_photo_urls,
      preferredAsrModel: organization.preferred_asr_model,
      customSystemPrompt: organization.custom_system_prompt,
      defaultDisclaimer: organization.default_disclaimer,
      createdAt: organization.created_at,
      _count: {
        users: Number(organization.user_count),
        cases: Number(organization.case_count),
        recordings: Number(organization.recording_count),
      },
    }));

    return NextResponse.json({ success: true, organizations, isSuperAdmin: Boolean(user?.isSuperAdmin), canManageOrganizations: Boolean(user?.isSuperAdmin || user?.permissions.includes("ORGANIZATION_MANAGE")) });
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
    const user = await requirePermission("ORGANIZATION_MANAGE");
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
      adminUserName,
      adminUserEmail,
      adminUserPassword,
      planId,
    } = body;

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: "Organization name is required." },
        { status: 400 }
      );
    }
    if (brandingHex && !isBrandColor(brandingHex)) {
      return NextResponse.json({ error: "Primary brand colour must be a valid hex value, such as #0f766e." }, { status: 400 });
    }
    if (!adminUserName?.trim() || !adminUserEmail?.trim() || typeof adminUserPassword !== "string" || adminUserPassword.length < 8) {
      return NextResponse.json({ error: "Hospital administrator name, email/User ID, and a password of at least 8 characters are required." }, { status: 400 });
    }
    const normalizedAdminEmail = adminUserEmail.trim().toLowerCase();
    const existingAdmin = await db.user.findUnique({ where: { email: normalizedAdminEmail }, select: { id: true } });
    if (existingAdmin) return NextResponse.json({ error: "A user with this administrator email/User ID already exists." }, { status: 409 });

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

    const result = await db.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
        name: name.trim(),
        slug: cleanSlug,
        brandingHex: normalizeBrandColor(brandingHex),
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
      const selectedPlan = planId ? await tx.plan.findUnique({ where: { id: planId }, select: { id: true } }) : null;
      if (planId && !selectedPlan) throw new Error("Selected subscription plan was not found.");
      const roleDefinition = await tx.roleDefinition.findUnique({
        where: { slug: "organization-admin" },
        select: { id: true, defaultPermissions: { select: { permissionId: true } } },
      });
      const role = await tx.role.create({
        data: { name: "Organization Administrator", slug: "organization-admin", description: "Manage the hospital organization and its users.", isSystem: false, organizationId: org.id, definitionId: roleDefinition?.id || null },
      });
      if (roleDefinition?.defaultPermissions.length) {
        await tx.rolePermission.createMany({ data: roleDefinition.defaultPermissions.map(({ permissionId }) => ({ roleId: role.id, permissionId })) });
      }
      const adminUser = await tx.user.create({
        data: {
          name: adminUserName.trim(),
          email: normalizedAdminEmail,
          passwordHash: await bcrypt.hash(adminUserPassword, 12),
          role: "ADMIN",
          roleId: role.id,
          organizationId: org.id,
        },
        select: { id: true, name: true, email: true, organizationId: true },
      });
      if (selectedPlan) {
        await tx.subscription.create({ data: { organizationId: org.id, planId: selectedPlan.id, status: "ACTIVE", currentPeriodEnd: new Date(Date.now() + 30 * 86400000) } });
      }
      return { org, adminUser };
    });

    return NextResponse.json({ success: true, organization: result.org, adminUser: result.adminUser });
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
    if (brandingHex && !isBrandColor(brandingHex)) {
      return NextResponse.json({ error: "Primary brand colour must be a valid hex value, such as #0f766e." }, { status: 400 });
    }
    await requireOrganizationAccess(id);
    const existing = await db.organization.findUnique({ where: { id }, select: { preferredAsrModel: true } });
    if (!existing) return NextResponse.json({ error: "Organization not found." }, { status: 404 });

    const updated = await db.organization.update({
      where: { id },
      data: {
        name: name?.trim(),
        slug: slug?.trim(),
        brandingHex: normalizeBrandColor(brandingHex),
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
    if (body.brandingHex && !isBrandColor(body.brandingHex)) {
      return NextResponse.json({ error: "Primary brand colour must be a valid hex value, such as #0f766e." }, { status: 400 });
    }
    await requireOrganizationAccess(body.organizationId);
    const updated = await db.organization.update({
      where: { id: body.organizationId },
      data: {
        name: body.name?.trim(),
        brandingHex: normalizeBrandColor(body.brandingHex),
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
        preferredAsrModel: body.preferredAsrModel?.trim() || undefined,
        customSystemPrompt: body.customSystemPrompt?.trim() || null,
        defaultDisclaimer: body.defaultDisclaimer?.trim(),
      },
    });
    return NextResponse.json({ success: true, organization: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to update brand settings." }, { status: 500 });
  }
}
