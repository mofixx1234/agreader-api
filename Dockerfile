FROM node:22-bookworm-slim AS build

WORKDIR /build

COPY package*.json ./
RUN npm ci

COPY . ./
ARG DATABASE_URL
ARG DIRECT_URL
ENV DATABASE_URL=${DATABASE_URL} \
    DIRECT_URL=${DIRECT_URL}
RUN npm run prisma:generate
RUN npm run build
RUN npm prune --omit=dev


FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=4000 \
    API_PREFIX=/api/v1 \
    STORAGE_ROOT=/app/storage \
    SOFFICE_PATH=/usr/bin/soffice

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    fontconfig \
    fonts-dejavu \
    fonts-liberation \
    libreoffice \
    poppler-utils \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /build/package*.json ./
COPY --from=build /build/node_modules ./node_modules
COPY --from=build /build/dist ./dist
COPY --from=build /build/prisma ./prisma

RUN mkdir -p /app/storage/uploads /app/storage/documents

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 4000) + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "dist/server.js"]
