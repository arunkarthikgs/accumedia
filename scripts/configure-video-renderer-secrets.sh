#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT_DIR"

if [ ! -f .env ]; then
  printf '%s\n' "Missing .env in $ROOT_DIR" >&2
  exit 1
fi

read_env_value() {
  variable_name=$1
  awk -v key="$variable_name" '
    index($0, key "=") == 1 {
      value = substr($0, length(key) + 2)
      if (value ~ /^".*"$/) { sub(/^"/, "", value); sub(/"$/, "", value) }
      found = value
    }
    END { if (found != "") print found }
  ' .env
}

require_value() {
  variable_name=$1
  variable_value=$(read_env_value "$variable_name")
  if [ -z "$variable_value" ]; then
    printf '%s\n' "Missing $variable_name in .env" >&2
    exit 1
  fi
}

OPENAI_API_KEY=$(read_env_value OPENAI_API_KEY)
CLOUDFLARE_ACCOUNT_ID=$(read_env_value CLOUDFLARE_ACCOUNT_ID)
R2_ACCESS_KEY_ID=$(read_env_value R2_ACCESS_KEY_ID)
R2_SECRET_ACCESS_KEY=$(read_env_value R2_SECRET_ACCESS_KEY)
R2_BUCKET_NAME=$(read_env_value R2_BUCKET_NAME)

for required_value in OPENAI_API_KEY CLOUDFLARE_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET_NAME; do
  eval "value=\${$required_value}"
  if [ -z "$value" ]; then
    printf '%s\n' "Missing $required_value in .env" >&2
    exit 1
  fi
done

SERVICE_SECRET=$(read_env_value VIDEO_RENDER_SERVICE_SECRET)
CALLBACK_SECRET=$(read_env_value VIDEO_RENDER_CALLBACK_SECRET)
RENDERER_URL=$(read_env_value VIDEO_RENDER_SERVICE_URL)
if [ -z "$RENDERER_URL" ]; then RENDERER_URL=https://macula-video-renderer.arunkarthikgs.workers.dev; fi

if [ -z "$SERVICE_SECRET" ]; then SERVICE_SECRET=$(openssl rand -hex 32); fi
if [ -z "$CALLBACK_SECRET" ]; then CALLBACK_SECRET=$(openssl rand -hex 32); fi

put_secret() {
  secret_name=$1
  secret_value=$2
  printf '%s' "$secret_value" | npx wrangler secret put "$secret_name" --config "$3" >/dev/null
}

RENDERER_CONFIG=video-render-cloudflare/wrangler.jsonc
APP_CONFIG=wrangler.toml

printf '%s\n' "Configuring Cloudflare renderer secrets..."
put_secret VIDEO_RENDER_SERVICE_SECRET "$SERVICE_SECRET" "$RENDERER_CONFIG"
put_secret VIDEO_RENDER_CALLBACK_SECRET "$CALLBACK_SECRET" "$RENDERER_CONFIG"
put_secret OPENAI_API_KEY "$OPENAI_API_KEY" "$RENDERER_CONFIG"
put_secret CLOUDFLARE_ACCOUNT_ID "$CLOUDFLARE_ACCOUNT_ID" "$RENDERER_CONFIG"
put_secret R2_ACCESS_KEY_ID "$R2_ACCESS_KEY_ID" "$RENDERER_CONFIG"
put_secret R2_SECRET_ACCESS_KEY "$R2_SECRET_ACCESS_KEY" "$RENDERER_CONFIG"
put_secret R2_BUCKET_NAME "$R2_BUCKET_NAME" "$RENDERER_CONFIG"

printf '%s\n' "Configuring main application Worker secrets..."
put_secret VIDEO_RENDER_SERVICE_URL "$RENDERER_URL" "$APP_CONFIG"
put_secret VIDEO_RENDER_SERVICE_SECRET "$SERVICE_SECRET" "$APP_CONFIG"
put_secret VIDEO_RENDER_CALLBACK_SECRET "$CALLBACK_SECRET" "$APP_CONFIG"

printf '%s\n' "Video renderer secrets configured successfully."
printf '%s\n' "Renderer URL: $RENDERER_URL"
