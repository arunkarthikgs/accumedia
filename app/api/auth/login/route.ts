import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { db } from "@/lib/db";

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function POST(req: Request) {
  try {
    const { userId, password } = await req.json();
    if (!userId || !password) return NextResponse.json({ error: "User ID and password are required." }, { status: 400 });

    const user = await db.user.findFirst({
      where: { OR: [{ email: userId }, { id: userId }] },
      select: { id: true, passwordHash: true },
    });
    if (!user?.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
      return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
    }

    const token = crypto.randomBytes(32).toString("hex");
    await db.session.create({
      data: { tokenHash: hashToken(token), userId: user.id, expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000) },
    });

    const response = NextResponse.json({ success: true });
    response.cookies.set("macula_session", token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 8 * 60 * 60 });
    return response;
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Login failed." }, { status: 500 });
  }
}
