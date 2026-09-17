import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/tenant-auth";
import { query } from "@/lib/worker-db";

export async function GET() {
  try {
    await requireAuthenticatedUser();
    const { rows: specialties } = await query<{ id: string; name: string; category: string }>(
      `SELECT id, name, category
       FROM macula.specialties
       WHERE "isActive" = TRUE
       ORDER BY "sortOrder" ASC, name ASC`
    );
    return NextResponse.json({ specialties });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Unable to load specialties." }, { status: 500 });
  }
}