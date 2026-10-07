FROM node:22-bookworm-slim AS deps

WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/config/package.json packages/config/package.json
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run build
RUN npm run build -w @sap/web

FROM node:22-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends fontconfig fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/apps/api/package.json apps/api/package.json
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/migrations apps/api/migrations
COPY --from=build /app/apps/web/package.json apps/web/package.json
COPY --from=build /app/apps/web/.next apps/web/.next
COPY --from=build /app/apps/web/public apps/web/public
COPY --from=build /app/apps/worker/package.json apps/worker/package.json
COPY --from=build /app/apps/worker/dist apps/worker/dist
COPY --from=build /app/apps/worker/assets apps/worker/assets
COPY --from=build /app/apps/worker/assets/fonts/*.ttf /usr/local/share/fonts/sap/
RUN fc-cache -f && node --input-type=module -e "import('./apps/worker/dist/poster/poster-renderer.js').then(m => m.assertPosterFonts())"
COPY --from=build /app/packages/config/package.json packages/config/package.json
COPY --from=build /app/packages/config/dist packages/config/dist

EXPOSE 3000 3001
