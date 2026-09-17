# Cloudflare Video Renderer

This is the Cloudflare Containers deployment of the Macula ffmpeg renderer. It uses the same `POST /jobs` contract as the EC2-compatible service in `video-render-service`.

## Deploy

Docker must be running locally because Wrangler builds and pushes the container image during deployment.

From the repository root, configure all renderer and main-Worker secrets from the existing `.env` file:

```sh
./scripts/configure-video-renderer-secrets.sh
```

The script generates shared secrets when they are missing and never prints their values. To configure the renderer manually instead:

```sh
npx wrangler secret put VIDEO_RENDER_SERVICE_SECRET --config video-render-cloudflare/wrangler.jsonc
npx wrangler secret put VIDEO_RENDER_CALLBACK_SECRET --config video-render-cloudflare/wrangler.jsonc
npx wrangler secret put OPENAI_API_KEY --config video-render-cloudflare/wrangler.jsonc
npx wrangler secret put CLOUDFLARE_ACCOUNT_ID --config video-render-cloudflare/wrangler.jsonc
npx wrangler secret put R2_ACCESS_KEY_ID --config video-render-cloudflare/wrangler.jsonc
npx wrangler secret put R2_SECRET_ACCESS_KEY --config video-render-cloudflare/wrangler.jsonc
npx wrangler secret put R2_BUCKET_NAME --config video-render-cloudflare/wrangler.jsonc

npx wrangler deploy --config video-render-cloudflare/wrangler.jsonc
```

Then configure the main application Worker to call the deployed renderer:

```sh
npx wrangler secret put VIDEO_RENDER_SERVICE_URL --config wrangler.toml
npx wrangler secret put VIDEO_RENDER_SERVICE_SECRET --config wrangler.toml
npx wrangler secret put VIDEO_RENDER_CALLBACK_SECRET --config wrangler.toml
```

Set `VIDEO_RENDER_SERVICE_URL` to the deployed `macula-video-renderer` Worker URL. Use the same service and callback secret values on both Workers.

## Local development

Run the renderer Worker with Docker enabled:

```sh
npx wrangler dev --config video-render-cloudflare/wrangler.jsonc --remote
```

The first request may take time while the Container instance starts. The Container has outbound internet enabled because it may call OpenAI TTS and R2.
