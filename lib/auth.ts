import { db } from "@/lib/db";
import { cookies } from "next/headers";
import crypto from "node:crypto";

const SESSION_CACHE_TTL_MS = 15_000;
const sessionCache = new Map<string, { user: SessionUser | null; expiresAt: number }>();
const sessionInflight = new Map<string, Promise<SessionUser | null>>();

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  registrationNo: string | null;
  specialty: string | null;
  designation: string | null;
  qualifications: string | null;
  profilePhotoUrl: string | null;
  organizationName: string | null;
  organizationBrandingHex: string | null;
  isSuperAdmin: boolean;
  organizationId: string | null;
  permissions: string[];
  role: {
    id: string;
    name: string;
    slug: string;
  } | null;
}

async function resolveCurrentUser(): Promise<SessionUser | null> {
  try {
    const startedAt = performance.now();
    const token = (await cookies()).get("macula_session")?.value;
    if (!token) return null;
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const cached = sessionCache.get(tokenHash);
    if (cached && cached.expiresAt > Date.now()) return cached.user;
    const session = await db.session.findFirst({
      where: { tokenHash, expiresAt: { gt: new Date() } },
      select: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            registrationNo: true,
            specialty: true,
            designation: true,
            qualifications: true,
            profilePhotoUrl: true,
            isSuperAdmin: true,
            organizationId: true,
            assignedRole: {
              select: {
                id: true,
                name: true,
                slug: true,
                rolePermissions: { select: { permission: { select: { slug: true } } } },
              },
            },
            organization: { select: { name: true, brandingHex: true } },
          },
        },
      },
    });

    if (!session?.user) {
      sessionCache.set(tokenHash, { user: null, expiresAt: Date.now() + SESSION_CACHE_TTL_MS });
      return null;
    }
    const user = session.user;

    const permissions = user.assignedRole
      ? user.assignedRole.rolePermissions.map((p) => p.permission.slug)
      : [];

    const result = {
      id: user.id,
      name: user.name,
      email: user.email,
      registrationNo: user.registrationNo,
      specialty: user.specialty,
      designation: user.designation,
      qualifications: user.qualifications,
      profilePhotoUrl: user.profilePhotoUrl,
      organizationName: user.organization?.name ?? null,
      organizationBrandingHex: user.organization?.brandingHex ?? null,
      isSuperAdmin: Boolean(user.isSuperAdmin),
      organizationId: user.organizationId ?? null,
      permissions,
      role: user.assignedRole
        ? {
        id: user.assignedRole.id,
        name: user.assignedRole.name,
        slug: user.assignedRole.slug,
          }
        : null,
    };
    sessionCache.set(tokenHash, { user: result, expiresAt: Date.now() + SESSION_CACHE_TTL_MS });
    const durationMs = Math.round(performance.now() - startedAt);
    if (durationMs >= 250) console.warn(`[db] current user lookup ${durationMs}ms`);
    return result;
  } catch (error) {
    console.error("Error resolving current user session:", error);
    return null;
  }
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get("macula_session")?.value;
  if (!token) return null;
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const cached = sessionCache.get(tokenHash);
  if (cached && cached.expiresAt > Date.now()) return cached.user;
  const inflight = sessionInflight.get(tokenHash);
  if (inflight) return inflight;
  const promise = resolveCurrentUser().finally(() => sessionInflight.delete(tokenHash));
  sessionInflight.set(tokenHash, promise);
  return promise;
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
