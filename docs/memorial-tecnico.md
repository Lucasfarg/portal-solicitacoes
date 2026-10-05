# Memorial Técnico de Desenvolvimento

Portal de Solicitações Internas, Lucas Farias

## 1. Visão geral

Colaboradores registram demandas internas e acompanham cada uma até a conclusão; atendentes veem todas e avançam o status. Há histórico de quem fez cada passo, responsável por atendimento, prazo por categoria em horas úteis e painel com os números.

Três partes no mesmo repositório: API REST (`backend/`), SPA (`frontend/`) e um pacote de schemas e tipos das duas (`shared/`). Um `docker compose up` sobe banco, API e web.

Busquei a solução mais simples que atendesse ao enunciado. O que vai além (responsável, prazo, tempos médios, exclusão lógica) responde quem cuida de cada pedido, se o prazo é cumprido e o que foi excluído.

## 2. Tecnologias utilizadas

| Camada | Tecnologia | Versão |
| --- | --- | --- |
| Linguagem | TypeScript | 6.0 (API e `shared/`), 5.9 (frontend) |
| Ambiente de execução | Node.js | 24 |
| API | NestJS | 12.1 |
| Acesso a dados | Prisma ORM | 7.10 |
| Banco de dados | PostgreSQL | 18 |
| Validação e contrato | Zod, em `shared/` | 4.6 |
| Autenticação | Sessão no servidor, cookie HttpOnly, senhas com Argon2id | `argon2` 0.45 |
| Proteções HTTP | Helmet | 8.3 |
| Datas e fuso horário | Luxon | 3.7 |
| Log de acesso | morgan | 1.12 |
| Exportação | csv-stringify (CSV), docx (Word) | 6.9, 9.8 |
| Documentação da API | Swagger (`@nestjs/swagger`) | 12.0 |
| Frontend | Angular | 21.2 |
| Componentes de interface | PO UI (`@po-ui/ng-components`) | 21.31 |
| Template de login | PO UI Templates (`@po-ui/ng-templates`) | 21.31 |
| Testes | Vitest, Supertest, Testcontainers | 4, 7, 12.2 |
| Lint e formatação | Biome (API e `shared/`), angular-eslint e Prettier (frontend) | 2.5, 21.4, 3 |
| Repositório | Workspace pnpm | 12 |
| Execução | Docker Compose, nginx | |
| Integração contínua | GitHub Actions | |
| Publicação (opcional) | Render, plano gratuito (`render.yaml`) | |

As dependências escolhidas à mão têm versão exata no `package.json`.

## 3. Justificativa técnica

