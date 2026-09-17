# Video Render Service

This service is intentionally provider-neutral. Run it on AWS EC2, Cloudflare Containers, or another private compute service with Node.js and outbound access to R2/OpenAI.

## Configure

Required environment variables:

- `VIDEO_RENDER_SERVICE_SECRET`: secret accepted by the Worker when submitting jobs
- `VIDEO_RENDER_CALLBACK_SECRET`: secret sent to the Worker callback
- `OPENAI_API_KEY`: used only when the job does not include a voice file
- `CLOUDFLARE_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME`

Configure the application Worker with:

- `VIDEO_RENDER_SERVICE_URL=https://your-render-host.example.com`
- `VIDEO_RENDER_SERVICE_SECRET`
- `VIDEO_RENDER_CALLBACK_SECRET`
- `NEXT_PUBLIC_APP_URL=https://your-worker.example.com`

## Run

From the repository root:

```sh
docker build -f video-render-service/Dockerfile -t macula-video-renderer .
docker run --rm -p 8080:8080 --env-file video-render-service/.env macula-video-renderer
```

The service accepts `POST /jobs`, returns `202`, renders asynchronously, uploads the MP4 to R2, and calls the Worker callback with `READY` or `FAILED`.

For EC2, place the container behind HTTPS and restrict `/jobs` to the Worker or a private network. Use a process supervisor or ECS/EKS later if concurrency grows.
