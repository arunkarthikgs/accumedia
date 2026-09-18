import { Container, getContainer } from "@cloudflare/containers";
import { env } from "cloudflare:workers";

export class VideoRenderer extends Container {
  defaultPort = 8080;
  sleepAfter = "10m";
  enableInternet = true;
}

export class ImageRenderer extends Container {
  defaultPort = 8080;
  sleepAfter = "10m";
  enableInternet = true;
}

export class EmailRenderer extends Container {
  defaultPort = 8080;
  sleepAfter = "10m";
  enableInternet = true;
}

export default {
  async fetch(request: Request, environment: typeof env) {
    const runtimeEnvironment = environment as typeof environment & Record<string, any>;
    const url = new URL(request.url);
    if (url.pathname === "/health") return new Response("ok");
    if (url.pathname !== "/jobs" && url.pathname !== "/image-jobs" && url.pathname !== "/image-screen" && url.pathname !== "/email/send") return new Response("Not found", { status: 404 });
    const isImageRequest = url.pathname === "/image-jobs" || url.pathname === "/image-screen";
    const isEmailRequest = url.pathname === "/email/send";
    const container = getContainer(isEmailRequest ? runtimeEnvironment.EMAIL_RENDERER : isImageRequest ? runtimeEnvironment.IMAGE_RENDERER : runtimeEnvironment.VIDEO_RENDERER, isEmailRequest ? "email-renderer-v1" : isImageRequest ? "image-renderer-v2" : "video-renderer-v12");
    await container.startAndWaitForPorts({
      ports: [8080],
      startOptions: {
        envVars: {
          NODE_ENV: "production",
          VIDEO_RENDER_SERVICE_SECRET: runtimeEnvironment.VIDEO_RENDER_SERVICE_SECRET,
          VIDEO_RENDER_CALLBACK_SECRET: runtimeEnvironment.VIDEO_RENDER_CALLBACK_SECRET,
          OPENAI_API_KEY: runtimeEnvironment.OPENAI_API_KEY,
          CLOUDFLARE_ACCOUNT_ID: runtimeEnvironment.CLOUDFLARE_ACCOUNT_ID,
          R2_ACCESS_KEY_ID: runtimeEnvironment.R2_ACCESS_KEY_ID,
          R2_SECRET_ACCESS_KEY: runtimeEnvironment.R2_SECRET_ACCESS_KEY,
          R2_BUCKET_NAME: runtimeEnvironment.R2_BUCKET_NAME,
          SMTP_HOST: runtimeEnvironment.SMTP_HOST,
          SMTP_PORT: runtimeEnvironment.SMTP_PORT,
          SMTP_SECURE: runtimeEnvironment.SMTP_SECURE,
          SMTP_USER: runtimeEnvironment.SMTP_USER,
          SMTP_PASS: runtimeEnvironment.SMTP_PASS,
          SMTP_FROM: runtimeEnvironment.SMTP_FROM,
          EMAIL_SERVICE_SECRET: runtimeEnvironment.EMAIL_SERVICE_SECRET,
        },
      },
      cancellationOptions: { portReadyTimeoutMS: 60_000 },
    });
    const containerRequest = new Request(`http://container${url.pathname}`, request);
    return container.fetch(containerRequest);
  },
};
