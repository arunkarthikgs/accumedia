import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuthenticatedUser } from "@/lib/tenant-auth";

export async function GET() {
  try {
    const user = await requireAuthenticatedUser();
    const organizations = await db.organization.findMany({
      where: user?.isSuperAdmin ? undefined : user?.organizationId ? { id: user.organizationId } : { id: "__no_organization__" },
      select: {
        id: true,
        name: true,
        slug: true,
      },
      orderBy: {
        name: "asc",
      },
    });

    return NextResponse.json({ success: true, organizations });
  } catch (error: any) {
    console.error("Failed to fetch organizations:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch organizations" },
      { status: 500 }
    );
  }
}
