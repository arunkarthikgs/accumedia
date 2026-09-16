import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuthenticatedUser } from "@/lib/tenant-auth";

export async function GET() {
  try {
    await requireAuthenticatedUser();
    const specialties = await db.specialty.findMany({ where: { isActive: true }, select: { id: true, name: true, category: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
    return NextResponse.json({ specialties });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Unable to load specialties." }, { status: 500 });
  }
}