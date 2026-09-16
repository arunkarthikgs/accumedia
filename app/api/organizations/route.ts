import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuthenticatedUser } from "@/lib/tenant-auth";
import { unstable_cache } from "next/cache";
import { timeDbOperation } from "@/lib/perf";

const getOrganizationsForScope = (organizationId: string | null, isSuperAdmin: boolean) => unstable_cache(
  () => db.organization.findMany({
    where: isSuperAdmin ? undefined : organizationId ? { id: organizationId } : { id: "__no_organization__" },
    select: { id: true, name: true, slug: true },
    orderBy: { name: "asc" },
  }),
  ["organization-selector", organizationId || "none", isSuperAdmin ? "super-admin" : "tenant"],
  { revalidate: 60, tags: ["organizations"] },
);

export async function GET() {
  try {
    const user = await requireAuthenticatedUser();
    const organizations = await timeDbOperation("organization selector", () => getOrganizationsForScope(user?.organizationId || null, Boolean(user?.isSuperAdmin))());

    return NextResponse.json({ success: true, organizations });
  } catch (error: any) {
    console.error("Failed to fetch organizations:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch organizations" },
      { status: 500 }
    );
  }
}
