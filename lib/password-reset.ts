import crypto from "node:crypto";
import { query } from "@/lib/worker-db";
import { sendPasswordSetupEmail } from "@/lib/email";

export async function issuePasswordSetupEmail(input: { userId: string; email: string; name: string; organizationName: string; reason: "welcome" | "reset" }) {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  await query(`UPDATE macula.users SET "passwordResetTokenHash"=$1, "passwordResetExpiresAt"=$2, "mustSetPassword"=TRUE, "updatedAt"=NOW() WHERE id=$3`, [tokenHash, new Date(Date.now() + 24 * 60 * 60 * 1000), input.userId]);
  try {
    return await sendPasswordSetupEmail({ ...input, token });
  } catch (error) {
    console.error("Password setup email delivery failed:", error);
    return { sent: false };
  }
}