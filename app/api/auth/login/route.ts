import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { query } from "@/lib/worker-db";

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function POST(req: Request) {
  try {
    const { userId, password } = await req.json();
    if (!userId || !password) return NextResponse.json({ error: "User ID and password are required." }, { status: 400 });

    const { rows } = await query<{ id: string; password_hash: string | null }>(
      `SELECT id, password_hash
       FROM macula.macula_users
       WHERE email = $1 OR id = $1
       LIMIT 1`,
      [userId]
    );
    const user = rows[0];
    if (!user?.password_hash || !(await bcrypt.compare(password, user.password_hash))) {
      return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const sessionId = crypto.randomUUID();
    await query(
      `INSERT INTO macula.macula_sessions (id, "tokenHash", "userId", "expiresAt")
       VALUES ($1, $2, $3, $4)`,
      [sessionId, hashToken(token), user.id, new Date(Date.now() + 8 * 60 * 60 * 1000)]
    );

    const response = NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
    response.cookies.set("macula_session", token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 8 * 60 * 60 });
    return response;
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Login failed." }, { status: 500 });
  }
}
