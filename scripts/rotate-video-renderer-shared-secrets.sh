#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT_DIR"

WRANGLER="npx wrangler"
RENDERER_CONFIG=video-render-cloudflare/wrangler.jsonc
APP_CONFIG=wrangler.toml

SERVICE_SECRET=$(/usr/bin/openssl rand -hex 32)
CALLBACK_SECRET=$(/usr/bin/openssl rand -hex 32)

put_secret() {
  secret_name=$1
  secret_value=$2
  config_path=$3
  printf '%s' "$secret_value" | $WRANGLER secret put "$secret_name" --config "$config_path" >/dev/null
}

printf '%s\n' "Rotating video renderer shared secrets..."
put_secret VIDEO_RENDER_SERVICE_SECRET "$SERVICE_SECRET" "$RENDERER_CONFIG"
put_secret VIDEO_RENDER_CALLBACK_SECRET "$CALLBACK_SECRET" "$RENDERER_CONFIG"
put_secret VIDEO_RENDER_SERVICE_SECRET "$SERVICE_SECRET" "$APP_CONFIG"
put_secret VIDEO_RENDER_CALLBACK_SECRET "$CALLBACK_SECRET" "$APP_CONFIG"

printf '%s\n' "Redeploying renderer so the fresh Container instance receives the secrets..."
$WRANGLER deploy --config "$RENDERER_CONFIG" >/dev/null

printf '%s\n' "Shared renderer secrets rotated and deployed successfully."
printf '%s\n' "The main application Worker does not need a separate deploy for secret changes."
