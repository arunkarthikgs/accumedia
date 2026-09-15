import { getCurrentUser, type SessionUser } from "@/lib/auth";

export async function requireOrganizationAccess(organizationId: string): Promise<SessionUser | null> {
  const user = await getCurrentUser();
  const authRequired = process.env.AUTH_REQUIRED === "true" || process.env.NODE_ENV === "production";
  if (!authRequired) return user;
  if (!user) throw new Error("Unauthorized: active session required.");
  if (!user.isSuperAdmin && user.organizationId !== organizationId) {
    throw new Error("Forbidden: organization access denied.");
  }
  return user;
}

export async function requireAuthenticatedUser(): Promise<SessionUser | null> {
  const user = await getCurrentUser();
  if ((process.env.AUTH_REQUIRED === "true" || process.env.NODE_ENV === "production") && !user) {
    throw new Error("Unauthorized: active session required.");
  }
  return user;
}
