import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get("macula_session")?.value;
  if (token) {
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    await db.session.deleteMany({ where: { tokenHash } });
  }
  const response = NextResponse.json({ success: true });
  response.cookies.set("macula_session", "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
  return response;
}
