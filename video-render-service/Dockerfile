FROM --platform=linux/amd64 node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates python3 make g++ fonts-dejavu \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ARG IMAGE_SCREEN_VERSION=2
RUN echo "image-screen-version=${IMAGE_SCREEN_VERSION}"
COPY video-render-service/package.json ./package.json
RUN npm install
COPY video-render-service/server.ts ./video-render-service/server.ts
COPY video-render-service/image-renderer.ts ./video-render-service/image-renderer.ts
COPY lib ./lib
RUN npm run build

ENV NODE_ENV=production
EXPOSE 8080
CMD ["npm", "start"]
