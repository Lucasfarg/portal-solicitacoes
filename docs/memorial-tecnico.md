# Memorial Técnico de Desenvolvimento

Portal de Solicitações Internas — Lucas Farias

## 1. Visão geral

O portal permite que colaboradores registrem demandas internas e acompanhem cada uma até a conclusão, e que atendentes vejam todas as demandas e avancem o status delas. É um processo simples de atendimento: abertura, atendimento, conclusão, com histórico de quem fez cada passo, um responsável por atendimento, prazo por categoria em horas úteis e um painel com os números.

A solução tem três partes no mesmo repositório: uma API REST (`backend/`), uma SPA que consome essa API (`frontend/`) e um pacote de schemas e tipos usado pelas duas (`shared/`). Um `docker compose up` sobe o banco, a API e a web sem configuração.

Procurei a solução mais simples que atendesse ao enunciado inteiro. O que vai além do pedido (responsável pelo atendimento, prazo por categoria, fora do prazo e tempos médios no painel, exclusão lógica) existe porque um processo de atendimento precisa responder quem está cuidando de cada pedido, se o prazo está sendo cumprido e o que foi excluído.

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
| Documentação da API | Swagger (`@nestjs/swagger`) | 12.0 |
| Frontend | Angular | 21.2 |
| Componentes de interface | PO UI (`@po-ui/ng-components`) | 21.31 |
| Template de login | PO UI Templates (`@po-ui/ng-templates`) | 21.31 |
| Testes | Vitest, Supertest, Testcontainers | 4, 7, 12.2 |
| Lint e formatação | Biome (API e `shared/`), angular-eslint e Prettier (frontend) | 2.5, 21.4, 3 |
| Repositório | Workspace pnpm | 12 |
| Execução | Docker Compose, nginx | — |
| Integração contínua | GitHub Actions | — |

São versões estáveis e com suporte na data da entrega. As dependências que escolhi à mão (Prisma, Zod, PO UI, Argon2, Helmet, Swagger, Luxon, morgan) estão com a versão exata fixada no `package.json`.

## 3. Justificativa técnica

Para cada tecnologia: por que escolhi, o que ela resolve neste projeto, o que pesou contra as alternativas e o efeito em manutenção ou produtividade.

### TypeScript e Node.js

Uma linguagem só na API e no frontend permite compartilhar os schemas de validação e os tipos entre os dois lados. C# e Java são comuns em sistemas corporativos, mas trariam um segundo ecossistema para o mesmo repositório e me obrigariam a duplicar o contrato da API à mão. O Node 24 é a versão LTS vigente na data da entrega.

### NestJS

O enunciado avalia o uso de camadas, e o NestJS já organiza o código em módulo, controller e service, com injeção de dependência, guards e filtros prontos. Em Express puro eu teria de montar essa estrutura sozinho, e cada projeto Express acaba com uma organização diferente. Na versão 12 um schema Zod pode ser passado direto em `@Body({ schema })`, e o mesmo schema gera a documentação do Swagger, então validação, tipos e documentação saem de uma única definição. Para manutenção, quem conhece NestJS encontra cada coisa onde espera.

### PostgreSQL

O enunciado pede banco SQL. O PostgreSQL é gratuito, tem imagem oficial para o Docker e oferece o que a modelagem usa (`CHECK`, `citext`, `timestamptz`). MySQL e SQL Server também atenderiam; escolhi o que consigo subir em qualquer máquina com um comando e sem licença.

### Prisma ORM

O Prisma gera as migrações como arquivos `.sql` versionados, que são os scripts de criação pedidos na entrega, e gera os tipos das consultas a partir do schema, de modo que um nome de coluna errado é erro de compilação. Das alternativas, o TypeORM mistura o modelo de domínio com a persistência em decorators, e o Drizzle ainda não tinha versão 1.0 estável na data da escolha. Todo acesso ao banco passa pelas consultas tipadas do Prisma, inclusive as contagens do painel (`groupBy` por situação e contagem de solicitações por categoria); SQL escrito à mão só existe nas migrações, onde ficam os `CHECK`. Os tempos médios saem do histórico lido pelo Prisma e são calculados no TypeScript, porque contam horas úteis com a mesma função do prazo.

### Zod em um pacote compartilhado

Os schemas de entrada e saída da API ficam em `shared/` e são usados nos dois lados: a API valida com eles e o frontend valida o formulário com o mesmo schema, exibindo a mesma mensagem que a API devolveria. A alternativa habitual no NestJS, `class-validator`, só funciona no backend e exigiria repetir as regras no frontend. O ganho é de manutenção: os limites de tamanho são constantes de `shared/` (`TITLE_MAX`, `DESCRIPTION_MAX`), e a validação da API, o formulário (validação, `maxlength` e contador) e o Swagger leem delas. O `CHECK` do banco repete os números na migração, então mudar um limite é alterar a constante e escrever uma migração nova.

