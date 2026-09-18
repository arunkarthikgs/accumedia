import { Container, getContainer } from "@cloudflare/containers";
import { env } from "cloudflare:workers";

export class EmailService extends Container {
  defaultPort = 8080;
  sleepAfter = "5m";
  enableInternet = true;
  envVars = Object.fromEntries(
    ["SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASS", "SMTP_FROM", "SMTP_CONNECTION_TIMEOUT_MS", "SMTP_GREETING_TIMEOUT_MS", "SMTP_SOCKET_TIMEOUT_MS", "EMAIL_SERVICE_SECRET"]
      .map((key) => [key, (this as any).env?.[key]])
      .filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
}

export default {
  async fetch(request: Request, environment: typeof env) {
    const emailEnvironment = environment as typeof environment & Record<string, any>;
    const container = getContainer(emailEnvironment.EMAIL_SERVICE, "accumedia-email-service");
    const url = new URL(request.url);
    return container.fetch(new Request(`http://container${url.pathname}${url.search}`, request));
  },
};
