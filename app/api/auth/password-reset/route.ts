import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { query } from "@/lib/worker-db";

export async function POST(req: Request) {
  try {
    const { token, password, confirmPassword } = await req.json();
    if (typeof token !== "string" || typeof password !== "string" || password.length < 8) return NextResponse.json({ error: "A valid setup token and password of at least 8 characters are required." }, { status: 400 });
    if (password !== confirmPassword) return NextResponse.json({ error: "Passwords do not match." }, { status: 400 });
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const user = (await query<any>(`SELECT id FROM macula.users WHERE "passwordResetTokenHash"=$1 AND "passwordResetExpiresAt">NOW() AND "isActive"=TRUE LIMIT 1`, [tokenHash])).rows[0];
    if (!user) return NextResponse.json({ error: "This password setup link is invalid or expired." }, { status: 400 });
    await query(`UPDATE macula.users SET password_hash=$1, "mustSetPassword"=FALSE, "passwordResetTokenHash"=NULL, "passwordResetExpiresAt"=NULL, "updatedAt"=NOW() WHERE id=$2`, [await bcrypt.hash(password, 12), user.id]);
    await query(`DELETE FROM macula.sessions WHERE "userId"=$1`, [user.id]);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Unable to set password." }, { status: 500 });
  }
}