### Sessão no servidor, cookie HttpOnly e Argon2id

O enunciado pede controle de sessão e logout. Com um token opaco guardado em cookie e uma tabela `sessions`, o logout e a expiração valem de fato no servidor: apagada a linha, o token não serve mais. Com JWT o logout só valeria com uma lista de tokens revogados, o que já é uma sessão no servidor com mais uma peça; e guardar o token no `localStorage` o deixaria ao alcance de qualquer script da página. As senhas usam Argon2id com os parâmetros mínimos recomendados pela OWASP (19 MiB de memória, 2 iterações), que é a recomendação atual no lugar do bcrypt. Os detalhes estão na seção 4.

### Helmet, limite de tentativas e Swagger

O Helmet acrescenta os cabeçalhos de segurança HTTP com uma linha, e o morgan registra uma linha por requisição (método, caminho, status e duração). As contas de data do prazo em horas úteis e do período do filtro usam o Luxon, que conhece os fusos horários e as mudanças de horário: o código só percorre os dias e soma as horas de expediente. O limite de tentativas de login é uma classe pequena (`auth/login-throttle.ts`) em vez do `@nestjs/throttler`: o throttler conta toda requisição, inclusive os logins certos, e num escritório em que todos saem pelo mesmo IP a sexta pessoa a entrar no mesmo minuto seria bloqueada. Aqui só os erros contam, e eles ficam numa tabela do banco (`login_failures`), então a contagem vale para todas as instâncias da API e continua depois de um reinício. O Swagger em `/api/docs` deixa o avaliador exercitar a API pelo navegador sem ler o código, e como é gerado dos schemas Zod não fica desatualizado em relação à validação; num ambiente exposto ele é desligado com `SWAGGER_ENABLED=false`, porque entrega o mapa inteiro da API.

### Angular

O Angular é citado na descrição da vaga e é a base do PO UI. Ele traz roteamento, formulários, cliente HTTP e injeção de dependência no próprio framework, então o projeto não depende de um conjunto de bibliotecas escolhidas à parte, como aconteceria com React. Usei componentes standalone, signals para o estado das telas e Reactive Forms. Fiquei na versão 21 porque o PO UI ainda não suporta a 22.

### PO UI

É a biblioteca de componentes da TOTVS. Para este projeto ela entrega a barra do topo e o menu, o cabeçalho e a trilha de navegação das telas, as tabelas, a tela de login (`po-page-login`, do pacote de templates), os campos de formulário, os botões, a janela de confirmação, os cartões do painel, as etiquetas de situação e os avisos, com o visual dos produtos TOTVS. O custo é o tamanho: o pacote inicial do frontend tem 3,6 MB (cerca de 700 kB transferidos), bem mais do que uma biblioteca menor exigiria.

A identidade visual é do portal, aplicada sobre o tema do PO UI pelas variáveis CSS dele (`src/styles.scss`): paleta azul-petróleo no lugar do roxo padrão e a família IBM Plex Sans, servida pelo próprio app. Nenhum componente foi trocado por causa do visual.

Todas as telas usam componentes do PO UI: `po-toolbar` e `po-menu` no layout, `po-page-default` (com `po-breadcrumb`) no cabeçalho, `po-table`, `po-modal` na confirmação, `po-datepicker` e `po-checkbox` nos campos, `po-chart` no painel, e `po-page-login` (de `@po-ui/ng-templates`) no login. Onde a verificação de acessibilidade achou defeito num componente, corrigi por cima, com atributos ARIA e diretivas pequenas (`core/po-a11y.ts` e `core/field-a11y.ts`), sem trocar o componente nem escrever outro no lugar. O que não consegui consertar assim está na seção 6, em "Limitações". A lista dos ajustes está na seção 4, em "Acessibilidade".

### Vitest, Supertest e Testcontainers

O Vitest é o executor de testes padrão do NestJS 12 em ESM e do Angular 21, então os dois lados usam a mesma ferramenta. Os testes e2e da API sobem um PostgreSQL 18 descartável com o Testcontainers e aplicam as migrações reais: testam o mesmo SQL que vai para a entrega, em vez de um banco em memória ou de mocks do Prisma, que deixariam passar erros de consulta. O custo é precisar do Docker para rodá-los.

### Biome, angular-eslint e Prettier

