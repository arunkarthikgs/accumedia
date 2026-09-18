import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { requireAuthenticatedUser, requireOrganizationScope } from "@/lib/tenant-auth";
import { timeDbOperation } from "@/lib/perf";
import { query } from "@/lib/worker-db";
import crypto from "node:crypto";

export async function GET(req: Request) {
  try {
    const user = await requireAuthenticatedUser();
    const requestedOrganizationId = new URL(req.url).searchParams.get("organizationId");
    const scopeId = user?.isSuperAdmin && !requestedOrganizationId
      ? null
      : await requireOrganizationScope(
        requestedOrganizationId || user?.organizationId || null,
      );
    const { rows: userRows } = await timeDbOperation("user list", () => query<{
      id: string;
      name: string;
      email: string;
      registration_no: string | null;
      specialty: string | null;
      qualifications: string | null;
      designation: string | null;
      profile_photo_url: string | null;
      profile_photo_r2_key: string | null;
      organization_id: string | null;
      organization_name: string | null;
      role_name: string | null;
      role_slug: string | null;
      is_active: boolean;
    }>(
      `SELECT u.id, u.name, u.email,
              u."registrationNo" AS registration_no, u.specialty, u.qualifications,
              u.designation, u."profilePhotoUrl" AS profile_photo_url, u."profilePhotoR2Key" AS profile_photo_r2_key,
              o.id AS organization_id, o.name AS organization_name,
              u."isActive" AS is_active,
              r.name AS role_name, r.slug AS role_slug
       FROM macula.users u
       LEFT JOIN macula.organizations o ON o.id = u."organizationId"
       LEFT JOIN macula.roles r ON r.id = u."roleId"
       WHERE ($1::text IS NULL OR u."organizationId" = $1)
       ORDER BY u.name ASC`,
      [scopeId || null]
    ));
    const users = userRows.map((item) => ({
      id: item.id,
      name: item.name,
      email: item.email,
      registrationNo: item.registration_no,
      specialty: item.specialty,
      qualifications: item.qualifications,
      designation: item.designation,
      profilePhotoUrl: item.profile_photo_url,
      profilePhotoR2Key: item.profile_photo_r2_key,
      organization: item.organization_id && item.organization_name
        ? { id: item.organization_id, name: item.organization_name }
        : undefined,
      assignedRole: item.role_name && item.role_slug ? { name: item.role_name, slug: item.role_slug } : undefined,
      isActive: item.is_active,
    }));
    const organizations = user?.isSuperAdmin
      ? (await query<{ id: string; name: string }>(
        `SELECT id, name FROM macula.organizations ORDER BY name ASC`
      )).rows
      : [];
    return NextResponse.json({ success: true, users, organizations, isSuperAdmin: Boolean(user?.isSuperAdmin), canManageUsers: Boolean(user?.isSuperAdmin || user?.permissions.includes("USER_MANAGE")) });
  } catch (error: any) {
    console.error("Failed to fetch users:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch users" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const currentUser = await requireAuthenticatedUser();
    if (!currentUser?.isSuperAdmin && !currentUser?.permissions.includes("USER_MANAGE")) {
      return NextResponse.json({ error: "Forbidden: user management permission required." }, { status: 403 });
    }
    const body = await req.json();
    const targetOrganizationId = currentUser?.isSuperAdmin ? body.organizationId : currentUser?.organizationId;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!targetOrganizationId || !name || !email || password.length < 8) {
      return NextResponse.json({ error: "Organization, physician name, email, and a password of at least 8 characters are required." }, { status: 400 });
    }
    const existingUser = (await query(`SELECT id FROM macula.users WHERE email = $1 LIMIT 1`, [email])).rows[0];
    if (existingUser) return NextResponse.json({ error: "A user with this email already exists." }, { status: 409 });
    if (currentUser?.isSuperAdmin || currentUser?.organizationId === targetOrganizationId) {
      const defaultRole = (await query<{ id: string }>(`SELECT id FROM macula.roles WHERE slug = 'attending-rmp' AND "organizationId" = $1 LIMIT 1`, [targetOrganizationId])).rows[0];
      const { rows } = await query(`INSERT INTO macula.users (id, name, email, password_hash, "organizationId", "registrationNo", specialty, qualifications, designation, "profilePhotoUrl", "roleId") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id, name, email, "registrationNo", specialty, qualifications, designation, "profilePhotoUrl", "organizationId"`, [crypto.randomUUID(), name, email, await bcrypt.hash(password, 12), targetOrganizationId, body.registrationNo?.trim() || null, body.specialty?.trim() || null, body.qualifications?.trim() || null, body.designation?.trim() || null, body.profilePhotoUrl?.trim() || null, defaultRole?.id || null]);
      const user = rows[0];
      return NextResponse.json({ success: true, user }, { status: 201 });
    }
    return NextResponse.json({ error: "Forbidden: organization access denied." }, { status: 403 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to create physician." }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const currentUser = await requireAuthenticatedUser();
    if (!currentUser?.isSuperAdmin && !currentUser?.permissions.includes("USER_MANAGE")) {
      return NextResponse.json({ error: "Forbidden: user management permission required." }, { status: 403 });
    }
    const body = await req.json();
    const userId = typeof body.userId === "string" ? body.userId : "";
    const existing = (await query<any>(`SELECT id, name, "organizationId", email, "isActive" FROM macula.users WHERE id = $1 LIMIT 1`, [userId])).rows[0];
    if (!existing) return NextResponse.json({ error: "User not found." }, { status: 404 });
    if (!currentUser.isSuperAdmin && currentUser.organizationId !== existing.organizationId) {
      return NextResponse.json({ error: "Forbidden: organization access denied." }, { status: 403 });
    }
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : existing.email;
    const duplicate = (await query(`SELECT id FROM macula.users WHERE email = $1 AND id <> $2 LIMIT 1`, [email, userId])).rows[0];
    if (duplicate) return NextResponse.json({ error: "A user with this email already exists." }, { status: 409 });
    const password = typeof body.password === "string" ? body.password : "";
    if (password && password.length < 8) return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    const isActive = typeof body.isActive === "boolean" ? body.isActive : existing.isActive;
    const { rows } = await query(`UPDATE macula.users SET name=$1, email=$2, "registrationNo"=$3, specialty=$4, qualifications=$5, designation=$6, "profilePhotoUrl"=$7, password_hash=COALESCE($8, password_hash), "isActive"=$9, "updatedAt"=NOW() WHERE id=$10 RETURNING id, name, email, "registrationNo", specialty, qualifications, designation, "profilePhotoUrl", "organizationId", "isActive"`, [typeof body.name === "string" ? body.name.trim() : existing.name, email, body.registrationNo?.trim() || null, body.specialty?.trim() || null, body.qualifications?.trim() || null, body.designation?.trim() || null, body.profilePhotoUrl?.trim() || null, password ? await bcrypt.hash(password, 12) : null, isActive, userId]);
    const updated = rows[0];
    return NextResponse.json({ success: true, user: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to update physician." }, { status: 500 });
  }
}
