# syntax=docker/dockerfile:1.7

FROM oven/bun:1.2.22 AS deps
WORKDIR /app

COPY package.json bun.lock tsconfig.base.json tsconfig.json ./
COPY packages/client/package.json packages/client/package.json
COPY packages/editor/package.json packages/editor/package.json
COPY packages/server/package.json packages/server/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN bun install --frozen-lockfile

FROM deps AS builder
WORKDIR /app

COPY . .

RUN bun run --filter @mmo/client build
RUN bun run --filter @mmo/server build

FROM oven/bun:1.2.22 AS server-runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001
ENV AUTH_DB_PATH=/app/data/auth.sqlite

RUN mkdir -p /app/data /app/packages/server/dist /app/shared/src/maps && \
  chown -R bun:bun /app

COPY --from=builder /app/packages/server/dist/index.js /app/packages/server/dist/index.js
COPY --from=builder /app/packages/shared/src/maps /app/shared/src/maps

USER bun

EXPOSE 3001

CMD ["bun", "/app/packages/server/dist/index.js"]

FROM nginx:1.27-alpine AS web-runtime

COPY ops/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/packages/client/dist /usr/share/nginx/html

EXPOSE 80
