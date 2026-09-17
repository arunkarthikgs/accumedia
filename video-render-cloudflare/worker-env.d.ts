declare module "cloudflare:workers" {
  export const env: {
    VIDEO_RENDERER: DurableObjectNamespace;
    VIDEO_RENDER_SERVICE_SECRET: string;
    VIDEO_RENDER_CALLBACK_SECRET: string;
    OPENAI_API_KEY: string;
    CLOUDFLARE_ACCOUNT_ID: string;
    R2_ACCESS_KEY_ID: string;
    R2_SECRET_ACCESS_KEY: string;
    R2_BUCKET_NAME: string;
  };
}
