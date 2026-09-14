import { db } from "@/lib/db";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  isSuperAdmin: boolean;
  organizationId: string | null;
  permissions: string[];
  role: {
    id: string;
    name: string;
    slug: string;
  } | null;
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  try {
    const user = await db.user.findFirst({
      include: {
        role: {
          include: {
            permissions: {
              include: {
                permission: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    if (!user) return null;

    const permissions = user.role
      ? user.role.permissions.map((p) => p.permission.slug)
      : [];

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      isSuperAdmin: Boolean(user.isSuperAdmin),
      organizationId: user.organizationId ?? null,
      permissions,
      role: user.role
        ? {
            id: user.role.id,
            name: user.role.name,
            slug: user.role.slug,
          }
        : null,
    };
  } catch (error) {
    console.error("Error resolving current user session:", error);
    return null;
  }
}

export async function requirePermission(permissionSlug: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Unauthorized: No active session found.");
  }
  if (user.isSuperAdmin) {
    return user;
  }
  if (!user.permissions.includes(permissionSlug)) {
    throw new Error(`Forbidden: Missing required permission [${permissionSlug}].`);
  }
  return user;
}
