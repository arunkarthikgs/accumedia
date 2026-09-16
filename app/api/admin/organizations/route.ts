import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { requireAuthenticatedUser, requireOrganizationAccess } from "@/lib/tenant-auth";
import { requirePermission } from "@/lib/auth";
import { isBrandColor, normalizeBrandColor } from "@/lib/brand";
import { query } from "@/lib/worker-db";
import crypto from "node:crypto";

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
      `WITH user_counts AS (
         SELECT "organizationId" AS organization_id, COUNT(*) AS count
         FROM macula.macula_users GROUP BY "organizationId"
       ), case_counts AS (
         SELECT "organizationId" AS organization_id, COUNT(*) AS count
         FROM macula.macula_cases GROUP BY "organizationId"
       ), recording_counts AS (
         SELECT "organizationId" AS organization_id, COUNT(*) AS count
         FROM macula.macula_audio_recordings GROUP BY "organizationId"
       )
       SELECT o.id, o.name, o.slug, o."brandingHex" AS branding_hex,
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
              COALESCE(uc.count, 0) AS user_count,
              COALESCE(cc.count, 0) AS case_count,
              COALESCE(rc.count, 0) AS recording_count
            FROM macula.macula_organizations o
            LEFT JOIN user_counts uc ON uc.organization_id = o.id
            LEFT JOIN case_counts cc ON cc.organization_id = o.id
            LEFT JOIN recording_counts rc ON rc.organization_id = o.id
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
    const existingAdmin = (await query(`SELECT id FROM macula.macula_users WHERE email = $1 LIMIT 1`, [normalizedAdminEmail])).rows[0];
    if (existingAdmin) return NextResponse.json({ error: "A user with this administrator email/User ID already exists." }, { status: 409 });

    const cleanSlug = (slug || name)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    const existing = (await query(`SELECT id FROM macula.macula_organizations WHERE slug = $1 LIMIT 1`, [cleanSlug])).rows[0];

    if (existing) {
      return NextResponse.json(
        { error: "An organization with this slug/identifier already exists." },
        { status: 400 }
      );
    }

    const organizationId = crypto.randomUUID();
    const roleId = crypto.randomUUID();
    const adminUserId = crypto.randomUUID();
    const definition = (await query<{ id: string }>(`SELECT id FROM macula.macula_role_definitions WHERE slug = 'organization-admin' LIMIT 1`)).rows[0];
    const selectedPlan = planId ? (await query<{ id: string }>(`SELECT id FROM macula.macula_plans WHERE id = $1 LIMIT 1`, [planId])).rows[0] : null;
    if (planId && !selectedPlan) throw new Error("Selected subscription plan was not found.");
    const organizationValues = [organizationId, name.trim(), cleanSlug, normalizeBrandColor(brandingHex), user?.isSuperAdmin ? preferredAsrModel || "whisper-1" : "whisper-1", customSystemPrompt?.trim() || null, logoUrl?.trim() || null, brandFont?.trim() || "Arial", brandTagline?.trim() || null, location?.trim() || null, websiteUrl?.trim() || null, linkedinUrl?.trim() || null, facebookUrl?.trim() || null, instagramUrl?.trim() || null, xUrl?.trim() || null, youtubeUrl?.trim() || null, contactEmail?.trim() || null, contactPhone?.trim() || null, preferredTone?.trim() || null, callToAction?.trim() || null, JSON.stringify(Array.isArray(hospitalPhotoUrls) ? hospitalPhotoUrls : null), defaultDisclaimer?.trim() || "This clinical summary is generated under NMC registered medical practitioner supervision."];
    const { rows: orgRows } = await query(`INSERT INTO macula.macula_organizations (id, name, slug, "brandingHex", "preferredAsrModel", "customSystemPrompt", "logoUrl", "brandFont", "brandTagline", location, "websiteUrl", "linkedinUrl", "facebookUrl", "instagramUrl", "xUrl", "youtubeUrl", "contactEmail", "contactPhone", "preferredTone", "callToAction", "hospitalPhotoUrls", "defaultDisclaimer") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21::jsonb,$22) RETURNING *`, organizationValues);
    await query(`INSERT INTO macula.macula_roles (id, name, slug, description, "isSystem", "organizationId", "definitionId") VALUES ($1, 'Organization Administrator', 'organization-admin', 'Manage the hospital organization and its users.', FALSE, $2, $3)`, [roleId, organizationId, definition?.id || null]);
    if (definition) await query(`INSERT INTO macula.macula_role_permissions ("roleId", "permissionId") SELECT $1, "permissionId" FROM macula.macula_role_definition_permissions WHERE "roleDefinitionId" = $2 ON CONFLICT DO NOTHING`, [roleId, definition.id]);
    const passwordHash = await bcrypt.hash(adminUserPassword, 12);
    const { rows: adminRows } = await query(`INSERT INTO macula.macula_users (id, name, email, password_hash, role, "roleId", "organizationId") VALUES ($1,$2,$3,$4,'ADMIN',$5,$6) RETURNING id, name, email, "organizationId"`, [adminUserId, adminUserName.trim(), normalizedAdminEmail, passwordHash, roleId, organizationId]);
    if (selectedPlan) await query(`INSERT INTO macula.macula_subscriptions (id, status, "currentPeriodStart", "currentPeriodEnd", "organizationId", "planId") VALUES ($1,'ACTIVE',NOW(),$2,$3,$4)`, [crypto.randomUUID(), new Date(Date.now() + 30 * 86400000), organizationId, selectedPlan.id]);
    const result = { org: orgRows[0], adminUser: adminRows[0] };

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
    const existing = (await query<{ preferredAsrModel: string }>(`SELECT "preferredAsrModel" FROM macula.macula_organizations WHERE id = $1 LIMIT 1`, [id])).rows[0];
    if (!existing) return NextResponse.json({ error: "Organization not found." }, { status: 404 });

    const { rows } = await query(`UPDATE macula.macula_organizations SET name=$1, slug=$2, "brandingHex"=$3, "preferredAsrModel"=$4, "customSystemPrompt"=$5, "logoUrl"=$6, "brandFont"=$7, "brandTagline"=$8, location=$9, "websiteUrl"=$10, "linkedinUrl"=$11, "facebookUrl"=$12, "instagramUrl"=$13, "xUrl"=$14, "youtubeUrl"=$15, "contactEmail"=$16, "contactPhone"=$17, "preferredTone"=$18, "callToAction"=$19, "hospitalPhotoUrls"=$20::jsonb, "defaultDisclaimer"=$21, "updatedAt"=NOW() WHERE id=$22 RETURNING *`, [name?.trim(), slug?.trim(), normalizeBrandColor(brandingHex), user?.isSuperAdmin ? preferredAsrModel || "whisper-1" : existing.preferredAsrModel, customSystemPrompt?.trim() || null, logoUrl?.trim() || null, brandFont?.trim() || "Arial", brandTagline?.trim() || null, location?.trim() || null, websiteUrl?.trim() || null, linkedinUrl?.trim() || null, facebookUrl?.trim() || null, instagramUrl?.trim() || null, xUrl?.trim() || null, youtubeUrl?.trim() || null, contactEmail?.trim() || null, contactPhone?.trim() || null, preferredTone?.trim() || null, callToAction?.trim() || null, JSON.stringify(Array.isArray(hospitalPhotoUrls) ? hospitalPhotoUrls : null), defaultDisclaimer?.trim(), id]);
    const updated = rows[0];

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
    const { rows } = await query(`UPDATE macula.macula_organizations SET name=$1, "brandingHex"=$2, "logoUrl"=$3, "brandFont"=$4, "brandTagline"=$5, location=$6, "websiteUrl"=$7, "linkedinUrl"=$8, "facebookUrl"=$9, "instagramUrl"=$10, "xUrl"=$11, "youtubeUrl"=$12, "contactEmail"=$13, "contactPhone"=$14, "preferredTone"=$15, "callToAction"=$16, "hospitalPhotoUrls"=$17::jsonb, "preferredAsrModel"=COALESCE($18, "preferredAsrModel"), "customSystemPrompt"=$19, "defaultDisclaimer"=$20, "updatedAt"=NOW() WHERE id=$21 RETURNING *`, [body.name?.trim(), normalizeBrandColor(body.brandingHex), body.logoUrl?.trim() || null, body.brandFont?.trim() || "Arial", body.brandTagline?.trim() || null, body.location?.trim() || null, body.websiteUrl?.trim() || null, body.linkedinUrl?.trim() || null, body.facebookUrl?.trim() || null, body.instagramUrl?.trim() || null, body.xUrl?.trim() || null, body.youtubeUrl?.trim() || null, body.contactEmail?.trim() || null, body.contactPhone?.trim() || null, body.preferredTone?.trim() || null, body.callToAction?.trim() || null, JSON.stringify(Array.isArray(body.hospitalPhotoUrls) ? body.hospitalPhotoUrls : null), body.preferredAsrModel?.trim() || null, body.customSystemPrompt?.trim() || null, body.defaultDisclaimer?.trim(), body.organizationId]);
    const updated = rows[0];
    return NextResponse.json({ success: true, organization: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to update brand settings." }, { status: 500 });
  }
}
