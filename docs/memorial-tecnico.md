# Memorial Técnico de Desenvolvimento

Portal de Solicitações Internas — Lucas Farias

## 1. Visão geral

O portal permite que colaboradores registrem demandas internas e acompanhem cada uma até a conclusão, e que atendentes vejam todas as demandas e avancem o status delas. É um processo simples de atendimento: abertura, atendimento, conclusão, com histórico de quem fez cada passo, prazo por categoria e um painel com os números.

A solução tem três partes no mesmo repositório: uma API REST (`backend/`), uma SPA que consome essa API (`frontend/`) e um pacote de schemas e tipos usado pelas duas (`shared/`). Um `docker compose up` sobe o banco, a API e a web sem configuração.

Procurei a solução mais simples que atendesse ao enunciado inteiro e que eu conseguisse explicar linha a linha. Onde adicionei algo além do pedido (prazo por categoria, atrasadas e tempo médio no painel), foi porque custava pouco e aproxima o projeto do dia a dia de quem trabalha com processos e SLAs.

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
| Proteções HTTP | Helmet, `@nestjs/throttler` | 8.3, 6.7 |
| Documentação da API | Swagger (`@nestjs/swagger`) | 12.0 |
| Frontend | Angular | 21.2 |
| Componentes de interface | PO UI | 21.31 |
| Testes | Vitest, Supertest, Testcontainers | 4, 7, 12.2 |
| Lint e formatação | Biome (API e `shared/`), angular-eslint e Prettier (frontend) | 2.5, 21.4, 3 |
| Repositório | Workspace pnpm | 12 |
| Execução | Docker Compose, nginx | — |
| Integração contínua | GitHub Actions | — |

São versões estáveis e com suporte na data da entrega. As dependências que escolhi à mão (Prisma, Zod, PO UI, Argon2, Helmet, Swagger) estão com a versão exata fixada no `package.json`.

## 3. Justificativa técnica

Para cada tecnologia: por que escolhi, o que ela resolve neste projeto, o que pesou contra as alternativas e o efeito em manutenção ou produtividade.

### TypeScript e Node.js

Uma linguagem só na API e no frontend permite compartilhar os schemas de validação e os tipos entre os dois lados, e é a linguagem com que trabalho hoje. C# e Java são comuns em sistemas corporativos, mas trariam um segundo ecossistema para o mesmo repositório e me obrigariam a duplicar o contrato da API à mão. O Node 24 é a versão LTS vigente na data da entrega.

### NestJS

O enunciado avalia o uso de camadas, e o NestJS já organiza o código em módulo, controller e service, com injeção de dependência, guards e filtros prontos. Em Express puro eu teria de montar essa estrutura sozinho, e cada projeto Express acaba com uma organização diferente. Na versão 12 um schema Zod pode ser passado direto em `@Body({ schema })`, e o mesmo schema gera a documentação do Swagger, então validação, tipos e documentação saem de uma única definição. Para manutenção, quem conhece NestJS encontra cada coisa onde espera.

### PostgreSQL

O enunciado pede banco SQL. O PostgreSQL é gratuito, tem imagem oficial para o Docker e oferece o que as consultas do painel usam (`COUNT(*) FILTER`, aritmética de datas com fuso). MySQL e SQL Server também atenderiam; escolhi o que consigo subir em qualquer máquina com um comando e sem licença.

### Prisma ORM

O Prisma gera as migrações como arquivos `.sql` versionados, que são os scripts de criação pedidos na entrega, e gera os tipos das consultas a partir do schema, de modo que um nome de coluna errado é erro de compilação. Das alternativas, o TypeORM mistura o modelo de domínio com a persistência em decorators, e o Drizzle ainda não tinha versão 1.0 estável na data da escolha. Onde o ORM atrapalharia, usei SQL direto: as duas consultas do painel estão escritas à mão em `dashboard.service.ts`, com parâmetros, porque são agregações que ficam mais claras em SQL.

### Zod em um pacote compartilhado

