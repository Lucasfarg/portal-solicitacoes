# Portal de Solicitações Internas

Sistema web para colaboradores registrarem demandas internas (TI, RH, Compras, Financeiro, Infraestrutura) e acompanharem cada uma até a conclusão.

- **Backend:** API REST em NestJS + Prisma + PostgreSQL
- **Frontend:** React + Vite + TanStack Router/Query/Form + shadcn/ui
- **Infra:** Docker Compose (banco, API e web)

Documentação complementar:

- [Memorial Técnico de Desenvolvimento](docs/memorial-tecnico.md)
- [Dicionário de Dados](docs/dicionario-de-dados.md)

## Pré-requisitos

| Item | Versão |
|---|---|
| Docker + Docker Compose | 24+ / v2 |
| Node.js (só para rodar fora do Docker) | 22 LTS |
| pnpm (só para rodar fora do Docker) | 10 |
| PostgreSQL (só para rodar fora do Docker) | 17 |

## Instalação e execução com Docker (recomendado)

```bash
git clone <url-do-repositorio>
cd portal-solicitacoes
cp .env.example .env
docker compose up --build
```

- Web: http://localhost:5173
- API: http://localhost:3000/api

O banco é criado e populado automaticamente (migrações + dados de demonstração) na primeira subida.

## Instalação e execução sem Docker

_A preencher quando backend e frontend estiverem prontos._

### Banco de dados

### Backend

### Frontend

## Configuração

### Variáveis de ambiente

| Variável | Onde | Descrição | Exemplo |
|---|---|---|---|
| `DATABASE_URL` | backend | Conexão com o PostgreSQL | `postgresql://portal:portal@localhost:5432/portal` |
| `JWT_SECRET` | backend | Segredo de assinatura do token de sessão | `troque-este-valor` |
| `SESSION_TTL_HOURS` | backend | Duração da sessão, em horas | `8` |
| `WEB_ORIGIN` | backend | Origem liberada no CORS | `http://localhost:5173` |
| `VITE_API_URL` | frontend | URL base da API | `http://localhost:3000/api` |

## Acesso

Usuários de demonstração criados pelo seed:

| Perfil | Usuário | Senha | O que pode fazer |
|---|---|---|---|
| Colaborador | `ana` | `Senha@123` | Abre, edita e exclui as próprias solicitações em aberto |
| Colaborador | `bruno` | `Senha@123` | Idem |
| Atendente | `carla` | `Senha@123` | Vê todas as solicitações e altera o status |

## Estrutura do projeto

```txt
backend/    API NestJS (módulos auth, requests, categories, dashboard)
frontend/   SPA React
docs/       memorial técnico e dicionário de dados
```

## Testes

_A preencher._

## Evidências

_Prints das telas principais._
