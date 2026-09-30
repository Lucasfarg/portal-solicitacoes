# Dicionário de Dados

Banco PostgreSQL 18, cinco tabelas e dois tipos enumerados.

O script de criação é [`backend/prisma/migrations/20260930102819_init/migration.sql`](../backend/prisma/migrations/20260930102819_init/migration.sql), gerado pelo Prisma a partir de [`backend/prisma/schema.prisma`](../backend/prisma/schema.prisma). É SQL puro: roda com `psql -f` num banco vazio ou com `pnpm --filter backend db:deploy`, que é o que o container da API faz ao subir.

## Convenções

- Tabelas e colunas em inglês, `snake_case`, tabelas no plural.
- Chaves primárias inteiras geradas pelo banco (`SERIAL`; `SMALLSERIAL` em `categories`).
- Datas em `timestamptz(3)`: o instante é guardado em UTC, com milissegundos, e convertido para o horário local só na tela.
- Tamanhos mínimos e o limite de 2000 caracteres da descrição são validados na API (schemas em `shared/src/`), não por `CHECK` no banco. Os `varchar(n)` garantem só o tamanho máximo.

## Tipos enumerados

| Tipo | Valores | Significado |
| --- | --- | --- |
| `user_role` | `REQUESTER`, `AGENT` | Perfil do usuário: colaborador (quem abre solicitações) ou atendente |
| `request_status` | `OPEN`, `IN_PROGRESS`, `DONE` | Aberto, Em Atendimento, Concluído |

## `users` — usuários

| Coluna | Tipo | Nulo | Padrão | Descrição |
| --- | --- | --- | --- | --- |
| `id` | `serial` | não | sequência | Identificador (PK) |
| `name` | `varchar(120)` | não | | Nome exibido nas telas |
| `username` | `varchar(40)` | não | | Login; único |
| `password_hash` | `varchar(255)` | não | | Hash Argon2id da senha; a senha em si nunca é gravada |
| `role` | `user_role` | não | `REQUESTER` | Perfil de acesso |
| `created_at` | `timestamptz(3)` | não | `CURRENT_TIMESTAMP` | Data do cadastro |

Índice único: `users_username_key (username)`.

## `sessions` — sessões de login

Uma linha por login ativo. O logout apaga a linha; uma sessão expirada é apagada na primeira vez em que é usada.

| Coluna | Tipo | Nulo | Padrão | Descrição |
| --- | --- | --- | --- | --- |
| `id` | `serial` | não | sequência | Identificador (PK) |
| `token_hash` | `char(64)` | não | | SHA-256, em hexadecimal, do token de sessão. O token em si só existe no cookie do navegador |
| `user_id` | `integer` | não | | FK → `users.id`, `ON DELETE CASCADE` |
| `created_at` | `timestamptz(3)` | não | `CURRENT_TIMESTAMP` | Momento do login |
| `last_seen_at` | `timestamptz(3)` | não | `CURRENT_TIMESTAMP` | Último uso da sessão; base da expiração por inatividade (30 min) |
| `expires_at` | `timestamptz(3)` | não | | Limite absoluto da sessão (login + 8 h) |

Índices: único `sessions_token_hash_key (token_hash)`; `sessions_user_id_idx (user_id)`.

## `categories` — categorias de solicitação

| Coluna | Tipo | Nulo | Padrão | Descrição |
| --- | --- | --- | --- | --- |
| `id` | `smallserial` | não | sequência | Identificador (PK) |
| `name` | `varchar(60)` | não | | Nome da categoria; único |
| `active` | `boolean` | não | `true` | Só categorias ativas aparecem no formulário e são aceitas em solicitações novas |
| `sla_hours` | `smallint` | não | | Prazo de atendimento das solicitações da categoria, em horas |

Índice único: `categories_name_key (name)`.

## `requests` — solicitações

| Coluna | Tipo | Nulo | Padrão | Descrição |
| --- | --- | --- | --- | --- |
| `id` | `serial` | não | sequência | Identificador (PK). O código exibido (`SOL-000001`) é este número com seis dígitos; não existe coluna de código |
| `title` | `varchar(120)` | não | | Título (a API exige de 3 a 120 caracteres) |
| `description` | `text` | não | | Descrição (a API exige de 1 a 2000 caracteres) |
| `category_id` | `smallint` | não | | FK → `categories.id`, `ON DELETE RESTRICT` |
| `requester_id` | `integer` | não | | FK → `users.id`, `ON DELETE RESTRICT`. Quem abriu; preenchido com o usuário da sessão |
| `status` | `request_status` | não | `OPEN` | Situação atual |
| `due_at` | `timestamptz(3)` | não | | Prazo de atendimento: `created_at` + `sla_hours` da categoria. Gravado na abertura e refeito se a categoria for trocada na edição |
| `created_at` | `timestamptz(3)` | não | `CURRENT_TIMESTAMP` | Data de abertura |
| `updated_at` | `timestamptz(3)` | não | | Última alteração; preenchido pela aplicação a cada gravação |

Índices: `requests_status_idx (status)`, `requests_category_id_idx (category_id)`, `requests_requester_id_idx (requester_id)`, `requests_created_at_idx (created_at)`. São as colunas dos filtros da listagem e da ordenação.

A exclusão é física e a API só a permite enquanto a solicitação está em `OPEN`.

## `request_status_history` — histórico de status

Uma linha na abertura e uma a cada mudança de status. É o que a tela de detalhe mostra e de onde sai o tempo médio de atendimento do painel.

| Coluna | Tipo | Nulo | Padrão | Descrição |
| --- | --- | --- | --- | --- |
| `id` | `serial` | não | sequência | Identificador (PK) |
| `request_id` | `integer` | não | | FK → `requests.id`, `ON DELETE CASCADE`: excluir a solicitação leva o histórico junto |
| `from_status` | `request_status` | sim | | Status anterior; nulo no registro de abertura |
| `to_status` | `request_status` | não | | Status novo |
| `changed_by` | `integer` | não | | FK → `users.id`, `ON DELETE RESTRICT`. Quem abriu ou quem mudou o status |
| `changed_at` | `timestamptz(3)` | não | `CURRENT_TIMESTAMP` | Momento da mudança. No registro de abertura é igual ao `created_at` da solicitação |

Índice: `request_status_history_request_id_changed_at_idx (request_id, changed_at)`.

## Relacionamentos

```txt
users      1 ── N sessions                  (sessions.user_id, CASCADE)
users      1 ── N requests                  (requests.requester_id, RESTRICT)
categories 1 ── N requests                  (requests.category_id, RESTRICT)
requests   1 ── N request_status_history    (request_status_history.request_id, CASCADE)
users      1 ── N request_status_history    (request_status_history.changed_by, RESTRICT)
```

`RESTRICT` impede apagar um usuário ou uma categoria que já tenha solicitações: categoria que sai de uso é desativada (`active = false`), não apagada.

## Dados de demonstração

Criados por `backend/src/seed.ts` na subida do container da API. O seed pode rodar várias vezes: não duplica nem sobrescreve o que já existe.

| Categoria | `sla_hours` |
| --- | --- |
| TI | 24 |
| Infraestrutura | 48 |
| RH | 72 |
| Financeiro | 72 |
| Compras | 120 |

| Usuário | Nome | Perfil |
| --- | --- | --- |
| `ana` | Ana Souza | `REQUESTER` |
| `bruno` | Bruno Lima | `REQUESTER` |
| `carla` | Carla Mendes | `AGENT` |

A senha dos três é `Senha@123`. O seed não cria solicitações.
