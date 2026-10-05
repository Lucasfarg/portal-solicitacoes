-- Responsável pelo atendimento, exclusão lógica e tentativas de login no banco.
-- Escrita à mão no formato que o Prisma gera (nomes de índices e chaves pela convenção dele,
-- para o migrate não ver diferença); os CHECK e o preenchimento são extras, como na migração
-- anterior.

-- Responsável: o atendente que iniciou o atendimento; só ele conclui.
ALTER TABLE "requests" ADD COLUMN "assignee_id" INTEGER;

-- As que já saíram de Aberto ganham como responsável quem as levou para Em Atendimento,
-- tirado do histórico; sem isso o CHECK abaixo recusaria as linhas existentes.
UPDATE "requests" r
SET "assignee_id" = h."changed_by"
FROM "request_status_history" h
WHERE h."request_id" = r."id" AND h."to_status" = 'IN_PROGRESS';

-- Exclusão lógica: excluir grava o instante, e a linha e o histórico ficam para auditoria.
ALTER TABLE "requests" ADD COLUMN "deleted_at" TIMESTAMPTZ(3);

ALTER TABLE "requests"
  -- Em Aberto ninguém atende ainda; fora de Aberto sempre há um responsável.
  ADD CONSTRAINT "requests_assignee_check" CHECK (("status" = 'OPEN') = ("assignee_id" IS NULL)),
  -- Só se exclui em Aberto, e uma excluída não muda mais de status.
  ADD CONSTRAINT "requests_deleted_at_check" CHECK ("deleted_at" IS NULL OR "status" = 'OPEN');

-- Chave estrangeira: sem índice, apagar um usuário varreria requests para conferir o RESTRICT.
-- Serve também a "as que eu atendo".
CREATE INDEX "requests_assignee_id_idx" ON "requests"("assignee_id");

-- AddForeignKey
ALTER TABLE "requests" ADD CONSTRAINT "requests_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Erros de login do último minuto, para o limite de tentativas valer com várias instâncias
-- da API e depois de um reinício (antes a contagem ficava na memória do processo).
CREATE TABLE "login_failures" (
    "id" SERIAL NOT NULL,
    "ip" VARCHAR(45) NOT NULL,
    "username" CITEXT NOT NULL,
    "failed_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "login_failures_pkey" PRIMARY KEY ("id"),
    -- O mesmo limite do login (shared/src/auth.ts): o citext não tem tamanho.
    CONSTRAINT "login_failures_username_check" CHECK (char_length("username") BETWEEN 1 AND 40)
);

-- Erros do mesmo usuário vindos do mesmo IP no último minuto.
CREATE INDEX "login_failures_username_ip_failed_at_idx" ON "login_failures"("username", "ip", "failed_at");

-- Erros do mesmo IP somando todos os usuários.
CREATE INDEX "login_failures_ip_failed_at_idx" ON "login_failures"("ip", "failed_at");