Os schemas de entrada e saída da API ficam em `shared/` e são usados nos dois lados: a API valida com eles e o frontend valida o formulário com o mesmo schema, exibindo a mesma mensagem que a API devolveria. A alternativa habitual no NestJS, `class-validator`, só funciona no backend e exigiria repetir as regras no frontend. O ganho é de manutenção: mudar o tamanho máximo do título é alterar uma linha, e API, formulário e Swagger mudam juntos.

### Sessão no servidor, cookie HttpOnly e Argon2id

O enunciado pede controle de sessão e logout. Com um token opaco guardado em cookie e uma tabela `sessions`, o logout e a expiração valem de fato no servidor: apagada a linha, o token não serve mais. Com JWT o logout só valeria com uma lista de tokens revogados, o que já é uma sessão no servidor com mais uma peça; e guardar o token no `localStorage` o deixaria ao alcance de qualquer script da página. As senhas usam Argon2id com os parâmetros mínimos recomendados pela OWASP (19 MiB de memória, 2 iterações), que é a recomendação atual no lugar do bcrypt. Os detalhes estão na seção 4.

### Helmet, limite de tentativas e Swagger

O Helmet acrescenta os cabeçalhos de segurança HTTP com uma linha. O `@nestjs/throttler` limita o login a 5 tentativas por minuto por IP. O Swagger em `/api/docs` deixa o avaliador exercitar a API pelo navegador sem ler o código, e como é gerado dos schemas Zod não fica desatualizado em relação à validação.

### Angular

O Angular é citado na descrição da vaga e é a base do PO UI. Ele traz roteamento, formulários, cliente HTTP e injeção de dependência no próprio framework, então o projeto não depende de um conjunto de bibliotecas escolhidas à parte, como aconteceria com React. Usei componentes standalone, signals para o estado das telas e Reactive Forms. Fiquei na versão 21 porque o PO UI ainda não suporta a 22.

### PO UI

É a biblioteca de componentes da TOTVS, e o uso de Angular com PO UI em widgets do Fluig é uma técnica documentada pela própria TOTVS. Para este projeto ela entrega os campos de formulário, os botões, os cartões do painel, as etiquetas de situação e os avisos, com o visual dos produtos TOTVS. O custo é o tamanho: o pacote inicial do frontend tem 3,4 MB (cerca de 650 kB transferidos), bem mais do que uma biblioteca menor exigiria. Aceitei esse custo pela produtividade e pela proximidade com o ambiente da vaga.

Algumas peças da biblioteca não passaram na verificação de acessibilidade e foram escritas com HTML nativo, mantendo o tema do PO UI: a barra do topo e o menu, o título das telas, a trilha de navegação, o diálogo de confirmação, as tabelas, os campos de data e os campos do login. Os motivos estão na seção 4, em "Acessibilidade".

### Vitest, Supertest e Testcontainers

O Vitest é o executor de testes padrão do NestJS 12 em ESM e do Angular 21, então os dois lados usam a mesma ferramenta. Os testes e2e da API sobem um PostgreSQL 18 descartável com o Testcontainers e aplicam as migrações reais: testam o mesmo SQL que vai para a entrega, em vez de um banco em memória ou de mocks do Prisma, que deixariam passar erros de consulta. O custo é precisar do Docker para rodá-los.

### Biome, angular-eslint e Prettier

O Biome faz lint e formatação do backend e de `shared/` com uma configuração só e é rápido. Ele ainda não analisa templates do Angular, então o frontend usa angular-eslint e Prettier, que são o padrão do ecossistema.

### Workspace pnpm

Um repositório com três pacotes (`shared`, `backend`, `frontend`) mantém o contrato compartilhado sem publicar pacote nenhum e permite um comando único na raiz para lint, tipos, testes e build. Dois repositórios separados tornariam a entrega e a avaliação mais difíceis.

### Docker Compose e nginx