- **TypeScript e Node.js 24 (LTS)**: uma linguagem na API e no frontend permite compartilhar schemas e tipos. C# e Java trariam um segundo ecossistema e o contrato duplicado.
- **NestJS**: o enunciado avalia camadas, e ele traz módulo, controller, service, injeção de dependência, guards e filtros; em Express eu montaria isso sozinho. Na versão 12 o schema Zod passa em `@Body({ schema })` e gera o Swagger.
- **PostgreSQL**: o enunciado pede banco SQL, e ele oferece o que a modelagem usa (`CHECK`, `citext`, `timestamptz`), sem licença. MySQL e SQL Server também serviriam.
- **Prisma**: gera migrações `.sql` versionadas, que são os scripts de criação pedidos, e tipos das consultas, então coluna errada vira erro de compilação. Descartei o TypeORM (domínio e persistência misturados em decorators) e o Drizzle (sem 1.0 estável). SQL à mão só nas migrações, onde ficam os `CHECK`. Os tempos médios são calculados no TypeScript, com a função de horas úteis do prazo.
- **Zod em `shared/`**: API e formulário validam com o mesmo schema e a mesma mensagem; o `class-validator` só roda no backend. Os limites são constantes (`TITLE_MAX`, `DESCRIPTION_MAX`) lidas por API, formulário e Swagger; o `CHECK` repete os números.
- **Sessão no servidor, cookie HttpOnly e Argon2id**: com token opaco e tabela `sessions`, apagada a linha o token morre. JWT exigiria lista de revogados (já é sessão no servidor) e, no `localStorage`, ficaria ao alcance de qualquer script. Argon2id com os mínimos da OWASP (19 MiB, 2 iterações), no lugar do bcrypt.
- **Helmet, Luxon, morgan**: cabeçalhos de segurança; fusos nas contas do prazo e do filtro por período; log de acesso.
- **Limite de tentativas próprio** (`auth/login-throttle.ts`) em vez do `@nestjs/throttler`, que conta toda requisição: num escritório com um IP só, a sexta pessoa a entrar no minuto seria bloqueada. Aqui só erros contam, na tabela `login_failures`, valendo para todas as instâncias.
- **Swagger** em `/api/docs`, gerado dos schemas Zod; desligado com `SWAGGER_ENABLED=false` em ambiente exposto.
- **Angular**: citado na vaga e base do PO UI; traz roteamento, formulários, HTTP e injeção de dependência, sem montar o conjunto como em React. Usei componentes standalone, signals e Reactive Forms. Fiquei na 21 porque o PO UI não suporta a 22.
- **PO UI**: biblioteca da TOTVS, usada em todas as telas. O custo é o tamanho: 3,6 MB no pacote inicial, cerca de 700 kB com gzip. O visual vem das variáveis CSS do tema (`src/styles.scss`). Corrigi os defeitos de acessibilidade por cima, com ARIA e diretivas (`core/po-a11y.ts`, `core/field-a11y.ts`), sem trocar componente.
- **Vitest, Supertest, Testcontainers**: o Vitest é o padrão do NestJS 12 e do Angular 21. Os e2e sobem um PostgreSQL 18 descartável com as migrações reais, em vez de banco em memória ou mocks do Prisma; o custo é precisar do Docker.
- **Biome, angular-eslint, Prettier**: o Biome cobre backend e `shared/`, mas não analisa templates do Angular, onde uso angular-eslint e Prettier. O workspace pnpm mantém os três pacotes com comando único de lint, tipos, testes e build.
- **Docker Compose e nginx**: o `compose.yaml` sobe banco, depois API (migrações e seed; a verificação de saúde dá até dois minutos) e depois web. O nginx serve o frontend com gzip, encaminha `/api` (mesma origem) e dá cache de um ano aos `.js` e `.css` com hash. Portas só em `127.0.0.1`; a API não publica porta.
- **csv-stringify e docx**: geram os arquivos da exportação. Escrever CSV à mão erra em aspas e quebras de linha, e o formato do Word é um zip de XML; as duas bibliotecas são as mais usadas para isso no Node.
- **Render (opcional)**: o `render.yaml` publica no plano gratuito, que oferece um serviço só. Por isso a última etapa de `backend/Dockerfile` gera uma imagem em que a API também entrega as telas (`WEB_ROOT`). No compose nada muda: as telas continuam no nginx.
- **GitHub Actions**: lint, tipos, testes unitários, e2e e build em cada pull request e push na `main`.

## 4. Justificativa conceitual

### Estrutura geral

```txt
navegador ──> nginx ─┬─ /       arquivos da SPA (Angular)
                     └─ /api/*  API NestJS ──> PostgreSQL
```

API REST e SPA separadas, na mesma origem: o enunciado avalia API e consumo como coisas distintas, e renderizar no servidor esconderia a fronteira. A mesma origem dispensa CORS e permite `SameSite=Strict`.

### Camadas

Na API, cada requisição passa por:

1. **Guards globais**: `CsrfGuard` (exige `X-Requested-With` nos métodos que alteram dados) e `AuthGuard` (exige sessão, exceto em `@Public()`).
2. **Controller**: valida com Zod e chama o service, sem regra de negócio.
3. **Service**: busca, aplica as regras e grava. Ordem: existe e a pessoa pode vê-la? (404), pode fazer isso? (403), o estado permite? (409). Em concluir, a transição vem antes (409) e depois o responsável (403), porque ele só existe a partir de Em Atendimento.
4. **Regras**, funções puras sem banco: `shared/src/request-rules.ts` (API e frontend) define quem vê, quem altera e quais transições valem; `backend/src/requests/request-rules.ts` converte recusas em erro HTTP e calcula prazo, horas úteis e período do filtro.
5. **Prisma**: acesso ao banco; `request.mapper.ts` converte a linha em resposta.

