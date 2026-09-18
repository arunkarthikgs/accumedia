import { Container, getContainer } from "@cloudflare/containers";
import { env } from "cloudflare:workers";

export class EmailService extends Container {
  defaultPort = 8080;
  sleepAfter = "5m";
  enableInternet = true;
}

export default {
  async fetch(request: Request, environment: typeof env) {
    const emailEnvironment = environment as typeof environment & Record<string, any>;
    const container = getContainer(emailEnvironment.EMAIL_SERVICE, "accumedia-email-service");
    await container.startAndWaitForPorts({
      ports: [8080],
      startOptions: {
        envVars: {
          NODE_ENV: "production",
          SMTP_HOST: emailEnvironment.SMTP_HOST,
          SMTP_PORT: emailEnvironment.SMTP_PORT,
          SMTP_SECURE: emailEnvironment.SMTP_SECURE,
          SMTP_USER: emailEnvironment.SMTP_USER,
          SMTP_PASS: emailEnvironment.SMTP_PASS,
          SMTP_FROM: emailEnvironment.SMTP_FROM,
          SMTP_CONNECTION_TIMEOUT_MS: emailEnvironment.SMTP_CONNECTION_TIMEOUT_MS,
          SMTP_GREETING_TIMEOUT_MS: emailEnvironment.SMTP_GREETING_TIMEOUT_MS,
          SMTP_SOCKET_TIMEOUT_MS: emailEnvironment.SMTP_SOCKET_TIMEOUT_MS,
          EMAIL_SERVICE_SECRET: emailEnvironment.EMAIL_SERVICE_SECRET,
        },
      },
      cancellationOptions: { portReadyTimeoutMS: 60_000 },
    });
    return container.fetch(new Request("http://container/send", request));
  },
};
