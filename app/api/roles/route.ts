import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { revalidateTag } from "next/cache";
import { requireAuthenticatedUser } from "@/lib/tenant-auth";
import { query } from "@/lib/worker-db";

async function requireRoleManager() {
  const user = await requireAuthenticatedUser();
  const roleSlug = user?.role?.slug?.toLowerCase();
  if (!user || (!user.isSuperAdmin && roleSlug !== "platform-admin" && roleSlug !== "organization-admin" && roleSlug !== "compliance-officer" && roleSlug !== "admin")) {
    throw new Error("Forbidden: role matrix management permission required.");
  }
  return user;
}

let roleCatalogCache: { expiresAt: number; permissions: unknown[]; taskDefinitions: unknown[] } | null = null;
let roleOrganizationsCache: { expiresAt: number; organizations: { id: string; name: string; slug: string }[] } | null = null;

export async function GET(req: Request) {
  try {
    const user = await requireRoleManager();
    const requestedOrganizationId = new URL(req.url).searchParams.get("organizationId");
    const organizations: { id: string; name: string; slug: string }[] = user.isSuperAdmin
      ? roleOrganizationsCache && roleOrganizationsCache.expiresAt > Date.now()
        ? roleOrganizationsCache.organizations
        : (await query<{ id: string; name: string; slug: string }>(`SELECT id, name, slug FROM macula.macula_organizations ORDER BY name ASC`)).rows
      : [];
    if (user.isSuperAdmin && !roleOrganizationsCache) roleOrganizationsCache = { expiresAt: Date.now() + 30_000, organizations };
    const organizationId = user.isSuperAdmin ? requestedOrganizationId || organizations[0]?.id || null : user.organizationId;
    if (!organizationId && !user.isSuperAdmin) {
      return NextResponse.json({ error: "User is not assigned to an organization." }, { status: 400 });
    }
    let permissions: any[];
    let taskDefinitions: any[];
    if (roleCatalogCache && roleCatalogCache.expiresAt > Date.now()) {
      permissions = roleCatalogCache.permissions as any[];
      taskDefinitions = roleCatalogCache.taskDefinitions as any[];
    } else {
      const catalog = await Promise.all([
        query(`SELECT id, name, module, description, slug FROM macula.macula_permissions ORDER BY module ASC, slug ASC`),
        query(`SELECT td.id, td.slug, td.name, td.module, td.description, COALESCE(jsonb_agg(jsonb_build_object('id', p.id)) FILTER (WHERE p.id IS NOT NULL), '[]') AS permissions FROM macula.macula_task_definitions td LEFT JOIN macula.macula_permissions p ON p."taskDefinitionId" = td.id GROUP BY td.id ORDER BY td.module ASC, td.slug ASC`),
      ]);
      permissions = catalog[0].rows;
      taskDefinitions = catalog[1].rows;
      roleCatalogCache = { expiresAt: Date.now() + 300_000, permissions, taskDefinitions };
    }
    const [{ rows: roles }] = await Promise.all([
      query(`SELECT r.id, r.name, r.slug, r."isSystem" AS "isSystem", r."organizationId" AS "organizationId",
                    jsonb_build_object('id', rd.id, 'slug', rd.slug, 'name', rd.name, 'isSystem', rd."isSystem") AS definition,
                    COALESCE(jsonb_agg(jsonb_build_object('permissionId', rp."permissionId")) FILTER (WHERE rp."permissionId" IS NOT NULL), '[]') AS "rolePermissions"
             FROM macula.macula_roles r
             LEFT JOIN macula.macula_role_definitions rd ON rd.id = r."definitionId"
             LEFT JOIN macula.macula_role_permissions rp ON rp."roleId" = r.id
             WHERE ($1::text IS NULL OR r."organizationId" IS NULL OR r."organizationId" = $1)
             GROUP BY r.id, rd.id ORDER BY r.slug ASC`, [organizationId]),
    ]);

    const currentOrganization = organizationId
      ? organizations.find((organization) => organization.id === organizationId) || (await query<{ id: string; name: string; slug: string }>(
        `SELECT id, name, slug FROM macula.macula_organizations WHERE id = $1 LIMIT 1`, [organizationId]
      )).rows[0] || null
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
      while ((await query(`SELECT id FROM macula.macula_roles WHERE slug = $1 AND "organizationId" = $2 LIMIT 1`, [slug, targetOrganizationId])).rows[0]) {
        slug = `${baseSlug}-${suffix++}`;
      }

      const roleId = crypto.randomUUID();
      const { rows: createdRoles } = await query(
        `INSERT INTO macula.macula_roles (id, name, slug, description, "organizationId", "isSystem")
         VALUES ($1, $2, $3, $4, $5, FALSE)
         RETURNING id, name, slug, description, "organizationId", "isSystem"`,
        [roleId, name, slug, description, targetOrganizationId]
      );
      const role = { ...createdRoles[0], definition: null, rolePermissions: [] };
      revalidateTag("role-matrix");
      roleOrganizationsCache = null;
      return NextResponse.json({ role }, { status: 201 });
    }

    const { roleId, permissionId, enabled } = body;

    if (!roleId || !permissionId || typeof enabled !== "boolean") {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    const role = (await query<{ "organizationId": string | null; "isSystem": boolean }>(
      `SELECT "organizationId", "isSystem" FROM macula.macula_roles WHERE id = $1 LIMIT 1`, [roleId]
    )).rows[0];
    const permission = (await query(`SELECT id FROM macula.macula_permissions WHERE id = $1 LIMIT 1`, [permissionId])).rows[0];
    if (!role || !permission) return NextResponse.json({ error: "Role or permission not found." }, { status: 404 });
    if (!user.isSuperAdmin && (!role.organizationId || role.organizationId !== user.organizationId)) {
      return NextResponse.json({ error: "Cannot modify another organization’s role." }, { status: 403 });
    }
    if (role.isSystem && !user.isSuperAdmin) return NextResponse.json({ error: "Only platform administrators can modify system roles." }, { status: 403 });

    if (enabled) {
      await query(
        `INSERT INTO macula.macula_role_permissions ("roleId", "permissionId")
         VALUES ($1, $2) ON CONFLICT ("roleId", "permissionId") DO NOTHING`,
        [roleId, permissionId]
      );
    } else {
      await query(`DELETE FROM macula.macula_role_permissions WHERE "roleId" = $1 AND "permissionId" = $2`, [roleId, permissionId]);
    }

    revalidateTag("role-matrix");
    roleCatalogCache = null;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Failed to toggle permission:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
