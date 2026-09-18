export async function sendPasswordSetupEmail(input: { email: string; name: string; organizationName: string; token: string; reason: "welcome" | "reset" }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  if (!apiKey || !from || !appUrl) {
    console.warn("Password setup email not sent: RESEND_API_KEY, EMAIL_FROM, and NEXT_PUBLIC_APP_URL are required.");
    return { sent: false };
  }
  const subject = input.reason === "welcome" ? `Welcome to Accumedia, ${input.name}` : "Reset your Accumedia password";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [input.email],
      subject,
      html: `<p>Hello ${escapeHtml(input.name)},</p><p>${input.reason === "welcome" ? `Your ${escapeHtml(input.organizationName)} Accumedia account is ready.` : "A password reset was requested for your Accumedia account."}</p><p><a href="${appUrl}/reset-password?token=${encodeURIComponent(input.token)}">Set your password</a></p><p>This link expires in 24 hours and can be used only once.</p>`,
    }),
  });
  if (!response.ok) throw new Error(`Email delivery failed (${response.status}).`);
  return { sent: true };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] || character);
}