O Biome faz lint e formatação do backend e de `shared/` com uma configuração só e é rápido. Ele ainda não analisa templates do Angular, então o frontend usa angular-eslint e Prettier, que são o padrão do ecossistema.

### Workspace pnpm

Um repositório com três pacotes (`shared`, `backend`, `frontend`) mantém o contrato compartilhado sem publicar pacote nenhum e permite um comando único na raiz para lint, tipos, testes e build. Dois repositórios separados tornariam a entrega e a avaliação mais difíceis.

### Docker Compose e nginx

O critério "executar sem adaptação" é atendido por um `compose.yaml` com três serviços e verificações de saúde: o banco sobe, a API aplica as migrações e o seed e só então a web fica disponível. O nginx serve os arquivos do frontend e encaminha `/api` para a API, o que põe tudo na mesma origem. Ele entrega os arquivos comprimidos (gzip): o bundle com o PO UI tem 3,6 MB e trafega com cerca de 700 kB. Os `.js` e `.css`, que levam um hash no nome, ficam um ano no cache do navegador, e o `index.html` é sempre conferido com o servidor. As portas são publicadas só em `127.0.0.1`, porque o compose serve em HTTP, e a API não publica porta nenhuma: só o nginx fala com ela. A verificação de saúde da API dá até dois minutos para as migrações e o seed da primeira subida, para uma máquina lenta não marcar a API como fora do ar. A imagem da API é construída em etapas: as dependências de desenvolvimento ficam na etapa de build, e a imagem final leva só o código compilado, as dependências de produção e as migrações.

### GitHub Actions

O workflow executa lint, verificação de tipos, testes unitários, testes e2e e build a cada pull request e a cada push na `main`. Serve para provar que o repositório se constrói do zero numa máquina limpa.

## 4. Justificativa conceitual

### Estrutura geral da aplicação

```txt
navegador ──> nginx ─┬─ /       arquivos da SPA (Angular)
                     └─ /api/*  API NestJS ──> PostgreSQL
```

Escolhi API REST e SPA separadas, na mesma origem. O enunciado avalia a API e o consumo dela como coisas distintas, e uma aplicação renderizada no servidor esconderia essa fronteira. Servir as duas pela mesma origem dispensa CORS e permite o cookie de sessão mais restrito possível (`SameSite=Strict`).

### Organização das camadas

Na API, cada requisição passa por:

1. **Guards globais**: `CsrfGuard` (exige o cabeçalho `X-Requested-With` nos métodos que alteram dados) e `AuthGuard` (exige sessão válida, menos nas rotas marcadas com `@Public()`).
2. **Controller**: recebe a requisição, valida corpo, parâmetros e filtros com o schema Zod e chama o service. Não tem regra de negócio.
3. **Service**: busca os dados, aplica as regras e grava. A ordem é quase sempre a mesma: existe e a pessoa pode vê-la? (404) → pode fazer isso? (403) → o estado permite? (409). A exceção é concluir: a transição é conferida antes (409) e só então se quem conclui é o responsável (403), porque "responsável" só existe a partir de Em Atendimento.
4. **Regras**: as regras das solicitações estão em funções puras, sem banco. Quem vê, quem altera e quais mudanças de status valem ficam em `shared/src/request-rules.ts`, usadas pela API e pelo frontend; `backend/src/requests/request-rules.ts` transforma cada recusa no erro HTTP e calcula o prazo, as horas úteis e o período do filtro. São os arquivos que concentram o negócio e os mais testados.
5. **Prisma**: acesso ao banco. O `request.mapper.ts` converte a linha do banco no formato da resposta.

A autorização fica no service, não só na rota: a mesma rota `GET /api/requests` devolve resultados diferentes para colaborador e atendente, e isso é regra de negócio.

No frontend, `core/` concentra o que é transversal (chamadas à API, sessão, interceptor, guards de rota, validação, diálogo de confirmação) e cada tela fica em sua pasta; `layout/` tem a moldura comum (barra, menu e o cabeçalho de cada tela). As permissões no frontend usam as mesmas funções de `shared/` e só decidem quais botões aparecem; quem garante é a API.

### Acessibilidade

Referência: WCAG 2.2, nível AA. Conferência: o axe-core (regras automáticas) em cada tela e roteiros que percorrem as telas só com o teclado, nas larguras de 1366, 683 (zoom de 200%), 390 e 320 px. O que a conferência mudou no código:

- **Estrutura**: a barra do topo é marcada como `banner` e o `po-menu` inteiro, com a marca dentro, é a região de navegação, com o nome "Menu principal". O `po-page-default` desenha o título da tela como `h2`; ele recebe `aria-level="1"` para ser o título principal. Na primeira carga e a cada troca de tela o foco vai para esse título, que é também o título da aba, e há um atalho "Pular para o conteúdo".
- **Menu e Sair**: no `po-menu`, Enter e Espaço num item não navegavam (o componente cancela a tecla e só marca o item), o botão do menu no celular só respondia ao mouse e o menu fechado deixava paradas de Tab fora da tela. Agora os dois teclados navegam, o botão é um botão de verdade, o menu fechado fica inerte e o item da tela atual leva `aria-current`. O "Sair" fica no menu do usuário do `po-toolbar`, cujo ícone de perfil só respondia ao clique; agora o teclado o alcança.
- **Diálogo de confirmação** sobre o `po-modal`, que devolve o foco ao botão que abriu. Ele deixava o Tab escapar para a página de trás e ignorava o Esc quando o foco saía; o componente `core/confirm-dialog.ts` traz o foco de volta e fecha com Esc em qualquer caso. O `po-modal` também não se apresentava como diálogo ao leitor de tela: o mesmo componente grava `role="dialog"`, `aria-modal` e a ligação com o título e a mensagem. O botão de confirmar diz a ação ("Iniciar atendimento", "Excluir"), não "Confirmar". O `po-modal` só leva o foco para dentro se já estiver desenhado; como o app agrupa eventos e desenha no quadro seguinte, forço o desenho antes de abrir.
- **Login**: o `po-page-login` não tem região principal nem anuncia o erro de senha ao leitor de tela; a tela o envolve em `main` e repete a mensagem num aviso só para leitor de tela.
- **Trilha de navegação**: no `po-breadcrumb` o item atual era uma parada de Tab sem função e tinha `aria-current` com o texto do item; agora o item é só texto e leva `aria-current="page"`.
- **Tabelas**: a área do `po-table` que rola de lado não recebia foco nem tinha nome; agora é uma região nomeada, que o teclado alcança. O código da solicitação é um link. O botão do `po-chart` que mostra os dados do gráfico em tabela era só um ícone; agora tem nome ("Ver os dados do gráfico em tabela").
- **Campos**: no `po-datepicker` os seletores de mês e ano do calendário não tinham rótulo, e Enter no campo não enviava o filtro; agora têm "Mês" e "Ano" e o Enter envia. O `po-checkbox` deixava `aria-checked` num elemento sem função, que a diretiva remove.
- **Erros de formulário**: cada campo aponta para a sua mensagem (`aria-describedby`, `aria-invalid`), e ao salvar com erro o foco vai para o primeiro campo inválido. Nos campos do PO UI essa ligação é feita por uma diretiva pequena (`core/field-a11y.ts`), porque o componente não a oferece.
- **Sessão**: cinco minutos antes de expirar por falta de uso (ou na metade do tempo, numa sessão curta) aparece um aviso com "Continuar conectado", para ninguém perder o que estava digitando. A API informa em cada resposta, inclusive nas de erro, o tempo da sessão e quanto falta dele (cabeçalhos `X-Session-Idle-Minutes` e `X-Session-Remaining-Seconds`), então o aviso acompanha `SESSION_IDLE_MINUTES` e o fim real no servidor.
- **Avisos** (confirmações e erros) ficam 15 segundos na tela, tempo para serem lidos ou ouvidos até o fim.
- **Lista**: o resultado é anunciado ao filtrar e paginar (`role="status"`), e Esc no campo Título apaga o texto da busca. Se a busca falha, quem anuncia é o aviso de erro, numa região viva que já existe na página, e não "0 solicitações".
- **Contraste** do texto de exemplo dos campos corrigido e animações desligadas para quem pede menos movimento ao sistema.

### Estratégia de modelagem de dados

O detalhe de cada tabela está no [dicionário de dados](dicionario-de-dados.md). As decisões principais:

- **Categorias em tabela**, com `active` e `sla_hours`. O enunciado fala em categorias sugeridas, então criar ou desativar uma categoria não pode exigir mudança de código.
- **Status como tipo enumerado**. É um conjunto fechado e amarrado a regras do código; uma tabela daria a impressão de que basta inserir uma linha para criar um status.
- **Histórico em tabela própria** (`request_status_history`), com uma linha na abertura e uma a cada mudança. É o que permite acompanhar a evolução da solicitação, saber quem fez cada passo e calcular os tempos médios e as concluídas fora do prazo do painel.
- **Responsável na solicitação** (`assignee_id`): quem inicia o atendimento. Um `CHECK` amarra a coluna ao status: nula em Aberto, preenchida fora dele.
- **Prazo gravado na solicitação** (`due_at`), calculado na abertura em horas úteis. Se o SLA da categoria mudar depois, os prazos já assumidos não mudam.
- **Código `SOL-000001` derivado do identificador** na resposta, sem coluna. Filtrar pelo código não é requisito, e uma coluna a mais seria um dado duplicado para manter.
- **Chaves inteiras sequenciais**. O que impede um colaborador de ver a solicitação de outro é a autorização, não a dificuldade de adivinhar o identificador.
- **Datas em UTC** (`timestamptz`), convertidas para o horário local só na tela. O fuso da empresa (`APP_TIMEZONE`) entra nas contas que dependem do relógio local: o expediente do prazo e o início de cada dia no filtro por período.
- **Exclusão lógica** (`deleted_at`), permitida só em Aberto. A solicitação some das telas e do painel, mas a linha e o histórico ficam no banco.
- **Tentativas de login erradas em tabela** (`login_failures`), sem chave estrangeira, porque o login digitado pode não existir.
- **Regras também no banco** (`CHECK`): tamanho do título e da descrição, SLA positivo, prazo depois da abertura, histórico coerente (só a abertura não tem status de origem), responsável só fora de Aberto, exclusão só em Aberto. A API valida antes, com a mensagem para a tela; o banco garante porque a API não é o único caminho até ele, e usuários e categorias novos entram por SQL.
- **Login e nome de categoria em `citext`**: "Ana" e "ana" são o mesmo login, e "TI" e "ti" não coexistem.
- **Usuário com `active`**, como a categoria: quem sai da empresa é desativado e perde as sessões, e o histórico continua dizendo quem fez o quê.
- **`status` repetido na solicitação**: é o `to_status` do último registro do histórico, gravado na mesma transação. Assim a lista e o painel leem o status sem juntar o histórico.
- **Índices pelas consultas reais**: um composto `(requester_id, created_at DESC)` para a lista do colaborador e `(status, due_at)` para "fora do prazo"; não há índice só em `status`, que com três valores quase não filtra.
- **Gravação condicional**: editar, excluir e mudar status conferem a regra no próprio `WHERE` (`status = 'OPEN'`, ou o status lido, e o responsável na conclusão). Se outra pessoa mudou a solicitação no meio, nada é gravado e a resposta é 409.
- **Um relógio só**: abertura, prazo, histórico, sessões, e "fora do prazo" usam o relógio da API, e a API devolve `overdue` pronto. Assim o painel, o filtro e a etiqueta da tela nunca discordam por diferença de relógio.

### Padrões de projeto utilizados

- **Injeção de dependência**, do NestJS e do Angular: cada classe recebe o que usa pelo construtor, o que permite trocar dependências nos testes.
- **Guards e filtro global** para o que vale em toda rota (sessão, CSRF, formato de erro), em vez de repetir a verificação em cada controller.
- **Decorators** próprios, `@Public()` e `@CurrentUser()`, para declarar a exceção e obter o usuário da sessão.
- **Regras em funções puras, entrada e saída nas bordas**: o service busca e grava; a decisão é tomada por funções sem efeito colateral, testadas sem banco.
- **Schema único como contrato**: o mesmo schema Zod valida na API, valida no formulário, tipa as chamadas e documenta no Swagger.
- **Mapper** entre a linha do banco e a resposta da API, para o formato do banco não vazar para o cliente.
- **Atualização condicional** na mudança de status: o `UPDATE` inclui o status lido (`WHERE id = ? AND status = ?`). Se outro atendente mudou primeiro, nenhuma linha é alterada, a resposta é 409 e o histórico não duplica.
- **Interceptor HTTP e guards de rota** no frontend, pelo mesmo motivo dos guards da API.
- **URL como fonte da verdade** dos filtros da lista: filtros e página ficam na query string, então recarregar, voltar e compartilhar o endereço funcionam.

### Estratégia de autenticação

