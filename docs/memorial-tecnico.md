# Memorial Técnico de Desenvolvimento

## 1. Visão geral

_Resumo da solução em um parágrafo: o que faz, para quem, como está dividida._

## 2. Tecnologias utilizadas

| Camada | Tecnologia | Versão |
|---|---|---|
| Linguagem | TypeScript | |
| Backend | NestJS | |
| Acesso a dados | Prisma ORM | |
| Banco de dados | PostgreSQL | 17 |
| Autenticação | JWT em cookie httpOnly + Argon2id | |
| Validação (API) | class-validator / class-transformer | |
| Frontend | React + Vite | |
| Roteamento e dados | TanStack Router + TanStack Query | |
| Formulários | TanStack Form + Zod | |
| Interface | shadcn/ui + Tailwind CSS | |
| Testes | Jest + Supertest | |
| Containerização | Docker + Docker Compose | |
| CI | GitHub Actions | |

## 3. Justificativa técnica

Para cada tecnologia: motivo da escolha, benefício para este cenário, vantagem sobre alternativas conhecidas e impacto em manutenção, escalabilidade ou produtividade.

### NestJS

### Prisma ORM

### PostgreSQL

### JWT em cookie httpOnly + Argon2id

### React + Vite

### TanStack Router, Query e Form

### shadcn/ui + Tailwind CSS

### Jest + Supertest

### Docker Compose

### GitHub Actions

## 4. Justificativa conceitual

### Estrutura geral da aplicação

### Organização das camadas

_Controller (HTTP e validação de entrada) → Service (regras de negócio) → Prisma (persistência)._

### Estratégia de modelagem de dados

_Ver [dicionário de dados](dicionario-de-dados.md)._

### Padrões de projeto utilizados

### Estratégia de autenticação

### Comunicação entre frontend e backend

### Organização do código-fonte

## 5. Regras de negócio e decisões sobre pontos em aberto do enunciado

| Ponto | Decisão | Motivo |
|---|---|---|
| Quem vê quais solicitações | Colaborador vê só as próprias; atendente vê todas | |
| Quem altera o status | Somente atendente | |
| Quem edita ou exclui | Somente o solicitante, e só com status Aberto | |
| Fluxo de status | Aberto → Em Atendimento → Concluído, sem retorno | |
| Código da solicitação | `SOL-000001`, derivado do identificador | |
| Exclusão | Física, permitida só em Aberto | |
| Histórico | Toda mudança de status é registrada | |

## 6. Análise crítica

### Limitações da solução

### Melhorias futuras

### Requisitos que poderiam ser aperfeiçoados

### O que seria diferente em produção corporativa
