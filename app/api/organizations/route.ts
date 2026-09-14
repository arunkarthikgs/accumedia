import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const organizations = await db.organization.findMany({
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