O critério "executar sem adaptação" é atendido por um `compose.yaml` com três serviços e verificações de saúde: o banco sobe, a API aplica as migrações e o seed e só então a web fica disponível. O nginx serve os arquivos do frontend e encaminha `/api` para a API, o que põe tudo na mesma origem.

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
3. **Service**: busca os dados, aplica as regras e grava. A ordem é sempre a mesma: existe? (404) → pode? (403) → o estado permite? (409).
4. **Regras**: as regras das solicitações estão em funções puras, sem banco, em `backend/src/requests/request-rules.ts`: quem vê, quem altera, quais mudanças de status valem, como o prazo e o período são calculados. É o arquivo que concentra o negócio e o mais testado.
5. **Prisma**: acesso ao banco. O `request.mapper.ts` converte a linha do banco no formato da resposta.

A autorização fica no service, não só na rota: a mesma rota `GET /api/requests` devolve resultados diferentes para colaborador e atendente, e isso é regra de negócio.

No frontend, `core/` concentra o que é transversal (chamadas à API, sessão, interceptor, guards de rota, validação, diálogo de confirmação) e cada tela fica em sua pasta; `layout/` tem a moldura comum (barra, menu e o cabeçalho de cada tela). As permissões no frontend só decidem quais botões aparecem; quem garante é a API.

### Acessibilidade

As telas foram conferidas contra a WCAG 2.2 nível AA com o axe-core e com roteiros que usam só o teclado, em 1366, 683 (zoom de 200%), 390 e 320 px. O que isso mudou no código:

- **Estrutura nativa**: `header`, `nav`, `main` e um `h1` por tela. A cada troca de tela o foco vai para o `h1`, que é também o título da aba, e há um atalho "Pular para o conteúdo".
- **Menu e Sair** são links e botão de verdade. No `po-menu` o Enter não navegava, e o perfil do `po-toolbar` não recebia foco: não dava para sair sem mouse.
- **Diálogo de confirmação** sobre o `<dialog>` nativo: o navegador prende o foco, deixa a página de trás inerte, fecha com Esc e devolve o foco ao botão que abriu. O diálogo do PO UI não se apresentava como diálogo ao leitor de tela.
- **Tabelas nativas**, com o código da solicitação como link. No `po-table` a ação da linha não recebia foco, e a área rolável não era alcançável pelo teclado.
- **Campos de data e de login nativos**: no `po-datepicker` o foco não entrava no calendário; o `po-login` e o `po-password` não aceitam `autocomplete="username"` e `"current-password"`, e o "mostrar senha" só respondia ao mouse.
- **Erros de formulário**: cada campo aponta para a sua mensagem (`aria-describedby`, `aria-invalid`), e ao salvar com erro o foco vai para o primeiro campo inválido. Nos campos do PO UI essa ligação é feita por uma diretiva pequena (`core/field-a11y.ts`), porque o componente não a oferece.
- **Sessão**: cinco minutos antes de expirar por falta de uso aparece um aviso com "Continuar conectado", para ninguém perder o que estava digitando.
- **Resultado da lista** anunciado ao filtrar e paginar (`role="status"`), contraste do texto de exemplo dos campos corrigido e animações desligadas para quem pede menos movimento ao sistema.

### Estratégia de modelagem de dados

O detalhe de cada tabela está no [dicionário de dados](dicionario-de-dados.md). As decisões principais:

- **Categorias em tabela**, com `active` e `sla_hours`. O enunciado fala em categorias sugeridas, então criar ou desativar uma categoria não pode exigir mudança de código.
- **Status como tipo enumerado**. É um conjunto fechado e amarrado a regras do código; uma tabela daria a impressão de que basta inserir uma linha para criar um status.
- **Histórico em tabela própria** (`request_status_history`), com uma linha na abertura e uma a cada mudança. É o que permite acompanhar a evolução da solicitação, saber quem fez cada passo e calcular o tempo médio de atendimento.
- **Prazo gravado na solicitação** (`due_at`), calculado na abertura. Se o SLA da categoria mudar depois, os prazos já assumidos não mudam.
- **Código `SOL-000001` derivado do identificador** na resposta, sem coluna. Filtrar pelo código não é requisito, e uma coluna a mais seria um dado duplicado para manter.
- **Chaves inteiras sequenciais**. O que impede um colaborador de ver a solicitação de outro é a autorização, não a dificuldade de adivinhar o identificador.
- **Datas em UTC** (`timestamptz`), convertidas para o horário local só na tela.
- **Exclusão física**, permitida só em Aberto, quando ainda não houve atendimento a preservar.

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
- A sessão expira com 30 minutos sem uso ou 8 horas após o login, o que vier primeiro. O logout apaga a linha no servidor e limpa o cookie. Cada login gera um token novo.
- As senhas são guardadas como hash Argon2id. A mensagem de erro do login é a mesma para usuário inexistente e senha errada, e a senha é conferida contra um hash fictício quando o usuário não existe, para o tempo de resposta não revelar quais logins estão cadastrados.
- O login aceita 5 tentativas por minuto por IP (429 depois disso). O nginx sobrescreve o `X-Forwarded-For` com o IP que ele mesmo viu, para o limite não ser contornado forjando o cabeçalho.
- **CSRF**: a API só aceita `POST`, `PATCH` e `DELETE` com o cabeçalho `X-Requested-With: XMLHttpRequest`. Um formulário ou link em outro site não consegue enviar cabeçalho customizado sem autorização de CORS, que a API não concede. É uma das defesas descritas pela OWASP para APIs consumidas por JavaScript; o `SameSite=Strict` fica como segunda camada.
- Com `HTTPS_ONLY=true` o cookie passa a se chamar `__Host-sid` e ganha `Secure`. No compose fica desligado porque a execução local é em HTTP.

### Comunicação entre frontend e backend

JSON sobre HTTP, na mesma origem, com o cookie de sessão enviado pelo navegador. Todas as chamadas do frontend estão em `core/portal-api.ts`, tipadas com os tipos de `shared/`. Um interceptor acrescenta o cabeçalho de CSRF em toda chamada, recomeça a contagem do aviso de sessão a cada resposta e trata o 401: limpa o usuário, avisa uma vez e leva ao login guardando a tela em que a pessoa estava.

Os erros da API seguem um formato só, o da RFC 9457 (`application/problem+json`), com `status`, `title`, `detail` e, nos erros de validação, `errors` com um item por campo. Os códigos usados: 400 validação, 401 sem sessão, 403 sem permissão, 404 inexistente, 409 o estado não permite, 429 excesso de tentativas de login.

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

Testes: 48 unitários no backend (permissões, as nove combinações de transição de status, prazo, período, sessão, senha, CSRF), 55 e2e da API contra PostgreSQL real e 22 no frontend (guards de rota, interceptor, formulário de solicitação, ligação entre campo e mensagem de erro e aviso de sessão).

## 5. Regras de negócio e decisões sobre pontos em aberto do enunciado

| Ponto | Decisão | Motivo |
| --- | --- | --- |
| Perfis | Colaborador e atendente | São os dois papéis que o fluxo descrito exige |
| Quem vê o quê | Colaborador vê só as solicitações que abriu; atendente vê todas | Uma demanda de RH ou Financeiro pode conter informação pessoal |
| Quem abre | Qualquer usuário, inclusive atendente | Atendente também é colaborador da empresa |
| Quem edita ou exclui | Só quem abriu, e só em Aberto | Depois que o atendimento começa, mudar o pedido desalinha quem está atendendo |
| Quem muda o status | Só atendente | Quem pede não declara o próprio pedido atendido |
| Fluxo de status | Aberto → Em Atendimento → Concluído, sem pular e sem voltar | É o fluxo do enunciado; reabertura fica como melhoria |
| Mudança simultânea | Se dois atendentes mudam o mesmo status ao mesmo tempo, o segundo recebe 409 | Evita histórico duplicado |
| Solicitação de outro colaborador | 403, não 404 | Os identificadores são sequenciais e o código é exibido, então a existência não é segredo; 403 diz o que de fato aconteceu |
| Prazo | Abertura + SLA da categoria, em horas corridas | Dá ao painel uma medida de atraso com uma coluna só |
| Troca de categoria na edição | O prazo é refeito com o SLA da nova categoria, contado da abertura | O prazo é da categoria, e o colaborador espera desde a abertura |
| Atrasada | Não concluída e com o prazo vencido | O cartão mostra o que pede ação agora; concluída fora do prazo não entra |
| Tempo médio de atendimento | Média da abertura à conclusão, em horas com uma casa decimal; vazio sem concluídas | Sai do histórico, sem dado novo |
| Painel | Seis números (total, abertas, em atendimento, concluídas, atrasadas, tempo médio), no escopo de quem vê | Colaborador vê os seus números; atendente, os de todos |
| Categoria inexistente ou inativa | 400 apontando o campo `categoryId` | É erro de preenchimento, e o formulário consegue indicar o campo |
| Filtro por período | Datas no horário de Fortaleza; o último dia entra inteiro | O banco guarda UTC; sem a conversão, uma solicitação aberta às 22h cairia no dia seguinte |
| Limites | Título de 3 a 120 caracteres; descrição até 2000; 10 itens por página, no máximo 100 | Valores razoáveis para o formulário e para a listagem |
| Código | `SOL-000001`, derivado do identificador | Legível para o usuário, sem coluna extra |
| Exclusão | Física, só em Aberto | Ainda não há atendimento a preservar |
| Histórico | Abertura e toda mudança de status, com autor e horário | É o acompanhamento que o enunciado pede |