A autorização fica no service, não só na rota: `GET /api/requests` devolve resultados diferentes para colaborador e atendente. No frontend, as permissões usam as funções de `shared/` e só decidem quais botões aparecem; quem garante é a API.

### Acessibilidade

WCAG 2.2 AA, conferida com axe-core em cada tela e roteiros só com teclado, em 1366, 683 (zoom de 200%), 390 e 320 px. Defeito e correção:

- **Estrutura**: barra como `banner`, `po-menu` como navegação ("Menu principal"), `aria-level="1"` no `h2` do `po-page-default`, que recebe o foco a cada troca de tela; atalho "Pular para o conteúdo".
- **`po-menu`**: Enter e Espaço não navegavam, o botão do celular só respondia ao mouse, o menu fechado deixava paradas de Tab fora da tela. Corrigidos; o item atual leva `aria-current`.
- **`po-toolbar`**: o ícone de perfil (onde fica o "Sair") só respondia ao clique. Agora o teclado o alcança.
- **`po-modal`** (`core/confirm-dialog.ts`): o Tab escapava, o Esc era ignorado com o foco fora e não se anunciava como diálogo. Agora devolve o foco, fecha com Esc e grava `role="dialog"`, `aria-modal` e a ligação com título e mensagem; forço o desenho antes de abrir, porque ele só foca se já estiver desenhado.
- **`po-page-login`**: sem região principal e sem anunciar o erro de senha. Envolvido em `main`, com a mensagem repetida em aviso para leitor de tela.
- **`po-breadcrumb`**: o item atual era parada de Tab inútil. Agora é texto com `aria-current="page"`.
- **`po-table`**: rolagem lateral sem foco nem nome. Agora é região nomeada; o código da solicitação é um link.
- **`po-chart`**: botão dos dados em tabela sem nome. Agora "Ver os dados do gráfico em tabela".
- **`po-datepicker`**: seletores de mês e ano sem rótulo, Enter não enviava o filtro. Corrigidos.
- **`po-checkbox`**: `aria-checked` em elemento sem função, removido pela diretiva.
- **Formulários**: `aria-describedby` e `aria-invalid` ligam campo e mensagem (nos campos do PO UI, via `core/field-a11y.ts`); o foco vai ao primeiro campo inválido.
- **Sessão**: aviso "Continuar conectado" cinco minutos antes de expirar (na metade do tempo, em sessão curta), guiado por `X-Session-Idle-Minutes` e `X-Session-Remaining-Seconds`, que a API envia em toda resposta, inclusive de erro.
- **Outros**: avisos ficam 15 segundos na tela; resultado da lista anunciado ao filtrar e paginar (`role="status"`); Esc no Título limpa a busca; busca com falha anuncia o erro, não "0 solicitações"; contraste do texto de exemplo corrigido; animações desligadas para quem pede menos movimento.

### Modelagem de dados

Detalhe no [dicionário de dados](dicionario-de-dados.md). Decisões:

- **Categorias em tabela**, com `active` e `sla_hours`: criar ou desativar não exige mudança de código.
- **Status como enum**: conjunto fechado, amarrado a regras do código.
- **Histórico** em `request_status_history`, uma linha na abertura e uma por mudança: dá o autor de cada passo, os tempos médios e as concluídas fora do prazo.
- **Responsável** (`assignee_id`): um `CHECK` o mantém nulo em Aberto e preenchido fora dele.
- **Prazo gravado** (`due_at`) na abertura: mudar o SLA depois não altera prazos assumidos.
- **Chaves inteiras sequenciais**, porque quem protege é a autorização; o código `SOL-000001` deriva do id, sem coluna.
- **Datas em UTC** (`timestamptz`), convertidas só na tela; `APP_TIMEZONE` entra no expediente do prazo e no início de cada dia do filtro.
- **`login_failures`** sem chave estrangeira, porque o login digitado pode não existir.
- **`CHECK` no banco**: tamanho de título e descrição, SLA positivo, prazo depois da abertura, histórico coerente (só a abertura não tem status de origem), responsável só fora de Aberto, exclusão só em Aberto. A API valida antes, com mensagem para a tela; o banco garante porque usuários e categorias entram por SQL.
- **`citext`** em login e nome de categoria: "Ana" e "ana" são o mesmo login, "TI" e "ti" não coexistem.
- **Usuário com `active`**: quem sai é desativado e perde as sessões, e o histórico mantém quem fez o quê.
- **`status` repetido na solicitação**, igual ao `to_status` do último histórico e gravado na mesma transação: lista e painel não juntam o histórico.
- **Índices**: `(requester_id, created_at DESC)` para a lista do colaborador e `(status, due_at)` para "fora do prazo"; nenhum só em `status`, que quase não filtra.
- **Gravação condicional**: editar, excluir e mudar status conferem a regra no `WHERE` (`status = 'OPEN'`, ou o status lido, e o responsável na conclusão). Se outra pessoa mudou antes, nada grava e a resposta é 409.
- **Um relógio só**: tudo usa o relógio da API, que devolve `overdue` pronto.

### Padrões de projeto

- **Injeção de dependência** (NestJS e Angular), para trocar dependências nos testes; **guards e filtro global** (sessão, CSRF, formato de erro) e **decorators** `@Public()` e `@CurrentUser()`.
- **Regras em funções puras** testadas sem banco; **mapper** entre linha do banco e resposta; **atualização condicional** (`WHERE id = ? AND status = ?`) na mudança de status, que dá 409 e evita histórico duplicado.
- No frontend, **interceptor HTTP**, **guards de rota** e **URL como fonte da verdade** dos filtros e da página (query string).

### Autenticação

- Token aleatório de 32 bytes em cookie `HttpOnly; SameSite=Strict; Path=/`; no banco fica só o SHA-256.
- A sessão expira com 30 minutos sem uso ou 8 horas após o login, o que vier primeiro. O logout apaga a linha e limpa o cookie, mesmo com a sessão vencida. Cada login gera token novo e encerra a sessão anterior do navegador.
- Mesma mensagem para usuário inexistente, desativado e senha errada; sem usuário, a senha é conferida contra um hash fictício, para o tempo não revelar logins.
- Bloqueio (429) com, no último minuto, 5 erros no mesmo usuário e IP, ou 20 do mesmo IP somando usuários. Login certo apaga os erros daquele usuário e IP. Cada tentativa grava a linha antes de conferir a senha, para simultâneas não passarem pela contagem zerada (a linha sai se a senha estiver certa ou a tentativa for recusada). Linhas com mais de um minuto são apagadas a cada tentativa. Cada recusa vai ao log com login e IP, sem a senha.
- O nginx sobrescreve `X-Forwarded-For`, e a API só aceita o cabeçalho de conexões de `TRUST_PROXY` (no compose, a rede interna; fora dele, só a própria máquina).
- **CSRF**: `POST`, `PATCH` e `DELETE` exigem `X-Requested-With: XMLHttpRequest`, que outro site não envia sem CORS. `SameSite=Strict` é a segunda camada.
- Com `HTTPS_ONLY=true` o cookie vira `__Host-sid` com `Secure`, para produção atrás de proxy com certificado. No compose fica desligado (HTTP local).

### Comunicação frontend e backend

JSON sobre HTTP na mesma origem, com cookie de sessão. As chamadas ficam em `core/portal-api.ts`, tipadas com `shared/`. O interceptor acrescenta o cabeçalho de CSRF, reinicia a contagem do aviso de sessão a cada resposta e trata o 401: avisa uma vez e leva ao login guardando a tela de origem.

Erros seguem a RFC 9457 (`application/problem+json`): `status`, `title`, `detail` e, em validação, `errors` por campo. JSON inválido também dá 400 em português (`common/http-adapter.ts`). Códigos: 400 validação, 401 sem sessão, 403 sem permissão, 404 inexistente ou fora do alcance, 409 estado não permite, 429 excesso de tentativas de login.

