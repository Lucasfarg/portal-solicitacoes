# Dicionário de Dados

Banco: PostgreSQL 17. Nomes de tabelas e colunas em inglês, `snake_case`. Chaves primárias numéricas geradas pelo banco; datas em `timestamptz` (UTC).

## Tipos enumerados

| Tipo | Valores | Uso |
|---|---|---|
| `user_role` | `REQUESTER`, `AGENT` | Perfil do usuário: colaborador (solicitante) ou atendente |
| `request_status` | `OPEN`, `IN_PROGRESS`, `DONE` | Aberto, Em Atendimento, Concluído |

## `users` — usuários do sistema

| Coluna | Tipo | Nulo | Padrão | Descrição |
|---|---|---|---|---|
| `id` | `integer` identity | não | gerado | Identificador |
| `name` | `varchar(120)` | não | | Nome exibido |
| `username` | `varchar(40)` | não | | Login; único |
| `password_hash` | `varchar(255)` | não | | Hash Argon2id da senha |
| `role` | `user_role` | não | `REQUESTER` | Perfil de acesso |
| `created_at` | `timestamptz` | não | `now()` | Data de cadastro |

Restrições: `UNIQUE (username)`.

## `categories` — categorias de solicitação

| Coluna | Tipo | Nulo | Padrão | Descrição |
|---|---|---|---|---|
| `id` | `smallint` identity | não | gerado | Identificador |
| `name` | `varchar(60)` | não | | Nome (TI, RH, Compras, Financeiro, Infraestrutura) |
| `active` | `boolean` | não | `true` | Categoria disponível para novas solicitações |

Restrições: `UNIQUE (name)`.

## `requests` — solicitações

| Coluna | Tipo | Nulo | Padrão | Descrição |
|---|---|---|---|---|
| `id` | `integer` identity | não | gerado | Identificador |
| `code` | `varchar(12)` gerada | não | `'SOL-' \|\| lpad(id, 6, '0')` | Código exibido ao usuário |
| `title` | `varchar(120)` | não | | Título |
| `description` | `text` | não | | Descrição |
| `category_id` | `smallint` | não | | FK → `categories.id` |
| `requester_id` | `integer` | não | | FK → `users.id`; preenchido com o usuário logado |
| `status` | `request_status` | não | `OPEN` | Situação atual |
| `created_at` | `timestamptz` | não | `now()` | Data de abertura |
| `updated_at` | `timestamptz` | não | `now()` | Última alteração |

Restrições: `UNIQUE (code)`; `CHECK (char_length(title) BETWEEN 3 AND 120)`.
Índices: `(status)`, `(category_id)`, `(requester_id)`, `(created_at)`.

## `request_status_history` — histórico de status

| Coluna | Tipo | Nulo | Padrão | Descrição |
|---|---|---|---|---|
| `id` | `integer` identity | não | gerado | Identificador |
| `request_id` | `integer` | não | | FK → `requests.id`, `ON DELETE CASCADE` |
| `from_status` | `request_status` | sim | | Status anterior (nulo na abertura) |
| `to_status` | `request_status` | não | | Novo status |
| `changed_by` | `integer` | não | | FK → `users.id` |
| `changed_at` | `timestamptz` | não | `now()` | Momento da mudança |

Índice: `(request_id, changed_at)`.

## Relacionamentos

```txt
users 1 ── N requests                (requester_id)
categories 1 ── N requests           (category_id)
requests 1 ── N request_status_history
users 1 ── N request_status_history  (changed_by)
```
