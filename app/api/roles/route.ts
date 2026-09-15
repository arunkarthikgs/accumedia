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

export async function GET() {
  try {
    const user = await requireRoleManager();
    const [roles, permissions, definitions] = await Promise.all([
      db.role.findMany({
        where: user.isSuperAdmin || !user.organizationId ? undefined : { OR: [{ organizationId: null }, { organizationId: user.organizationId }] },
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
    ]);

    return NextResponse.json({ roles, permissions, definitions });
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
    if (!user.isSuperAdmin && role.organizationId && role.organizationId !== user.organizationId) {
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
