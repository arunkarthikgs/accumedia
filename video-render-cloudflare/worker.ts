import { Container, getContainer } from "@cloudflare/containers";
import { env } from "cloudflare:workers";

export class VideoRenderer extends Container {
  defaultPort = 8080;
  sleepAfter = "10m";
  enableInternet = true;
  envVars = {
    NODE_ENV: "production",
    VIDEO_RENDER_SERVICE_SECRET: env.VIDEO_RENDER_SERVICE_SECRET,
    VIDEO_RENDER_CALLBACK_SECRET: env.VIDEO_RENDER_CALLBACK_SECRET,
    OPENAI_API_KEY: env.OPENAI_API_KEY,
    CLOUDFLARE_ACCOUNT_ID: env.CLOUDFLARE_ACCOUNT_ID,
    R2_ACCESS_KEY_ID: env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: env.R2_SECRET_ACCESS_KEY,
    R2_BUCKET_NAME: env.R2_BUCKET_NAME,
  };
}

export default {
  async fetch(request: Request, environment: typeof env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") return new Response("ok");
    if (url.pathname !== "/jobs") return new Response("Not found", { status: 404 });
    if (request.headers.get("x-render-secret") !== environment.VIDEO_RENDER_SERVICE_SECRET) {
      return Response.json({ error: "Unauthorized." }, { status: 401 });
    }

    const container = getContainer(environment.VIDEO_RENDERER, "video-renderer");
    return container.fetch(request);
  },
};
