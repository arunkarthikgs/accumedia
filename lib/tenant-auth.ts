import { getCurrentUser, type SessionUser } from "@/lib/auth";

const authRequired = () => process.env.AUTH_REQUIRED !== "false";

export function getEffectiveOrganizationScope(
  user: SessionUser | null,
  requestedOrganizationId?: string | null,
): string | null {
  if (!user) return null;
  if (user.isSuperAdmin) {
    return requestedOrganizationId || user.organizationId || null;
  }
  if (!user.organizationId) return null;
  if (requestedOrganizationId && requestedOrganizationId !== user.organizationId) {
    throw new Error("Forbidden: organization access denied.");
  }
  return user.organizationId;
}

export async function requireOrganizationScope(requestedOrganizationId?: string | null): Promise<string> {
  const user = await getCurrentUser();
  if (!authRequired()) {
    if (!user) throw new Error("Unauthorized: active session required.");
    return getEffectiveOrganizationScope(user, requestedOrganizationId) || user.organizationId || "";
  }
  if (!user) throw new Error("Unauthorized: active session required.");
  const effectiveOrgId = getEffectiveOrganizationScope(user, requestedOrganizationId);
  if (!effectiveOrgId) {
    throw new Error("Organization scope is required.");
  }
  return effectiveOrgId;
}

export async function requireOrganizationAccess(organizationId?: string | null): Promise<SessionUser | null> {
  const user = await getCurrentUser();
  if (!authRequired()) return user;
  if (!user) throw new Error("Unauthorized: active session required.");
  const targetOrgId = organizationId || user.organizationId;
  if (!targetOrgId) throw new Error("Organization scope is required.");
  if (!user.isSuperAdmin && user.organizationId !== targetOrgId) {
    throw new Error("Forbidden: organization access denied.");
  }
  return user;
}

export async function requireAuthenticatedUser(): Promise<SessionUser | null> {
  const user = await getCurrentUser();
  if (authRequired() && !user) {
    throw new Error("Unauthorized: active session required.");
  }
  return user;
}