## 6. Análise crítica

### Limitações da solução

- Não há tela de cadastro de usuários nem de categorias, nem troca de senha. Usuários e categorias vêm do seed; incluir outros exige SQL.
- A solicitação não tem atendente responsável. Qualquer atendente avança qualquer solicitação, e só o histórico diz quem foi.
- O fluxo é linear: não há reabertura, cancelamento, comentários nem anexos.
- O prazo é contado em horas corridas, sem considerar expediente, fins de semana ou feriados.
- O fuso é fixo (Fortaleza, UTC−3). Uma empresa com unidades em outros fusos precisaria do fuso por usuário.
- O limite de tentativas de login fica na memória do processo: com mais de uma instância da API, cada uma contaria em separado.
- Sessões expiradas só são apagadas quando alguém tenta usá-las; sessões abandonadas ficam na tabela até uma limpeza manual.
- A busca por título usa `ILIKE` sem índice próprio e a paginação é por deslocamento. Atende ao volume de um portal interno pequeno, não a centenas de milhares de registros.
- A imagem Docker da API tem cerca de 1,1 GB, porque leva as dependências de desenvolvimento e o CLI do Prisma para aplicar as migrações na subida.
- Os testes do frontend cobrem guards, interceptor, formulário, ligação campo–erro e aviso de sessão; as telas de lista, detalhe e painel não têm teste automatizado no repositório. A acessibilidade foi conferida com axe-core e roteiros de teclado em Playwright que ainda estão fora do repositório; leitor de tela não foi testado, e regra automática cobre só parte da WCAG.
- O aviso de sessão perto de expirar usa 25 minutos fixos no frontend; se `SESSION_IDLE_MINUTES` mudar na API, a constante em `core/session-timer.ts` precisa mudar junto.
- O compose serve em HTTP. HTTPS depende de um proxy com certificado na frente e de `HTTPS_ONLY=true`.

### Melhorias futuras

- Atribuição da solicitação a um atendente e filtro "minhas".
- Comentários e anexos, e aviso por e-mail a cada mudança de status.
- Reabertura e cancelamento, com motivo registrado no histórico.
- Prazo em horas úteis, com calendário de feriados.
- Telas de administração de categorias e usuários.
- Exclusão lógica e trilha de auditoria das edições, não só do status.
- Exportação da lista e gráficos por categoria e período no painel.
- Testes de tela automatizados no repositório e imagem da API mais enxuta.

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
- **Limite de tentativas e sessões em armazenamento compartilhado**, para funcionar com várias instâncias, e rotina de limpeza de sessões expiradas.
- **LGPD**: política de retenção e de acesso, já que solicitações de RH e Financeiro contêm dados pessoais.
- **Plataforma**: numa empresa que já usa uma plataforma de processos como o Fluig, este fluxo seria modelado como um processo da própria plataforma, aproveitando usuários, papéis e notificações dela, e o que desenvolvi aqui à mão viraria formulário, regras de etapa e indicadores.
