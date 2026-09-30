# Contexto de build: raiz do repo (a API depende de shared/).
FROM node:24-slim AS base
RUN corepack enable
WORKDIR /app

FROM base AS build
# Manifestos primeiro: a camada de dependências só é refeita quando eles mudam.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY shared/package.json shared/
COPY frontend/package.json frontend/
COPY backend/package.json backend/prisma7.config.ts backend/
# O postinstall do backend roda `prisma generate`, que precisa do schema.
COPY backend/prisma backend/prisma
RUN pnpm install --frozen-lockfile --filter backend...

COPY shared shared
COPY backend backend
RUN pnpm --filter @portal/shared build && pnpm --filter backend build

FROM node:24-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app /app
WORKDIR /app/backend
USER node
EXPOSE 3000
# Aplica as migrações pendentes e o seed (idempotente) e só então sobe a API.
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/seed.js && exec node dist/main"]
