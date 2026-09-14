import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const [roles, permissions] = await Promise.all([
      db.role.findMany({
        include: {
          rolePermissions: { include: { permission: true } },
        },
        orderBy: { slug: "asc" },
      }),
      db.permission.findMany({
        orderBy: { module: "asc" },
      }),
    ]);

    return NextResponse.json({ roles, permissions });
  } catch (error: any) {
    console.error("Failed to fetch role matrix:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { roleId, permissionId, enabled } = await req.json();

    if (!roleId || !permissionId || typeof enabled !== "boolean") {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

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

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Failed to toggle permission:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
