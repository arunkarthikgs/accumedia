import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/tenant-auth";

export async function GET() {
  try {
    const user = await requireAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    return NextResponse.json({ user });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Unable to load current user." }, { status: 401 });
  }
}
