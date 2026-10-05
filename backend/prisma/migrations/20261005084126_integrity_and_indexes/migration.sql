-- Integridade no banco e índices pelas consultas reais.
-- O Prisma gerou a parte de tipos e índices; os CHECK foram escritos à mão (o schema do
-- Prisma não os representa, e o migrate não os remove).

-- Login e nome de categoria sem diferenciar maiúsculas: "Ana" e "ana" são o mesmo usuário,
-- "TI" e "ti" a mesma categoria. O USING converte sem perder os dados (o Prisma recriaria
-- as colunas vazias).
CREATE EXTENSION IF NOT EXISTS citext;

ALTER TABLE "users" ALTER COLUMN "username" TYPE CITEXT USING "username"::citext;
ALTER TABLE "categories" ALTER COLUMN "name" TYPE CITEXT USING "name"::citext;

-- Usuário desativado não entra e perde as sessões; as solicitações e o histórico dele ficam.
ALTER TABLE "users" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;

-- As regras que a API valida também valem para quem grava direto por SQL (usuários e
-- categorias novos entram assim). O citext não tem limite de tamanho: vai no CHECK.
ALTER TABLE "users"
  ADD CONSTRAINT "users_username_check" CHECK (char_length("username") BETWEEN 1 AND 40 AND "username" = btrim("username")),
  ADD CONSTRAINT "users_name_check" CHECK (char_length(btrim("name")) > 0);

ALTER TABLE "categories"
  ADD CONSTRAINT "categories_name_check" CHECK (char_length("name") BETWEEN 1 AND 60 AND "name" = btrim("name")),
  -- Com SLA zero ou negativo, toda solicitação nasceria fora do prazo.
  ADD CONSTRAINT "categories_sla_hours_check" CHECK ("sla_hours" > 0);

ALTER TABLE "requests"
  ADD CONSTRAINT "requests_title_check" CHECK (char_length("title") BETWEEN 3 AND 120),
  ADD CONSTRAINT "requests_description_check" CHECK (char_length("description") BETWEEN 1 AND 2000),
  ADD CONSTRAINT "requests_due_at_check" CHECK ("due_at" > "created_at");

ALTER TABLE "request_status_history"
  -- Uma mudança muda alguma coisa.
  ADD CONSTRAINT "request_status_history_change_check" CHECK ("from_status" IS DISTINCT FROM "to_status"),
  -- Só o registro de abertura não tem status de origem, e ele sempre vai para OPEN.
  ADD CONSTRAINT "request_status_history_opening_check" CHECK (("from_status" IS NULL) = ("to_status" = 'OPEN'));

ALTER TABLE "sessions"
  ADD CONSTRAINT "sessions_expires_at_check" CHECK ("expires_at" > "created_at");

-- Índices: cada um serve a uma consulta da API.
-- Saem: status sozinho (três valores, quase não filtra) e requester_id sozinho (o composto
-- abaixo começa por ele e serve também à chave estrangeira).
DROP INDEX "requests_status_idx";
DROP INDEX "requests_requester_id_idx";
DROP INDEX "requests_created_at_idx";

-- Lista do colaborador: WHERE requester_id = ? ORDER BY created_at DESC.
CREATE INDEX "requests_requester_id_created_at_idx" ON "requests"("requester_id", "created_at" DESC);

-- Lista do atendente (todas, da mais nova para a mais antiga) e filtro por período.
CREATE INDEX "requests_created_at_idx" ON "requests"("created_at" DESC);

-- Fora do prazo, no painel e no filtro: status <> 'DONE' AND due_at < agora.
CREATE INDEX "requests_status_due_at_idx" ON "requests"("status", "due_at");

-- Limpeza das sessões vencidas.
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");