- No login a API gera um token aleatório de 32 bytes e o devolve num cookie `HttpOnly; SameSite=Strict; Path=/`. JavaScript não consegue ler o cookie, e o navegador não o envia em requisições vindas de outro site.
- No banco fica só o SHA-256 do token. Quem conseguir ler a tabela `sessions` não consegue usar as sessões.
- A sessão expira com 30 minutos sem uso ou 8 horas após o login, o que vier primeiro. O logout apaga a linha no servidor e limpa o cookie, inclusive com a sessão já vencida (a rota não exige sessão, só o cabeçalho de CSRF). Cada login gera um token novo.
- As senhas são guardadas como hash Argon2id. A mensagem de erro do login é a mesma para usuário inexistente e senha errada, e a senha é conferida contra um hash fictício quando o usuário não existe, para o tempo de resposta não revelar quais logins estão cadastrados.
- O login bloqueia (429) quando há, no último minuto, 5 erros no mesmo usuário vindos do mesmo IP, ou 20 erros do mesmo IP somando usuários. Login certo não conta e apaga os erros daquele usuário naquele IP. Cada tentativa grava a sua linha antes de conferir a senha e só então conta: tentativas simultâneas não passam todas pela contagem zerada (a linha sai se a senha estiver certa ou se a tentativa for recusada). Os erros ficam na tabela `login_failures`, e as linhas com mais de um minuto são apagadas a cada tentativa: a contagem vale com várias instâncias da API e sobrevive a um reinício. Usuário desativado recebe a mesma resposta de senha errada, e cada recusa fica no log com o login tentado e o IP, nunca a senha. Entrar de novo no mesmo navegador encerra a sessão anterior. O nginx sobrescreve o `X-Forwarded-For` com o IP que ele mesmo viu, e a API só aceita esse cabeçalho de conexões vindas de `TRUST_PROXY` (no compose, a rede interna, onde a API não publica porta e só o nginx a alcança; fora dele, só a própria máquina), para o limite não ser contornado forjando o cabeçalho.
- **CSRF**: a API só aceita `POST`, `PATCH` e `DELETE` com o cabeçalho `X-Requested-With: XMLHttpRequest`. Um formulário ou link em outro site não consegue enviar cabeçalho customizado sem autorização de CORS, que a API não concede. É uma das defesas descritas pela OWASP para APIs consumidas por JavaScript; o `SameSite=Strict` fica como segunda camada.
- Com `HTTPS_ONLY=true` o cookie passa a se chamar `__Host-sid` e ganha `Secure`; é o caminho para produção, atrás de um proxy com certificado. No compose fica desligado porque a execução local é em HTTP, e por isso o compose publica as portas só em `127.0.0.1`: nada dele fica exposto à rede.

### Comunicação entre frontend e backend

JSON sobre HTTP, na mesma origem, com o cookie de sessão enviado pelo navegador. Todas as chamadas do frontend estão em `core/portal-api.ts`, tipadas com os tipos de `shared/`. Um interceptor acrescenta o cabeçalho de CSRF em toda chamada, recomeça a contagem do aviso de sessão a cada resposta, inclusive as de erro, com o tempo de sessão e o que falta dele, que a API informa nos cabeçalhos `X-Session-Idle-Minutes` e `X-Session-Remaining-Seconds`, e trata o 401: limpa o usuário, avisa uma vez e leva ao login guardando a tela em que a pessoa estava.

Os erros da API seguem um formato só, o da RFC 9457 (`application/problem+json`), com `status`, `title`, `detail` e, nos erros de validação, `errors` com um item por campo. Corpo que não é JSON válido também responde 400, em português: o adaptador do Express (`common/http-adapter.ts`) converte o erro do parser na origem. Os códigos usados: 400 validação, 401 sem sessão, 403 sem permissão, 404 inexistente ou fora do alcance de quem pede, 409 o estado não permite, 429 excesso de tentativas de login.

### Organização do código-fonte

```txt
shared/src/     schemas Zod, tipos, rótulos de status e perfil, fluxo de status
backend/src/    um módulo por assunto: auth, requests, categories, dashboard, health
backend/test/   testes e2e, um arquivo por módulo
frontend/src/app/
  core/         API, sessão, interceptor, guards, validação
  login/ dashboard/ requests/ layout/   uma pasta por tela ou grupo de telas
```

O código (nomes, tabelas, rotas da API) está em inglês; mensagens ao usuário, rotas das telas e comentários, em português. Os comentários explicam o motivo de uma decisão, não o que a linha faz.

Testes: cada um parte de uma regra do sistema, não de uma linha de código. São 39 testes da API contra PostgreSQL real (abrir, listar e filtrar, quem pode ver, editar e excluir, fluxo de status com histórico, responsável, dois pedidos simultâneos, login, sessão, limite de tentativas, painel, regras do banco) 19 unitários das contas que não precisam de banco (as nove combinações de transição de status, o prazo em horas úteis e a senha) e 18 no frontend (formulário de solicitação, guards de rota, interceptor, aviso de sessão e ligação entre campo e mensagem de erro).

## 5. Regras de negócio e decisões sobre pontos em aberto do enunciado

