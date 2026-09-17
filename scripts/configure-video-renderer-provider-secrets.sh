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

put_secret() {
  secret_name=$1
  secret_value=$2
  config_path=$3
  printf '%s' "$secret_value" | npx wrangler secret put "$secret_name" --config "$config_path" >/dev/null
}

RENDERER_CONFIG=video-render-cloudflare/wrangler.jsonc
APP_CONFIG=wrangler.toml
RENDERER_URL=$(read_env_value VIDEO_RENDER_SERVICE_URL)
if [ -z "$RENDERER_URL" ]; then RENDERER_URL=https://accumedia-video-renderer.arunkarthikgs.workers.dev; fi

printf '%s\n' "Configuring provider and R2 secrets on the renderer Worker..."
put_secret OPENAI_API_KEY "$OPENAI_API_KEY" "$RENDERER_CONFIG"
put_secret CLOUDFLARE_ACCOUNT_ID "$CLOUDFLARE_ACCOUNT_ID" "$RENDERER_CONFIG"
put_secret R2_ACCESS_KEY_ID "$R2_ACCESS_KEY_ID" "$RENDERER_CONFIG"
put_secret R2_SECRET_ACCESS_KEY "$R2_SECRET_ACCESS_KEY" "$RENDERER_CONFIG"
put_secret R2_BUCKET_NAME "$R2_BUCKET_NAME" "$RENDERER_CONFIG"

printf '%s\n' "Configuring R2 secrets on the main application Worker..."
put_secret CLOUDFLARE_ACCOUNT_ID "$CLOUDFLARE_ACCOUNT_ID" "$APP_CONFIG"
put_secret R2_ACCESS_KEY_ID "$R2_ACCESS_KEY_ID" "$APP_CONFIG"
put_secret R2_SECRET_ACCESS_KEY "$R2_SECRET_ACCESS_KEY" "$APP_CONFIG"
put_secret R2_BUCKET_NAME "$R2_BUCKET_NAME" "$APP_CONFIG"
printf '%s' "$RENDERER_URL" | npx wrangler secret put VIDEO_RENDER_SERVICE_URL --config "$APP_CONFIG" >/dev/null

printf '%s\n' "Provider and R2 secrets configured successfully."
printf '%s\n' "Renderer URL: $RENDERER_URL"
