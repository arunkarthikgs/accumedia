import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requireAuthenticatedUser } from "@/lib/tenant-auth";
import { timeDbOperation } from "@/lib/perf";

export async function GET(req: Request) {
  try {
    const user = await requireAuthenticatedUser();
    const requestedOrganizationId = new URL(req.url).searchParams.get("organizationId");
    const organizationScope = user?.isSuperAdmin
      ? requestedOrganizationId ? { organizationId: requestedOrganizationId } : undefined
      : { organizationId: user?.organizationId || "__no_organization__" };
    const users = await timeDbOperation("user list", () => db.user.findMany({
      where: organizationScope,
      select: { id: true, name: true, email: true, registrationNo: true, specialty: true, qualifications: true, designation: true, profilePhotoUrl: true, organization: { select: { id: true, name: true } }, assignedRole: { select: { name: true, slug: true } } },
      orderBy: {
        name: "asc",
      },
    }));
    const organizations = user?.isSuperAdmin
      ? await db.organization.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } })
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
