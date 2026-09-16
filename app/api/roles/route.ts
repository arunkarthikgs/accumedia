import { NextResponse } from "next/server";
import { unstable_cache, revalidateTag } from "next/cache";
import { db } from "@/lib/db";
import { requireAuthenticatedUser } from "@/lib/tenant-auth";

const getRoleMatrixCatalog = unstable_cache(
  async () => Promise.all([
    db.permission.findMany({ orderBy: { module: "asc" } }),
    db.taskDefinition.findMany({ select: { id: true, slug: true, name: true, module: true, description: true, permissions: { select: { id: true } } }, orderBy: [{ module: "asc" }, { slug: "asc" }] }),
  ]),
  ["role-matrix-catalog"],
  { revalidate: 300, tags: ["role-matrix"] },
);

const getRolesForScope = unstable_cache(
  async (organizationId: string | null, includeGlobal: boolean) => db.role.findMany({
    where: includeGlobal ? { OR: [{ organizationId: null }, { organizationId }] } : { organizationId },
    select: {
      id: true,
      name: true,
      slug: true,
      isSystem: true,
      organizationId: true,
      definition: { select: { id: true, slug: true, name: true, isSystem: true } },
      rolePermissions: { select: { permissionId: true } },
    },
    orderBy: { slug: "asc" },
  }),
  ["role-matrix-roles"],
  { revalidate: 300, tags: ["role-matrix"] },
);

async function requireRoleManager() {
  const user = await requireAuthenticatedUser();
  const roleSlug = user?.role?.slug?.toLowerCase();
  if (!user || (!user.isSuperAdmin && roleSlug !== "platform-admin" && roleSlug !== "organization-admin" && roleSlug !== "compliance-officer" && roleSlug !== "admin")) {
    throw new Error("Forbidden: role matrix management permission required.");
  }
  return user;
}

export async function GET(req: Request) {
  try {
    const user = await requireRoleManager();
    const requestedOrganizationId = new URL(req.url).searchParams.get("organizationId");
    const organizations = user.isSuperAdmin
      ? await db.organization.findMany({ select: { id: true, name: true, slug: true }, orderBy: { name: "asc" } })
      : [];
    const organizationId = user.isSuperAdmin ? requestedOrganizationId || organizations[0]?.id || null : user.organizationId;
    if (!organizationId && !user.isSuperAdmin) {
      return NextResponse.json({ error: "User is not assigned to an organization." }, { status: 400 });
    }
    const [roles, catalog] = await Promise.all([
      getRolesForScope(organizationId, user.isSuperAdmin),
      getRoleMatrixCatalog(),
    ]);
    const [permissions, taskDefinitions] = catalog;

    const currentOrganization = organizationId
      ? organizations.find((organization) => organization.id === organizationId) || await db.organization.findUnique({ where: { id: organizationId }, select: { id: true, name: true, slug: true } })
      : null;

    return NextResponse.json({ roles, permissions, taskDefinitions, organizations, organizationId, currentOrganization });
  } catch (error: any) {
    console.error("Failed to fetch role matrix:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireRoleManager();
    const body = await req.json();

    if (body.action === "createRole") {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const description = typeof body.description === "string" ? body.description.trim() : null;
      const requestedOrganizationId = typeof body.organizationId === "string" ? body.organizationId : "";
      const targetOrganizationId = user.isSuperAdmin ? requestedOrganizationId : user.organizationId;
      if (!name || !targetOrganizationId) {
        return NextResponse.json({ error: "Role name and hospital are required." }, { status: 400 });
      }

      const baseSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "custom-role";
      let slug = baseSlug;
      let suffix = 2;
      while (await db.role.findFirst({ where: { slug, organizationId: targetOrganizationId }, select: { id: true } })) {
        slug = `${baseSlug}-${suffix++}`;
      }

      const role = await db.role.create({
        data: { name, slug, description, organizationId: targetOrganizationId, isSystem: false },
        include: { definition: { select: { id: true, slug: true, name: true, isSystem: true } }, rolePermissions: { select: { permissionId: true } } },
      });
      revalidateTag("role-matrix");
      return NextResponse.json({ role }, { status: 201 });
    }

    const { roleId, permissionId, enabled } = body;

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

    revalidateTag("role-matrix");
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Failed to toggle permission:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