### Organização do código

Código (nomes, tabelas, rotas da API) em inglês; mensagens, rotas das telas e comentários em português.

Testes: cada um parte de uma regra do sistema. São 42 da API contra PostgreSQL real (inclui dois pedidos simultâneos, login, sessão, limite de tentativas e regras do banco), 19 unitários sem banco (as nove combinações de transição, o prazo em horas úteis e a senha) e 18 no frontend (formulário, guards, interceptor, aviso de sessão e ligação campo–erro).

## 5. Regras de negócio e decisões sobre pontos em aberto do enunciado

| Ponto | Decisão | Motivo |
| --- | --- | --- |
| Perfis | Colaborador e atendente | Os papéis do fluxo |
| Quem vê o quê | Colaborador vê só o que abriu; atendente vê todas | RH e Financeiro podem ter dado pessoal |
| Quem abre | Qualquer usuário, inclusive atendente | Atendente também é colaborador |
| Quem edita ou exclui | Só quem abriu, e só em Aberto | Mudar o pedido em atendimento desalinha quem atende |
| Quem muda o status | Só atendente, nunca em solicitação que ele abriu (403) | Quem pede não declara o próprio pedido atendido |
| Responsável | Quem inicia vira responsável; só ele conclui (403 para outro). Telas mostram "Responsável", ou "Ninguém ainda" em Aberto | Cada solicitação em andamento tem dono |
| Fluxo de status | Aberto → Em Atendimento → Concluído, sem pular nem voltar | Fluxo do enunciado |
| Mudança simultânea | O segundo atendente a mudar o mesmo status recebe 409 | Evita histórico duplicado e dois responsáveis |
| Solicitação de outro colaborador | 404, não 403 | Não revela que o número existe |
| Prazo | SLA da categoria em horas úteis: segunda a sexta, 08:00 às 18:00, fuso `APP_TIMEZONE`, sem feriados. Aberta fora do expediente, conta do próximo início | Pedido da sexta à noite não vence no fim de semana |
| Troca de categoria na edição | Prazo vira o menor entre o atual e o refeito com o SLA da nova categoria, da abertura | Se pudesse aumentar, trocar a categoria tiraria a solicitação do atraso |
| Fora do prazo | Não concluída e vencida; cartão no painel e filtro na lista | Mostra o que pede ação agora; "Atrasada" destoaria dos status "Aberto" e "Em Atendimento" |
| Concluídas fora do prazo | Concluídas depois do prazo; cartão próprio | Mede o prazo cumprido, que "Fora do prazo" deixa de contar |
| Tempos médios | Até o início (abertura a Em Atendimento) e até a conclusão (abertura a Concluído), em horas úteis: aberta na sexta às 17h e iniciada na segunda às 9h esperou 2 h, não 64 h. API com uma casa decimal; tela "N h úteis" (sem converter em dias: 24 h úteis são mais de dois dias de expediente) ou "Sem dados" | Separam a espera pela primeira resposta do total |
| Painel | Oito números (total, um por status, fora do prazo, concluídas fora do prazo, dois tempos médios) e dois gráficos (`po-chart`): por situação e por categoria. No escopo de quem vê; cartões de situação e de fora do prazo abrem a lista filtrada | Cada perfil vê os seus números |
| Exportação | A lista pode ser baixada em CSV ou Word, com os filtros da tela e todas as páginas (até 1.000 linhas), no escopo de quem pede | O CSV usa ponto e vírgula e BOM, que o Excel em português abre direto |
| Categoria inexistente ou inativa | 400 apontando `categoryId` | Erro de preenchimento, indicável no campo |
| Filtro por período | Datas em `APP_TIMEZONE` (padrão `America/Fortaleza`); último dia inteiro | O banco guarda UTC; sem conversão, uma abertura às 22h cairia no dia seguinte |
| Título | 3 a 120 caracteres, contados como o banco (emoji vale um) | Cabe numa linha da tabela e num assunto de e-mail |
| Descrição | Até 2000 caracteres | Cerca de uma página |
| Itens por página | 10 por padrão, máximo 100 | Dez cabem na tela de um notebook; 100 evita páginas enormes |
| Código | `SOL-000001`, derivado do identificador | Legível, sem coluna |
| Exclusão | Lógica (`deleted_at`), só pelo dono e só em Aberto; some da lista, do detalhe (404) e do painel | Linha e histórico ficam no banco |
| Histórico | Abertura e toda mudança de status, com autor e horário | Acompanhamento do enunciado |