| Ponto | Decisão | Motivo |
| --- | --- | --- |
| Perfis | Colaborador e atendente | São os dois papéis que o fluxo descrito exige |
| Quem vê o quê | Colaborador vê só as solicitações que abriu; atendente vê todas | Uma demanda de RH ou Financeiro pode conter informação pessoal |
| Quem abre | Qualquer usuário, inclusive atendente | Atendente também é colaborador da empresa |
| Quem edita ou exclui | Só quem abriu, e só em Aberto | Depois que o atendimento começa, mudar o pedido desalinha quem está atendendo |
| Quem muda o status | Só atendente, e nunca numa solicitação que ele mesmo abriu (403) | Quem pede não declara o próprio pedido atendido |
| Responsável | Quem inicia o atendimento vira o responsável; só ele conclui (403 para outro atendente). As telas mostram "Responsável", ou "Ninguém ainda" em Aberto | Cada solicitação em andamento tem uma pessoa que responde por ela |
| Fluxo de status | Aberto → Em Atendimento → Concluído, sem pular e sem voltar | É o fluxo do enunciado |
| Mudança simultânea | Se dois atendentes mudam o mesmo status ao mesmo tempo, o segundo recebe 409 | Evita histórico duplicado e dois responsáveis |
| Solicitação de outro colaborador | 404, não 403 | Quem não pode ver a solicitação não fica sabendo que aquele número existe |
| Prazo | SLA da categoria contado em horas úteis: segunda a sexta, das 08:00 às 18:00, no fuso `APP_TIMEZONE`, sem feriados. Aberta fora do expediente, começa a contar no próximo início de expediente | Um pedido aberto na sexta à noite não vence no fim de semana, quando ninguém atende |
| Troca de categoria na edição | O prazo passa a ser o menor entre o atual e o refeito com o SLA da nova categoria, contado da abertura | Se o prazo pudesse aumentar, bastaria trocar a categoria para tirar a solicitação do atraso |
| Fora do prazo | Não concluída e com o prazo vencido; tem cartão no painel e filtro na lista | Mostra o que pede ação agora. "Fora do prazo", e não "Atrasada", porque a etiqueta aparece ao lado de "Aberto" e "Em Atendimento", os nomes de status do enunciado |
| Concluídas fora do prazo | Concluídas depois do prazo; cartão próprio no painel | Mede o prazo cumprido, que o cartão "Fora do prazo" deixa de contar quando a solicitação é concluída |
| Tempos médios | Até o início (da abertura a Em Atendimento) e até a conclusão (da abertura a Concluído), em horas úteis, a mesma régua do prazo: aberta na sexta às 17h e iniciada na segunda às 9h esperou 2 h, não 64 h; a API devolve horas com uma casa decimal e a tela mostra "N h úteis" (sem converter em dias: 24 h úteis são mais de dois dias de expediente), ou "Sem dados" enquanto não há registros | Separam a espera pela primeira resposta do tempo total, e saem do histórico, sem dado novo |
| Painel | Oito números (total, um por status, fora do prazo, concluídas fora do prazo, tempo médio até o início, tempo médio até a conclusão) e dois gráficos (`po-chart`): solicitações por situação e por categoria. Tudo no escopo de quem vê; os cartões de situação e o de fora do prazo abrem a lista já filtrada | Colaborador vê os seus números; atendente, os de todos |
| Categoria inexistente ou inativa | 400 apontando o campo `categoryId` | É erro de preenchimento, e o formulário consegue indicar o campo |
| Filtro por período | Datas no fuso `APP_TIMEZONE` (padrão `America/Fortaleza`); o último dia entra inteiro | O banco guarda UTC; sem a conversão, uma solicitação aberta às 22h cairia no dia seguinte |
| Título | De 3 a 120 caracteres, contados como o banco conta (um emoji é um caractere) | Cabe numa linha da tabela e num assunto de e-mail |
| Descrição | Até 2000 caracteres | Cerca de uma página de texto: basta para descrever um pedido sem virar documento |
| Itens por página | 10 por padrão, no máximo 100 | Dez cabem na tela de um notebook sem rolagem; 100 é o teto para a API não devolver páginas enormes |
| Código | `SOL-000001`, derivado do identificador | Legível para o usuário, sem coluna extra |
| Exclusão | Lógica (`deleted_at`), só pelo dono e só em Aberto; a excluída some da lista, do detalhe (404) e do painel | A linha e o histórico ficam no banco, e o que foi excluído continua rastreável |
| Histórico | Abertura e toda mudança de status, com autor e horário | É o acompanhamento que o enunciado pede |

## 6. Análise crítica

### Limitações da solução

