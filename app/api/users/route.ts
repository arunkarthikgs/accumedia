import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requireAuthenticatedUser } from "@/lib/tenant-auth";
import { timeDbOperation } from "@/lib/perf";
import { query } from "@/lib/worker-db";

export async function GET(req: Request) {
  try {
    const user = await requireAuthenticatedUser();
    const requestedOrganizationId = new URL(req.url).searchParams.get("organizationId");
    const organizationScope = user?.isSuperAdmin
      ? requestedOrganizationId ? { organizationId: requestedOrganizationId } : undefined
      : { organizationId: user?.organizationId || "__no_organization__" };
    const scopeId = user?.isSuperAdmin ? requestedOrganizationId : user?.organizationId;
    const { rows: userRows } = await timeDbOperation("user list", () => query<{
      id: string;
      name: string;
      email: string;
      registration_no: string | null;
      specialty: string | null;
      qualifications: string | null;
      designation: string | null;
      profile_photo_url: string | null;
      organization_id: string | null;
      organization_name: string | null;
      role_name: string | null;
      role_slug: string | null;
    }>(
      `SELECT u.id, u.name, u.email,
              u."registrationNo" AS registration_no, u.specialty, u.qualifications,
              u.designation, u."profilePhotoUrl" AS profile_photo_url,
              o.id AS organization_id, o.name AS organization_name,
              r.name AS role_name, r.slug AS role_slug
       FROM macula.macula_users u
       LEFT JOIN macula.macula_organizations o ON o.id = u."organizationId"
       LEFT JOIN macula.macula_roles r ON r.id = u."roleId"
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
      organization: item.organization_id && item.organization_name
        ? { id: item.organization_id, name: item.organization_name }
        : undefined,
      assignedRole: item.role_name && item.role_slug ? { name: item.role_name, slug: item.role_slug } : undefined,
    }));
    const organizations = user?.isSuperAdmin
      ? (await query<{ id: string; name: string }>(
        `SELECT id, name FROM macula.macula_organizations ORDER BY name ASC`
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
    const existingUser = await db.user.findUnique({ where: { email }, select: { id: true } });
    if (existingUser) return NextResponse.json({ error: "A user with this email already exists." }, { status: 409 });
    if (currentUser?.isSuperAdmin || currentUser?.organizationId === targetOrganizationId) {
      const defaultRole = await db.role.findFirst({ where: { slug: "attending-rmp", organizationId: targetOrganizationId }, select: { id: true } });
      const user = await db.user.create({
        data: {
          name,
          email,
          organizationId: targetOrganizationId,
          registrationNo: body.registrationNo?.trim() || null,
          specialty: body.specialty?.trim() || null,
          qualifications: body.qualifications?.trim() || null,
          designation: body.designation?.trim() || null,
          profilePhotoUrl: body.profilePhotoUrl?.trim() || null,
          passwordHash: await bcrypt.hash(password, 12),
          roleId: defaultRole?.id || null,
        },
        select: { id: true, name: true, email: true, registrationNo: true, specialty: true, qualifications: true, designation: true, profilePhotoUrl: true, organizationId: true },
      });
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
    const existing = await db.user.findUnique({ where: { id: userId }, select: { id: true, organizationId: true, email: true } });
    if (!existing) return NextResponse.json({ error: "User not found." }, { status: 404 });
    if (!currentUser.isSuperAdmin && currentUser.organizationId !== existing.organizationId) {
      return NextResponse.json({ error: "Forbidden: organization access denied." }, { status: 403 });
    }
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : existing.email;
    const duplicate = await db.user.findFirst({ where: { email, NOT: { id: userId } }, select: { id: true } });
    if (duplicate) return NextResponse.json({ error: "A user with this email already exists." }, { status: 409 });
    const password = typeof body.password === "string" ? body.password : "";
    if (password && password.length < 8) return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    const updated = await db.user.update({
      where: { id: userId },
      data: {
        name: typeof body.name === "string" ? body.name.trim() : undefined,
        email,
        registrationNo: body.registrationNo?.trim() || null,
        specialty: body.specialty?.trim() || null,
        qualifications: body.qualifications?.trim() || null,
        designation: body.designation?.trim() || null,
        profilePhotoUrl: body.profilePhotoUrl?.trim() || null,
        ...(password ? { passwordHash: await bcrypt.hash(password, 12) } : {}),
      },
      select: { id: true, name: true, email: true, registrationNo: true, specialty: true, qualifications: true, designation: true, profilePhotoUrl: true, organizationId: true },
    });
    return NextResponse.json({ success: true, user: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to update physician." }, { status: 500 });
  }
}
