# Portal de Solicitações Internas

Sistema web em que colaboradores registram demandas internas (TI, RH, Compras, Financeiro, Infraestrutura) e acompanham cada uma até a conclusão. Atendentes veem todas as solicitações e avançam o status: Aberto → Em Atendimento → Concluído.

- **Backend:** API REST em NestJS 12 (TypeScript), Prisma 7 e PostgreSQL 18
- **Frontend:** SPA em Angular 21 com PO UI 21
- **Infra:** Docker Compose (banco, API e web atrás de um nginx) e GitHub Actions

Documentação complementar:

- [Memorial Técnico de Desenvolvimento](docs/memorial-tecnico.md)
- [Dicionário de Dados](docs/dicionario-de-dados.md)
- Scripts SQL de criação do banco, aplicados em ordem: [`20260930102819_init`](backend/prisma/migrations/20260930102819_init/migration.sql), [`20261005084126_integrity_and_indexes`](backend/prisma/migrations/20261005084126_integrity_and_indexes/migration.sql) e [`20261005120000_assignee_timezone_login_failures`](backend/prisma/migrations/20261005120000_assignee_timezone_login_failures/migration.sql)

## Executar com Docker (recomendado)

Pré-requisito: Docker com Docker Compose v2. As portas 8080 e 5432 precisam estar livres.

```bash
git clone https://github.com/Lucasfarg/portal-solicitacoes.git
cd portal-solicitacoes
docker compose up -d --build --wait
```

O comando constrói as imagens, sobe o banco, aplica as migrações, cria os dados de demonstração e só termina quando os três serviços estão prontos. A primeira execução leva alguns minutos por causa do build.

Não é preciso criar `.env`: o compose tem valores padrão. Se a porta 8080 ou a 5432 estiver ocupada, crie um `.env` na raiz com `WEB_PORT=8081` ou `POSTGRES_PORT=5433`.

As portas são publicadas só em `127.0.0.1`: o portal e o banco respondem nesta máquina e não ficam expostos à rede, porque o compose serve em HTTP. Para produção, o caminho é um proxy com certificado na frente e `HTTPS_ONLY=true`.

Para parar: `docker compose down`. Com `-v` o banco também é apagado.

## Acesso

| O quê | Endereço |
| --- | --- |
| Portal | <http://localhost:8080> |
| Documentação interativa da API (Swagger) | <http://localhost:8080/api/docs> |
| Verificação de saúde da API | <http://localhost:8080/api/health> |

Usuários de demonstração, todos com a senha `Senha@123`:

| Usuário | Perfil | O que pode fazer |
| --- | --- | --- |
| `ana` | Colaborador | Abre solicitações, vê só as próprias, edita e exclui as que ainda estão em Aberto |
| `bruno` | Colaborador | O mesmo |
| `carla` | Atendente | Vê todas as solicitações; ao iniciar um atendimento vira a responsável, e só ela o conclui. Também pode abrir as suas, mas não muda o status delas |

Num banco vazio, o seed cria também dez solicitações de exemplo da `ana` e do `bruno`, com datas contadas a partir da subida: há casos no prazo, fora do prazo, em atendimento e concluídos, para o painel e a lista já abrirem com dados. Um roteiro curto para ver o fluxo inteiro: entre como `ana` e abra uma solicitação; saia, entre como `carla`, abra a mesma solicitação e avance o status duas vezes; o histórico aparece no detalhe e os números no painel.

Para testar pelo Swagger, execute primeiro `POST /api/auth/login`: o navegador guarda o cookie de sessão e as demais rotas passam a responder.

## Executar sem Docker

Pré-requisitos:

| Item | Versão |
| --- | --- |
| Node.js | 24 |
| pnpm | 12 (com o Node instalado: `corepack enable`) |
| PostgreSQL | 18 |

1. Crie o banco. Com um PostgreSQL local:

   ```sql
   CREATE USER portal WITH PASSWORD 'portal';
   CREATE DATABASE portal OWNER portal;
   ```

   Ou use só o banco do compose: `docker compose up -d --wait db`.

2. Crie o arquivo de configuração e, se o seu banco tiver outro usuário, senha ou porta, ajuste `DATABASE_URL` nele:

   ```bash
   cp .env.example .env
   ```

3. Instale as dependências, crie as tabelas e os dados de demonstração:

   ```bash
   pnpm install
   pnpm build:shared
   pnpm --filter backend db:deploy
   pnpm --filter backend db:seed
   ```

4. Suba a API e o frontend, cada um em um terminal:

   ```bash
   pnpm dev:api    # API em http://localhost:3000/api
   pnpm dev:web    # portal em http://localhost:4200
   ```

Acesse <http://localhost:4200>. O servidor de desenvolvimento do Angular encaminha `/api` para a API, então o Swagger também responde em <http://localhost:4200/api/docs>.

## Configuração

Um único `.env` na raiz do repositório, lido pela API, pelo Prisma e pelo compose. O modelo é o `.env.example`.

