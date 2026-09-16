import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

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
    const account = await db.user.findUnique({ where: { id: currentUser.id }, select: { passwordHash: true } });
    if (!account?.passwordHash || !(await bcrypt.compare(currentPassword, account.passwordHash))) return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
    await db.user.update({ where: { id: currentUser.id }, data: { passwordHash: await bcrypt.hash(newPassword, 12) } });
    await db.session.deleteMany({ where: { userId: currentUser.id } });
    return NextResponse.json({ success: true, message: "Password updated. Please sign in again." });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Unable to update password." }, { status: 500 });
  }
}