- Não há tela de cadastro de usuários nem de categorias, nem troca de senha. Usuários e categorias vêm do seed; incluir, desativar ou trocar o SLA exige SQL (as regras do banco valem também aí).
- Não há comentários nem anexos na solicitação.
- O responsável é sempre quem iniciou o atendimento; não há como passar a solicitação para outro atendente, e a lista não tem filtro "as que eu atendo".
- O expediente do prazo é fixo no código (segunda a sexta, das 08:00 às 18:00) e não considera feriados.
- O fuso é um só para a empresa (`APP_TIMEZONE`); não há fuso por usuário nem por unidade.
- Não há reabertura nem cancelamento: o enunciado define três status (Aberto, Em Atendimento, Concluído), e um quarto status ou uma volta no fluxo mudaria o que ele pede. O caso "não preciso mais" é coberto pela exclusão em Aberto; uma solicitação concluída por engano é aberta de novo.
- O histórico registra só as mudanças de status: a edição de título, descrição ou categoria não fica registrada.
- Sessões expiradas só são apagadas quando alguém tenta usá-las; sessões abandonadas ficam na tabela até uma limpeza manual (`DELETE FROM sessions WHERE expires_at < now()`, que usa o índice em `expires_at`).
- A busca por título usa `ILIKE` sem índice próprio e a paginação é por deslocamento: uma solicitação aberta enquanto alguém pagina empurra as linhas para a página seguinte. Atende ao volume de um portal interno pequeno, não a centenas de milhares de registros.
- Os testes do frontend cobrem guards, interceptor, formulário (inclusive o aviso de alterações não salvas), ligação campo–erro e aviso de sessão; as telas de lista, detalhe e painel não têm teste automatizado no repositório. Os roteiros de axe-core e de teclado que conferiram a acessibilidade não estão no repositório; leitor de tela não foi testado, e regra automática cobre só parte da WCAG.
- O `po-toolbar` não tem lugar para mostrar o nome e o papel de quem entrou: eles aparecem no alto do menu do usuário, ao abri-lo, e não fixos na barra.
- Nos cartões do painel, o título do `po-widget` é cortado quando o usuário força o espaçamento de texto da WCAG 1.4.12; não corrigi.
- A contagem do aviso de sessão é por aba: com duas abas abertas, a que ficou parada avisa e encerra mesmo que a outra esteja em uso.
- O compose serve em HTTP, só para a própria máquina. Servir na rede exige um proxy com certificado na frente e `HTTPS_ONLY=true`.

### Pontos em aberto

- **Ajustes de acessibilidade por cima do PO UI.** As diretivas de `core/po-a11y.ts` procuram elementos pelas classes internas dos componentes (`po-menu-item-link`, `po-page-header-title`, `po-toolbar-profile` e outras). Numa atualização da biblioteca essas classes podem mudar e o ajuste deixa de valer sem erro de compilação; o roteiro de acessibilidade, que não está no repositório, é o que acusaria. Vale rodá-lo a cada atualização do PO UI.

### Melhorias futuras

- Comentários e anexos, e aviso por e-mail a cada mudança de status.
- Transferência da solicitação para outro atendente e filtro "as que eu atendo".
- Calendário de feriados e expediente configurável no cálculo do prazo.
- Telas de administração de categorias e usuários.
- Trilha de auditoria das edições, não só do status.
- Exportação da lista e gráficos por período no painel.
- Testes de tela e de acessibilidade automatizados no repositório.

### Requisitos que poderiam ser aperfeiçoados

O enunciado deixa em aberto pontos que mudam o sistema e que precisei decidir (seção 5):

- Não define perfis nem quem enxerga as solicitações de quem.
- Não diz se o status pode voltar, se existe cancelamento ou quem pode alterá-lo.
- Permite editar e excluir solicitação aberta, sem dizer se isso vale só para quem abriu.
- Não fala em prazo nem em responsável pelo atendimento, que são o que mais interessa a quem gerencia um processo desses.
- Não define o que o painel mostra para cada perfil.
- Trata as categorias como sugeridas, sem dizer se são fixas ou administráveis.

Num projeto real eu levaria esses pontos ao solicitante antes de codificar. Aqui registrei cada decisão e o motivo.

### O que seria diferente em produção corporativa

- **Identidade**: login pelo diretório da empresa (SSO com OIDC ou SAML), sem senha local. Perfis e áreas viriam de lá.
- **HTTPS** em todo o caminho, com `HTTPS_ONLY=true`, e segredos em cofre, não em `.env`.
- **Migrações como etapa do deploy**, não na subida do container, e seed só em ambientes de demonstração.
- **Observabilidade**: logs estruturados com identificador por requisição, métricas e alertas; backup e teste de restauração do banco.
- **Rotina de limpeza** das sessões expiradas, agendada, em vez da limpeza manual.
- **LGPD**: política de retenção e de acesso, já que solicitações de RH e Financeiro contêm dados pessoais; isso inclui decidir por quanto tempo as solicitações excluídas ficam no banco.
