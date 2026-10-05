# Contexto de build: raiz do repo (a API depende de shared/).
FROM node:24-slim AS base
RUN corepack enable
WORKDIR /app

# Manifestos, schema e config do Prisma: tudo o que o `pnpm install` lê. As duas
# etapas de install partem daqui, então só são refeitas quando isso muda.
FROM base AS manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY shared/package.json shared/
COPY frontend/package.json frontend/
COPY backend/package.json backend/prisma7.config.ts backend/
# O postinstall do backend roda `prisma generate`, que precisa do schema.
COPY backend/prisma backend/prisma

FROM manifests AS build
# Install completo (com dev) só para compilar; nada desta etapa vai inteiro para a imagem final.
RUN pnpm install --frozen-lockfile --filter backend...
COPY shared shared
COPY backend backend
RUN pnpm --filter @portal/shared build && pnpm --filter backend build

FROM manifests AS prod-deps
# Só as dependências de produção do backend e do shared. O CLI do Prisma é
# dependency (não dev) porque o CMD roda `prisma migrate deploy` na subida; o
# postinstall do @prisma/engines baixa aqui o schema engine que a migração usa.
RUN pnpm install --frozen-lockfile --prod --filter backend...

FROM node:24-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
# node_modules de produção: o store do pnpm na raiz e os links de cada pacote.
COPY --from=prod-deps --chown=node:node /app/node_modules node_modules
COPY --from=prod-deps --chown=node:node /app/shared/node_modules shared/node_modules
COPY --from=prod-deps --chown=node:node /app/backend/node_modules backend/node_modules
# O backend importa @portal/shared pelo package.json dele, que aponta para dist/.
COPY --from=build --chown=node:node /app/shared/package.json shared/
COPY --from=build --chown=node:node /app/shared/dist shared/dist
# package.json do backend traz o "type": "module" que o Node usa para ler o dist/.
# prisma/ e prisma7.config.ts são o que o `migrate deploy` lê (schema e migrações).
COPY --from=build --chown=node:node /app/backend/package.json /app/backend/prisma7.config.ts backend/
COPY --from=build --chown=node:node /app/backend/prisma backend/prisma
COPY --from=build --chown=node:node /app/backend/dist backend/dist
WORKDIR /app/backend
USER node
EXPOSE 3000
# Aplica as migrações pendentes e o seed (idempotente) e só então sobe a API.
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/seed.js && exec node dist/main"]
