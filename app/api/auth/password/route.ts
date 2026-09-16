import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/worker-db";

export async function POST(req: Request) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const body = await req.json();
    const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
    const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
    const confirmPassword = typeof body.confirmPassword === "string" ? body.confirmPassword : "";
    if (!currentPassword || newPassword.length < 8) return NextResponse.json({ error: "Current password and a new password of at least 8 characters are required." }, { status: 400 });
    if (newPassword !== confirmPassword) return NextResponse.json({ error: "New password and confirmation do not match." }, { status: 400 });
    const { rows } = await query<{ password_hash: string | null }>(
      `SELECT password_hash FROM macula.macula_users WHERE id = $1 LIMIT 1`,
      [currentUser.id]
    );
    if (!rows[0]?.password_hash || !(await bcrypt.compare(currentPassword, rows[0].password_hash))) return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
    await query(`UPDATE macula.macula_users SET password_hash = $1 WHERE id = $2`, [await bcrypt.hash(newPassword, 12), currentUser.id]);
    await query(`DELETE FROM macula.macula_sessions WHERE "userId" = $1`, [currentUser.id]);
    return NextResponse.json({ success: true, message: "Password updated. Please sign in again." });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Unable to update password." }, { status: 500 });
  }
}