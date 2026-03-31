FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM deps AS builder
COPY prisma.config.ts ./
COPY prisma ./prisma/
COPY tsconfig*.json nest-cli.json ./
COPY src ./src/
# prisma.config.ts requires DATABASE_URL to load; generate does not connect — placeholder is enough for build.
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build?schema=public
RUN npx prisma generate
RUN npm run build

FROM node:20-bookworm-slim AS runner
RUN apt-get update -y && apt-get install -y \
      openssl \
      chromium \
      fonts-liberation \
      libnss3 \
      libatk-bridge2.0-0 \
      libdrm2 \
      libxkbcommon0 \
      libgbm1 \
      libasound2 \
    && rm -rf /var/lib/apt/lists/*
ENV CHROMIUM_PATH=/usr/bin/chromium
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev && npm install prisma@7.5.0 --no-save && npm cache clean --force
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/dist ./dist
# One-off / cron: `npx tsx scripts/sync-awin-feeds.ts` (streams download + CSV; copy config/awin-feeds.json into /app/config/)
# From build context (./backend), not builder — `scripts/` is not copied into the builder stage.
COPY scripts/sync-awin-feeds.ts ./scripts/sync-awin-feeds.ts
COPY scripts/awin-feed-stream.ts ./scripts/awin-feed-stream.ts
COPY scripts/import-awin-feed.ts ./scripts/import-awin-feed.ts
COPY src/trackings/awin-feed-csv.ts ./src/trackings/awin-feed-csv.ts
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && npx prisma db seed && node dist/main.js"]