## 6. Análise crítica

### Limitações

- Sem cadastro de usuários e categorias nem troca de senha: tudo vem do seed, e mudar exige SQL.
- Sem comentários nem anexos; o responsável é sempre quem iniciou, sem transferência nem filtro "as que eu atendo".
- Expediente fixo no código (segunda a sexta, 08:00 às 18:00), sem feriados; um fuso só (`APP_TIMEZONE`).
- Sem reabertura nem cancelamento, porque o enunciado define três status; "não preciso mais" é a exclusão em Aberto, e concluída por engano exige abrir outra.
- O histórico não registra a edição de título, descrição ou categoria.
- Sessões expiradas só são apagadas quando alguém as usa; as abandonadas ficam até limpeza manual (`DELETE FROM sessions WHERE expires_at < now()`, com índice em `expires_at`).
- Busca por título com `ILIKE` sem índice e paginação por deslocamento (uma abertura durante a paginação empurra linhas para a página seguinte); serve a um portal pequeno.
- Os testes do frontend não cobrem lista, detalhe e painel. Os roteiros de axe-core e teclado não estão no repositório, leitor de tela não foi testado e regra automática cobre só parte da WCAG.
- O `po-toolbar` não tem lugar para nome e papel: aparecem no alto do menu do usuário, ao abri-lo.
- O título do `po-widget` nos cartões do painel é cortado com o espaçamento de texto da WCAG 1.4.12 forçado; não corrigi.
- O aviso de sessão conta por aba: a aba parada avisa e encerra mesmo com outra em uso.
- O compose serve em HTTP só para a própria máquina; na rede exige proxy com certificado e `HTTPS_ONLY=true`.

### Pontos em aberto

- **Ajustes de acessibilidade sobre o PO UI.** As diretivas de `core/po-a11y.ts` localizam elementos pelas classes internas (`po-menu-item-link`, `po-page-header-title`, `po-toolbar-profile` e outras). Numa atualização elas podem mudar sem erro de compilação; só o roteiro de acessibilidade (fora do repositório) acusaria, e vale rodá-lo a cada atualização do PO UI.

### Melhorias futuras

- Comentários e anexos, e aviso por e-mail a cada mudança de status.
- Transferência para outro atendente e filtro "as que eu atendo".
- Calendário de feriados e expediente configurável.
- Telas de administração de categorias e usuários.
- Trilha de auditoria das edições.
- Exportação da lista e gráficos por período no painel.
- Testes de tela e de acessibilidade automatizados no repositório.

### Requisitos que poderiam ser aperfeiçoados

O enunciado não define perfis, quem vê o quê, se o status volta, se há cancelamento, quem altera, se editar e excluir valem só para quem abriu, prazo, responsável, o conteúdo do painel por perfil nem se as categorias são fixas ou administráveis. Decidi tudo na seção 5; num projeto real levaria esses pontos ao solicitante antes de codificar.

### Em produção corporativa

- **Identidade**: SSO pelo diretório da empresa (OIDC ou SAML), sem senha local; perfis e áreas viriam de lá.
- **HTTPS** em todo o caminho com `HTTPS_ONLY=true`, e segredos em cofre, não em `.env`.
- **Migrações como etapa do deploy**, não na subida do container; seed só em demonstração.
- **Observabilidade**: logs estruturados com id por requisição, métricas, alertas; backup e teste de restauração.
- **Limpeza agendada** das sessões expiradas.
- **LGPD**: política de retenção e acesso (RH e Financeiro têm dados pessoais), incluindo por quanto tempo as excluídas ficam no banco.
