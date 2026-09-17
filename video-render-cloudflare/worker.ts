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

export default {
  async fetch(request: Request, environment: typeof env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") return new Response("ok");
    if (url.pathname !== "/jobs" && url.pathname !== "/image-jobs") return new Response("Not found", { status: 404 });
    const container = getContainer(url.pathname === "/image-jobs" ? environment.IMAGE_RENDERER : environment.VIDEO_RENDERER, url.pathname === "/image-jobs" ? "image-renderer-v1" : "video-renderer-v12");
    await container.startAndWaitForPorts({
      ports: [8080],
      startOptions: {
        envVars: {
          NODE_ENV: "production",
          VIDEO_RENDER_SERVICE_SECRET: environment.VIDEO_RENDER_SERVICE_SECRET,
          VIDEO_RENDER_CALLBACK_SECRET: environment.VIDEO_RENDER_CALLBACK_SECRET,
          OPENAI_API_KEY: environment.OPENAI_API_KEY,
          CLOUDFLARE_ACCOUNT_ID: environment.CLOUDFLARE_ACCOUNT_ID,
          R2_ACCESS_KEY_ID: environment.R2_ACCESS_KEY_ID,
          R2_SECRET_ACCESS_KEY: environment.R2_SECRET_ACCESS_KEY,
          R2_BUCKET_NAME: environment.R2_BUCKET_NAME,
        },
      },
      cancellationOptions: { portReadyTimeoutMS: 60_000 },
    });
    const containerRequest = new Request(`http://container${url.pathname}`, request);
    return container.fetch(containerRequest);
  },
};
