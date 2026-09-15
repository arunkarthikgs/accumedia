import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuthenticatedUser } from "@/lib/tenant-auth";

async function requireRoleManager() {
  const user = await requireAuthenticatedUser();
  if (!user || (!user.isSuperAdmin && user.role?.slug !== "platform-admin" && user.role?.slug !== "organization-admin" && user.role?.slug !== "compliance-officer" && user.role?.slug !== "admin")) {
    throw new Error("Forbidden: role matrix management permission required.");
  }
  return user;
}

export async function GET(req: Request) {
  try {
    const user = await requireRoleManager();
    const requestedOrganizationId = new URL(req.url).searchParams.get("organizationId");
    const organizationId = user.isSuperAdmin ? requestedOrganizationId : user.organizationId;
    if (!organizationId && !user.isSuperAdmin) {
      return NextResponse.json({ error: "User is not assigned to an organization." }, { status: 400 });
    }
    const [roles, permissions, definitions, taskDefinitions] = await Promise.all([
      db.role.findMany({
        where: organizationId ? { organizationId } : { organizationId: "__hospital_scope_required__" },
        include: {
          definition: { select: { id: true, slug: true, name: true, isSystem: true } },
          rolePermissions: { include: { permission: true } },
        },
        orderBy: { slug: "asc" },
      }),
      db.permission.findMany({
        orderBy: { module: "asc" },
      }),
      db.roleDefinition.findMany({ include: { defaultPermissions: { include: { permission: true } } }, orderBy: { slug: "asc" } }),
      db.taskDefinition.findMany({ include: { permissions: { select: { id: true } } }, orderBy: [{ module: "asc" }, { slug: "asc" }] }),
    ]);

    const organizations = user.isSuperAdmin
      ? await db.organization.findMany({ select: { id: true, name: true, slug: true }, orderBy: { name: "asc" } })
      : [];

    return NextResponse.json({ roles, permissions, definitions, taskDefinitions, organizations, organizationId });
  } catch (error: any) {
    console.error("Failed to fetch role matrix:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireRoleManager();
    const { roleId, permissionId, enabled } = await req.json();

    if (!roleId || !permissionId || typeof enabled !== "boolean") {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    const role = await db.role.findUnique({ where: { id: roleId }, select: { organizationId: true, isSystem: true } });
    const permission = await db.permission.findUnique({ where: { id: permissionId }, select: { id: true } });
    if (!role || !permission) return NextResponse.json({ error: "Role or permission not found." }, { status: 404 });
    if (!user.isSuperAdmin && (!role.organizationId || role.organizationId !== user.organizationId)) {
      return NextResponse.json({ error: "Cannot modify another organization’s role." }, { status: 403 });
    }
    if (role.isSystem && !user.isSuperAdmin) return NextResponse.json({ error: "Only platform administrators can modify system roles." }, { status: 403 });

    if (enabled) {
      await db.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId, permissionId },
        },
        update: {},
        create: { roleId, permissionId },
      });
    } else {
      await db.rolePermission.deleteMany({
        where: { roleId, permissionId },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Failed to toggle permission:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
