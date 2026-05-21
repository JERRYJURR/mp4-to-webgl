# Playwright base image: ships node 20, Chromium, and all system libs needed
# for headless WebGL2. Pinned to match the playwright npm version.
FROM mcr.microsoft.com/playwright:v1.50.0-jammy AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM mcr.microsoft.com/playwright:v1.50.0-jammy AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM mcr.microsoft.com/playwright:v1.50.0-jammy AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json
COPY --from=builder /app/next.config.mjs ./next.config.mjs
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/middleware.ts ./middleware.ts
COPY --from=builder /app/app ./app
COPY --from=builder /app/components ./components
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/scripts ./scripts

# Bundled sample mp4s — seeded on first run (idempotent).
COPY --from=builder /app/videos ./videos

EXPOSE 3000

# Seed runs against /app/videos. If a persistent volume is mounted there, the
# bundled samples are invisible (overlay) — that's expected; users can upload.
# Without a volume, every restart re-seeds fresh sample entries.
CMD sh -c "npm run seed || true; npx next start -p 3000 -H 0.0.0.0"
