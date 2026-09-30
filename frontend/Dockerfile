# Contexto de build: raiz do repo (o front depende de shared/).
FROM node:24-slim AS build
RUN corepack enable
WORKDIR /app

# Manifestos primeiro: a camada de dependências só é refeita quando eles mudam.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN pnpm install --frozen-lockfile --filter frontend...

COPY shared shared
COPY frontend frontend
RUN pnpm --filter @portal/shared build && pnpm --filter frontend build

FROM nginx:stable-alpine AS runtime
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist/frontend/browser /usr/share/nginx/html
EXPOSE 80
