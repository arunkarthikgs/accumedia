import express from "express";
import nodemailer from "nodemailer";

const app = express();
app.use(express.json({ limit: "256kb" }));
const port = Number(process.env.PORT || 8080);
const serviceSecret = process.env.EMAIL_SERVICE_SECRET || "";

function authorized(req: express.Request) {
  return Boolean(serviceSecret) && req.header("x-email-service-secret") === serviceSecret;
}

function transporter() {
  const host = process.env.SMTP_HOST;
  if (!host) throw new Error("SMTP_HOST is not configured.");
  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || "false").toLowerCase() === "true",
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT_MS || 10000),
    greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT_MS || 10000),
    socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT_MS || 20000),
  });
}

app.get("/health", (_req, res) => res.status(200).json({ ok: true }));

app.post("/send", async (req, res) => {
  if (!authorized(req)) return res.status(401).json({ error: "Unauthorized." });
  const body = req.body as { to?: string | string[]; subject?: string; html?: string; text?: string; from?: string };
  if (!body.to || !body.subject || (!body.html && !body.text)) return res.status(400).json({ error: "to, subject, and html or text are required." });
  try {
    const info = await transporter().sendMail({
      from: body.from || process.env.SMTP_FROM || "no-reply@accumedia.local",
      to: body.to,
      subject: body.subject,
      html: body.html,
      text: body.text,
    });
    return res.json({ sent: true, messageId: info.messageId });
  } catch (error) {
    console.error("SMTP delivery failed:", error);
    return res.status(502).json({ error: error instanceof Error ? error.message : "SMTP delivery failed." });
  }
});

app.listen(port, () => console.log(`Accumedia email service listening on ${port}`));
