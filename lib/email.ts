import { getCloudflareContext } from "@opennextjs/cloudflare";
import { buildPasswordEmail } from "@/lib/password-email-template";

export async function sendPasswordSetupEmail(input: { email: string; name: string; organizationName: string; token: string; reason: "welcome" | "reset" }) {
  let runtimeAppUrl = "";
  try {
    const runtimeEnv = getCloudflareContext({ async: false }).env as typeof globalThis & { NEXT_PUBLIC_APP_URL?: string };
    runtimeAppUrl = runtimeEnv.NEXT_PUBLIC_APP_URL || "";
  } catch {
    // Local development falls back to process.env.NEXT_PUBLIC_APP_URL.
  }
  const appUrl = (runtimeAppUrl || process.env.NEXT_PUBLIC_APP_URL || "https://accumedia.inofinix.com").replace(/\/$/, "");
  const from = process.env.SMTP_FROM || process.env.EMAIL_FROM;
  if (!from || !appUrl) {
    console.warn("Password setup email not sent: SMTP_FROM/EMAIL_FROM and NEXT_PUBLIC_APP_URL are required.");
    return { sent: false };
  }
  const subject = input.reason === "welcome" ? `Welcome to Accumedia, ${input.name}` : "Reset your Accumedia password";
  const message = buildPasswordEmail({
    appUrl,
    appName: "Accumedia",
    fromName: "Accumedia Platform",
    name: input.name,
    email: input.email,
    organizationName: input.organizationName,
    token: input.token,
    reason: input.reason,
  });
  const messageWithSender = {
    to: input.email,
    from,
    subject,
    html: message,
  };
  let serviceBinding: { fetch(request: Request): Promise<Response> } | undefined;
  try {
    const runtimeEnv = getCloudflareContext({ async: false }).env as typeof globalThis & { EMAIL_SERVICE?: { fetch(request: Request): Promise<Response> } };
    serviceBinding = runtimeEnv.EMAIL_SERVICE;
  } catch {
    // Local development can use EMAIL_SERVICE_URL instead.
  }
  const serviceUrl = (process.env.EMAIL_SERVICE_URL || "").replace(/\/$/, "");
  if (serviceBinding || serviceUrl) {
    const response = serviceBinding
      ? await serviceBinding.fetch(new Request("https://email-service/email/send", { method: "POST", headers: { "Content-Type": "application/json", "X-Email-Service-Secret": process.env.EMAIL_SERVICE_SECRET || "" }, body: JSON.stringify(messageWithSender) }))
      : await fetch(`${serviceUrl}/email/send`, { method: "POST", headers: { "Content-Type": "application/json", "X-Email-Service-Secret": process.env.EMAIL_SERVICE_SECRET || "" }, body: JSON.stringify(messageWithSender) });
    if (!response.ok) throw new Error(`Email service delivery failed (${response.status}).`);
    return { sent: true };
  }
  throw new Error("Email service is not configured. Deploy accumedia-utility with SMTP secrets.");
}
