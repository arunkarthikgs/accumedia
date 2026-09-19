import { NextResponse } from "next/server";
import { issuePasswordSetupEmail } from "@/lib/password-reset";
import { query } from "@/lib/worker-db";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!email) {
      return NextResponse.json({ error: "Email is required." }, { status: 400 });
    }

    const user = (await query<{
      id: string;
      name: string;
      email: string;
      organization_name: string | null;
    }>(
      `SELECT u.id, u.name, u.email, o.name AS organization_name
       FROM macula.users u
       LEFT JOIN macula.organizations o ON o.id = u."organizationId"
       WHERE LOWER(u.email) = $1 AND u."isActive"=TRUE
       LIMIT 1`,
      [email]
    )).rows[0];

    if (user) {
      await issuePasswordSetupEmail({
        userId: user.id,
        email: user.email,
        name: user.name,
        organizationName: user.organization_name || "your organization",
        reason: "reset",
      });
    }

    return NextResponse.json({
      success: true,
      message: "If an active account uses that email, a password reset link has been sent.",
    });
  } catch (error) {
    console.error("Forgot password request failed:", error);
    return NextResponse.json({ error: "Unable to process the password reset request." }, { status: 500 });
  }
}