| Variável | Padrão | Descrição |
| --- | --- | --- |
| `DATABASE_URL` | sem padrão | Conexão da API com o PostgreSQL. No compose é montada automaticamente |
| `PORT` | `3000` | Porta da API |
| `SESSION_IDLE_MINUTES` | `30` | Minutos sem uso até a sessão expirar (no mínimo 5). A API informa esse valor e quanto falta dele ao portal (cabeçalhos `X-Session-Idle-Minutes` e `X-Session-Remaining-Seconds`), que avisa 5 minutos antes do fim |
| `SESSION_ABSOLUTE_HOURS` | `8` | Duração máxima de uma sessão, em horas |
| `APP_TIMEZONE` | `America/Fortaleza` | Fuso da empresa, em nome IANA: define o expediente usado no prazo (segunda a sexta, das 08:00 às 18:00) e onde começa cada dia no filtro por período. A API não sobe com um fuso inválido |
| `HTTPS_ONLY` | `false` | `true` quando o portal é servido por HTTPS: o cookie de sessão ganha `Secure` e o prefixo `__Host-` |
| `SWAGGER_ENABLED` | `true` | Publica a documentação interativa em `/api/docs`. Desligar (`false`) num ambiente exposto |
| `TRUST_PROXY` | `loopback` | De onde a API aceita o `X-Forwarded-For` (sintaxe do `trust proxy` do Express). O padrão aceita só a própria máquina (o proxy do `ng serve`); o compose usa `uniquelocal`, a rede interna em que só o nginx alcança a API |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | `portal` | Credenciais e nome do banco criado pelo compose |
| `POSTGRES_PORT` | `5432` | Porta do banco publicada pelo compose |
| `WEB_PORT` | `8080` | Porta do portal publicada pelo compose |

A API valida as variáveis ao subir e encerra com a lista das que estiverem erradas.

## API

Todas as rotas ficam sob `/api` e exigem sessão, menos o login e a verificação de saúde. Os erros saem num formato só (RFC 9457, `application/problem+json`). Corpo, filtros e respostas de cada rota estão no Swagger.

| Método e rota | O que faz |
| --- | --- |
| `POST /api/auth/login` | Abre a sessão e devolve o cookie |
| `POST /api/auth/logout` | Encerra a sessão no servidor e limpa o cookie; responde 204 mesmo com a sessão já vencida |
| `GET /api/auth/me` | Usuário da sessão atual |
| `GET /api/categories` | Categorias ativas |
| `GET /api/requests` | Lista com filtros (`status`, `categoryId`, `from`, `to`, `q`, `overdue`) e paginação (`page`, `pageSize`, `asOf`: só entram as abertas até esse instante; sem ele, vale o instante da API, devolvido em `asOf` na resposta). As linhas não trazem a descrição, que fica no detalhe |
| `POST /api/requests` | Abre uma solicitação |
| `GET /api/requests/:id` | Detalhe com o responsável e o histórico de status; 404 para solicitação de outro colaborador ou excluída |
| `PATCH /api/requests/:id` | Edita título, descrição ou categoria (só quem abriu, só em Aberto) |
| `DELETE /api/requests/:id` | Exclusão lógica (só quem abriu, só em Aberto): some das telas e do painel, mas fica no banco com o histórico |
| `PATCH /api/requests/:id/status` | Avança o status (só atendente, nunca numa solicitação que ele abriu). Quem inicia o atendimento vira o responsável, e só ele conclui |
| `GET /api/dashboard/summary` | Números do painel, no escopo de quem consulta |
| `GET /api/health` | Responde 200 se a API alcança o banco |

Chamadas que alteram dados (`POST`, `PATCH`, `DELETE`) precisam do cabeçalho `X-Requested-With: XMLHttpRequest`, que é a defesa contra CSRF. O portal e o Swagger já o enviam; com `curl`:

```bash
curl -c cookies.txt -X POST http://localhost:8080/api/auth/login \
  -H 'Content-Type: application/json' -H 'X-Requested-With: XMLHttpRequest' \
  -d '{"username":"ana","password":"Senha@123"}'
curl -b cookies.txt http://localhost:8080/api/requests
```

## Testes e verificações

Na raiz do repositório, depois de `pnpm install`:

| Comando | O que roda |
| --- | --- |
| `pnpm lint` | Biome no backend e em `shared/`; ESLint e Prettier no frontend |
| `pnpm typecheck` | Verificação de tipos dos três pacotes |
| `pnpm test` | Testes unitários: 72 no backend, 33 no frontend |
| `pnpm test:e2e` | 81 testes da API contra um PostgreSQL 18 descartável (Testcontainers; precisa do Docker em execução) |
| `pnpm build` | Build de produção dos três pacotes |

O workflow `.github/workflows/ci.yml` executa os cinco, nessa ordem, a cada pull request e a cada push na `main`.

## Estrutura do projeto

```txt
shared/      schemas Zod e tipos usados pela API e pelo frontend (@portal/shared)
backend/     API NestJS
  prisma/      schema e migrações SQL
  src/auth/        login, sessão, cookie, guards de sessão e de CSRF
  src/requests/    solicitações; as regras de negócio estão em request-rules.ts
  src/categories/  categorias
  src/dashboard/   números do painel
  src/common/      validação e formato único de erro
  test/            testes e2e
frontend/    SPA Angular
  src/app/core/      chamadas à API, sessão, interceptor, guards de rota, diálogo de confirmação
  src/app/login/     tela de login
  src/app/dashboard/ painel
  src/app/requests/  lista, formulário e detalhe
  src/app/layout/    barra do topo, menu e cabeçalho das telas
docs/        memorial técnico e dicionário de dados
compose.yaml banco, API e web
```
