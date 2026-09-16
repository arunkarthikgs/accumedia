import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/tenant-auth";
import { query } from "@/lib/worker-db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireAuthenticatedUser();
    const scopeId = user?.isSuperAdmin ? null : user?.organizationId;
    const { rows: organizations } = await query<{ id: string; name: string; slug: string }>(
      `SELECT id, name, slug
       FROM macula.macula_organizations
       WHERE ($1::text IS NULL OR id = $1)
       ORDER BY name ASC`,
      [scopeId || null]
    );

    return NextResponse.json({ success: true, organizations });
  } catch (error: any) {
    console.error("Failed to fetch organizations:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch organizations" },
      { status: 500 }
    );
  }
}
