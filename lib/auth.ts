import { query } from "@/lib/worker-db";
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
    const { rows } = await query<{
      id: string;
      name: string;
      email: string;
      registration_no: string | null;
      specialty: string | null;
      designation: string | null;
      qualifications: string | null;
      profile_photo_url: string | null;
      is_super_admin: boolean;
      organization_id: string | null;
      organization_name: string | null;
      branding_hex: string | null;
      role_id: string | null;
      role_name: string | null;
      role_slug: string | null;
      permissions: string[];
      is_active: boolean;
      organization_is_active: boolean | null;
    }>(
            `SELECT u.id, u.name, u.email, u."registrationNo" AS registration_no,
              u.specialty, u.designation, u.qualifications,
              u."profilePhotoUrl" AS profile_photo_url,
              u."isSuperAdmin" AS is_super_admin, u."organizationId" AS organization_id,
              u."isActive" AS is_active,
              o.name AS organization_name, o."brandingHex" AS branding_hex, o."isActive" AS organization_is_active,
              r.id AS role_id, r.name AS role_name, r.slug AS role_slug,
              '{}'::text[] AS permissions
       FROM macula.sessions s
       JOIN macula.users u ON u.id = s."userId"
       LEFT JOIN macula.roles r ON r.id = u."roleId"
       LEFT JOIN macula.organizations o ON o.id = u."organizationId"
       WHERE s."tokenHash" = $1 AND s."expiresAt" > NOW()
       LIMIT 1`,
      [tokenHash]
    );
    const session = rows[0];

    if (!session || !session.is_active || (!session.is_super_admin && session.organization_id && session.organization_is_active === false)) {
      sessionCache.set(tokenHash, { user: null, expiresAt: Date.now() + SESSION_CACHE_TTL_MS });
      return null;
    }

    const permissions = session.is_super_admin
      ? []
      : (await query<{ slug: string }>(
        `SELECT DISTINCT p.slug
         FROM macula.role_permissions rp
         JOIN macula.permissions p ON p.id = rp."permissionId"
         WHERE rp."roleId" = $1`,
        [session.role_id]
      )).rows.map((permission) => permission.slug);

    const result = {
      id: session.id,
      name: session.name,
      email: session.email,
      registrationNo: session.registration_no,
      specialty: session.specialty,
      designation: session.designation,
      qualifications: session.qualifications,
      profilePhotoUrl: session.profile_photo_url,
      organizationName: session.organization_name,
      organizationBrandingHex: session.branding_hex,
      isSuperAdmin: Boolean(session.is_super_admin),
      organizationId: session.organization_id,
      permissions,
      role: session.role_id
        ? {
        id: session.role_id,
        name: session.role_name || "",
        slug: session.role_slug || "",
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
