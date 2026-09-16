import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requireAuthenticatedUser } from "@/lib/tenant-auth";

export async function GET(req: Request) {
  try {
    const user = await requireAuthenticatedUser();
    const requestedOrganizationId = new URL(req.url).searchParams.get("organizationId");
    const organizationScope = user?.isSuperAdmin
      ? requestedOrganizationId ? { organizationId: requestedOrganizationId } : undefined
      : { organizationId: user?.organizationId || "__no_organization__" };
    const users = await db.user.findMany({
      where: organizationScope,
      include: {
        organization: {
          select: {
            id: true,
            name: true,
          },
        },
        assignedRole: { select: { name: true, slug: true } },
      },
      orderBy: {
        name: "asc",
      },
    });
    const organizations = user?.isSuperAdmin
      ? await db.organization.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } })
      : [];
    const specialties = [...new Set(users.map((item) => item.specialty).filter((value): value is string => Boolean(value)))].sort();

    return NextResponse.json({ success: true, users, organizations, specialties, isSuperAdmin: Boolean(user?.isSuperAdmin) });
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
    const body = await req.json();
    const targetOrganizationId = currentUser?.isSuperAdmin ? body.organizationId : currentUser?.organizationId;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!targetOrganizationId || !name || !email || password.length < 12) {
      return NextResponse.json({ error: "Organization, physician name, email, and a password of at least 12 characters are required." }, { status: 400 });
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
