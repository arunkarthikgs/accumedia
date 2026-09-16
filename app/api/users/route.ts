import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuthenticatedUser } from "@/lib/tenant-auth";

export async function GET() {
  try {
    const user = await requireAuthenticatedUser();
    const users = await db.user.findMany({
      where: user?.isSuperAdmin ? undefined : user?.organizationId ? { organizationId: user.organizationId } : { organizationId: "__no_organization__" },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        name: "asc",
      },
    });

    return NextResponse.json({ success: true, users });
  } catch (error: any) {
    console.error("Failed to fetch users:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch users" },
      { status: 500 }
    );
  }
}
