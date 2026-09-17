FROM --platform=linux/amd64 node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY video-render-service/package.json ./package.json
RUN npm install --omit=dev
COPY video-render-service/server.ts ./server.ts
COPY lib ./lib

ENV NODE_ENV=production
EXPOSE 8080
CMD ["npm", "start"]
