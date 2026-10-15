# PROJETO.md — Finanças a Dois

> Retrato ÚNICO do estado atual. Sempre sobrescrito, nunca acumulado.
> Última atualização: 2026-10-15, por Maestro, após auditoria Sentinela R5
> (REPROVADO → achados ALTO corrigidos), correção de contraste de texto e
> edição/exclusão de lançamentos completos de ponta a ponta.
> Histórico de entregas: `ENTREGA.md` (quando existir). Plano vivo: `PLANO.md`
> (revisão 2 em `C:\Users\Heitor PC\.claude\plans\harmonic-jingling-eclipse.md`).

## 1. O que o sistema faz e para quem

App de finanças para um casal (não para uma pessoa só): cada um lança receitas
e despesas, vê o saldo das contas e cartões do outro em tempo real, fecha a
fatura do cartão no dia certo, e "acerta as contas" no fim do mês quando um
pagou mais que o outro. É um PWA — instala na tela inicial do celular e manda
notificação quando o parceiro lança algo. Hoje serve literalmente uma família:
Heitor e Carol. Está em produção em `https://financascasais.vercel.app`.

## 2. Decisões de arquitetura e por quê

- **Next.js 16 (App Router) + Supabase hospedado + Vercel.** Stack única do
  time HORI — fonte: doutrina do Maestro, sem alternativa avaliada.
- **`proxy.ts` em vez de `middleware.ts`** — Next 16 renomeou o arquivo.
  Fonte: `vercel:nextjs`.
- **RLS por família (`family_id`), não por usuário.** Cada membro só lê/escreve
  linhas da própria família; a fronteira é a família, não o indivíduo — é
  assim que "ver o saldo do parceiro" funciona sem o parceiro compartilhar
  senha. Fonte: `supabase:supabase-postgres-best-practices`, decisão de
  tenancy tomada no Passo 3 do plano.
- **Toda `VIEW` de agregação com `security_invoker=true`.** Sem isso a view
  rodaria com o privilégio de quem a criou, não de quem consulta — vazaria
  dado entre famílias. Fonte: `supabase:supabase`.
- **Server Actions como única porta de escrita para dado sensível** (lançamento,
  categoria, conta, pagamento de fatura). O front nunca grava direto no banco
  para esses casos — a Action valida com Zod, resolve a família pela sessão
  (nunca por parâmetro vindo do cliente) e só então toca o banco.
- **`service_role` proibido em código de produção, com uma exceção única e
  documentada:** o módulo de envio de push (Fase B, ainda não construído)
  precisa ler o token de notificação do OUTRO membro da família, e o RLS de
  `push_subscriptions` é por membro — ninguém lê o token do parceiro com a
  própria sessão. A exceção vive em um arquivo só (`src/lib/supabase/servico.ts`,
  `import 'server-only'`), nunca em componente de cliente.
- **Datas em `YYYY-MM-DD` puro, sem biblioteca de datas.** Evita fuso horário
  silenciosamente deslocando "compra no dia 30" para "dia 29" em alguma
  camada. `<input type="date">` nativo em vez do `calendar` do shadcn (que
  arrastaria `date-fns`).
- **Valores monetários em centavos inteiros no banco**, nunca float.

## 3. Mapa do sistema

### Tabelas (migration `00001_initial_schema.sql`)

| Tabela | Guarda |
|---|---|
| `families` | a casa: nome, `join_code`, limite de membros |
| `family_members` | quem pertence a cada família, nome de exibição, `user_id` |
| `accounts` | contas corrente e cartões; cartão tem `closing_day`/`due_day` |
| `categories` | categoria de lançamento, por tipo (receita/despesa) |
| `payment_methods` | forma de pagamento nomeada pela família |
| `transactions` | o lançamento em si — valor, data, categoria, conta, quem lançou, fútil/benefício |
| `push_subscriptions` | token de notificação push, por membro (RLS por membro) |
| `account_goals` | meta por conta (Fase B, ainda sem UI) |
| `category_budgets` | orçamento por categoria (Fase B, ainda sem UI) |

### Views (`00004_views.sql`, todas `security_invoker`)

- `v_account_balances` — saldo corrente por conta
- `v_invoices` — fatura do cartão por ciclo (compra no dia do fechamento
  entra no ciclo SEGUINTE — regra testada e reverificada várias vezes)
- `v_settlement` — quem deve quanto a quem no acerto do mês
- `v_monthly_summary` — resumo do mês para `/inicio`

### Funções/RPC (`00003`, `00007`, `00008`)

`create_family`, `join_family` (com limite de tentativas desde `00007`),
`family_preview`, `save_transactions`, `delete_transactions`, `pay_invoice`,
`settle_up`, `rotacionar_join_code`, `registrar_tentativa_join`.

**Risco aberto:** `pay_invoice` e `settle_up` são chamadas hoje DIRETO do
navegador (`dialogo-pagar-fatura.tsx`, `dialogo-acertar.tsx`), não por uma
Server Action — então pagar fatura e acertar conta nunca disparam notificação
push para o parceiro, mesmo depois que o push existir. Correção planejada
(R-13 do plano): `pagarFatura`/`registrarAcerto` em `src/actions/`, ainda não
construídas.

### Server Actions (`src/actions/`)

| Arquivo | Cobre |
|---|---|
| `auth.ts` | login, cadastro, sair, recuperar/nova senha |
| `familia.ts` | criar/entrar na família, convite |
| `lancamento.ts` | `salvarLancamento` — aceita fútil/benefício desde antes desta rodada |
| `categorias.ts` | CRUD em lote (vírgula/quebra de linha), arquivar, excluir com reatribuição |
| `formas-pagamento.ts` | idem, sem o campo `tipo` |
| `contas.ts` | criar/editar conta; tipo não é editável depois de criada |
| `contexto-familia.ts` | resolve usuário+família da sessão, usado por toda action |
| `resultado.ts` | contrato de retorno único: `{ ok, dados }` ou `{ ok: false, erro, camposComErro }` |

### Rotas (`src/app/`)

`/login`, `/cadastro`, `/recuperar-senha`, `/nova-senha` → `(app)/onboarding`
(criar ou entrar na família) → `(app)/(principal)/`: `inicio`, `lancar`,
`carteira`, `acerto`, `analises`, `ajustes` (+ `ajustes/categorias`,
`formas-pagamento`, `contas`, `familia`, `perfil`).

### Design tokens

`app/src/app/globals.css`, via `@theme` (Tailwind 4 — não mapeia font-size
nem spacing, por isso `text-(length:--token)`/`gap-[var(--esp-4)]` em vez de
classe utilitária normal). 4 paletas, contraste medido (180 pares, 0 falhas
na última auditoria registrada em `RETOMADA.md`).

### Fronteira de ownership (quem toca o quê)

Backend (migrations, `src/actions/`, `src/lib/` novo, `src/types/`, `tests/`)
é meu. Front (`src/components/`, `src/app/`, `src/features/`, `public/sw.js`)
é do Antigravity. Nunca o mesmo arquivo pelos dois na mesma rodada.

## 4. Estado atual

### Funcionando

- Login, cadastro, recuperar/nova senha, onboarding de família.
- `/lancar`, `/inicio`, `/carteira`, `/acerto`, `/analises` com dados reais.
- Editar dia de fechamento/vencimento de cartão já existente — JÁ FUNCIONA
  (confirmado nesta sessão): `dialogo-conta.tsx` pré-preenche e permite
  editar esses campos quando a conta editada é do tipo cartão.
- E-mail da Carol no Supabase Auth trocado de teste
  (`carol.financas.teste@gmail.com`) para o real
  (`m.carolina.s.chaves@gmail.com`) — verificado com hash do banco
  antes/depois (zero diferença fora do e-mail) e login testado nos dois
  endereços. `realtime-duas-sessoes.mjs` atualizado para ler
  `SEED_EMAIL_PARCEIRA` em vez de hardcode.
- **Grupos de categoria (pastas)** — back-end (`6df56d8`) e front
  (Antigravity, Rodada 5: `01cc8f1`..`d37467e`) publicados e verificados
  (`tsc`/`next build` limpos, confirmado independentemente): criar grupo em
  Ajustes > Categorias, atribuir categoria a um grupo (menu simples), e
  filtrar o seletor de categoria em `/lancar` por grupo. Um grupo por
  categoria (como pasta); excluir grupo só desvincula, nunca apaga
  categoria.
- CRUD completo de categorias/formas de pagamento/contas — back-end
  (`18c327e`) e front (Antigravity, Rodada 4: `858bb66`..`24871bb`) os dois
  publicados e ligados: `gerenciador-categorias.tsx`,
  `gerenciador-formas-pagamento.tsx`, `dialogo-conta.tsx`,
  `botao-arquivar-conta.tsx` já importam as Server Actions reais, sem mais
  stub local. Verificado com `tsc`/`vitest`/`next build` limpos e screenshots
  nos 3 breakpoints + dark.
- Responsividade de `/inicio` redesenhada (Antigravity, `24871bb`): painel de
  indicadores lado a lado a partir de tablet, tabela de lançamentos em
  largura total no desktop (antes limitada a ~400px por um `max-w-5xl` no
  `<main>`).
- Realtime entre as duas sessões (Heitor↔Carol): lançamento novo aparece e
  lançamento excluído some, sem duplicar — provado 5/5.
- Rotação de código de convite, com limite de tentativas.
- PWA: manifest, ícones, service worker com handler de push e
  `notificationclick`.
- **Push real no celular** — back-end completo e verificado (`0609e05`):
  `src/lib/supabase/servico.ts` (único uso de `service_role` em produção,
  `import 'server-only'`, build falha se um Client Component importar —
  provado), envio via `after()` com `web-push`, texto sem valor monetário,
  inscrição morta (404/410) apagada, autor nunca recebe a própria
  notificação (nem em navegador compartilhado com o parceiro — corrigido
  no review). `pagarFatura`/`registrarAcerto` como Server Actions
  substituem as chamadas diretas de `pay_invoice`/`settle_up` do navegador
  (fecha o risco R-13). Chaves VAPID configuradas na Vercel pelo Heitor.
  Front (Antigravity, `925e96d`) publicado e verificado: os dois diálogos
  trocados (mapeamento conferido linha a linha — `deMembroId`/`paraMembroId`
  e `cartaoId`/`contaOrigemId` sem inversão), `BotaoNotificacoes` com os 5
  estados (carregando/sem-suporte/não-inscrito/inscrito/pendente), desfaz a
  inscrição do navegador se a Server Action falhar. **Falta:** teste real
  com dois dispositivos (Heitor ativa, Carol lança algo, Heitor recebe).
- **Patrimônio e simulador de gasto fútil, completos** (`0b9496b`): gráfico
  de linha de patrimônio (12 meses, eixo único) e simulador de juros
  compostos em `/analises`, construídos pelo Dash seguindo as formas do
  `dataviz` (barra para orçamento nunca donut, linha para série temporal
  nunca dual-axis). Números reconciliados contra SQL bruto. Isolamento RLS
  provado entre famílias.
- Previsão de fixos/parcelas nos próximos 6 meses, em Análises.
- UX/UI de `/inicio`, `/lancar`, `/acerto`, `/carteira` renovada
  (Antigravity, `bee799a`): cores funcionais por tipo (entrada/saída/
  pendência/cartão), filtros em pílula por membro e tipo, fluxo visual do
  acerto com avatares, botão de lançar flutuante no mobile. Cards de
  Análises corrigidos (`9b3a0f1`): container `max-w-7xl`, grid responsivo
  sem espremer. Modo privacidade (ocultar valores) agora funciona de
  verdade em toda a árvore autenticada — estava desconectado do contexto.
- Feedback sonoro (WebAudio) com toggle em Ajustes; destravamento correto
  no primeiro gesto do usuário (corrigia bug "som nunca toca" real relatado
  pelo Heitor); som distinto para lançamento do parceiro via Realtime
  (`b1f099a`/`0685423`).
- Push: causa raiz de "notificação nunca chega" identificada — inscrição
  nunca era de fato salva no servidor (tabela `push_subscriptions` vazia).
  Logging estruturado adicionado (`4f386e5`) para diagnosticar envios
  futuros; urgência elevada para `high` (contorna Doze mode do Android).
  Heitor precisa desativar/reativar notificações em Ajustes > Perfil para
  recriar a inscrição.
- **Selecionar/editar/excluir lançamentos, front completo** (Antigravity,
  `9b6c0b6`..`61cfb3e`): checkbox de seleção múltipla (long-press no
  mobile, clique na linha no desktop, botão "Selecionar" explícito),
  barra flutuante de ações em lote, modais de editar (individual e em
  massa) e excluir (com opção "só este" ou "toda a série" para parcelas).
  Exclusão já usa a Server Action real (`excluirLancamento`).
  `atualizarLancamento`/`atualizarLancamentosEmMassa` publicadas
  (`9252760`) — autorização dupla (filtro explícito + RLS) provada com
  teste mutante em 4 variantes (vazamento real só com as duas camadas
  caindo juntas). Front conectado (Antigravity, `2996ffa`/`fa94fd1`/
  `4c3fd04`) — placeholder removido.
- **Bug CRÍTICO corrigido: excluir "apenas esta parcela" na 1ª parcela de
  uma série apagava a série inteira** (migration 00014, `1fba0b4`,
  achado A-1 do Sentinela R5). Causa: `ON DELETE CASCADE` na FK de
  `recurrence_parent_id` — removida; a coluna virou chave de série, não
  FK, provado por teste vermelho→verde que a exclusão por série nunca
  dependeu do CASCADE. Fechou de brinde o achado B-1 (vazamento de
  existência de id entre famílias via 23503).
- **Auditoria Sentinela R5** (`docs/auditoria/r5-sentinela.md`):
  veredicto REPROVADO → A-1 corrigido (acima); A-2 (link de recuperação
  de senha em produção apontando para domínio errado) é ação do Heitor
  no painel do Supabase (Site URL). Isolamento multi-tenant, Host Header
  Injection (correção anterior) e `service_role` em `servico.ts` todos
  CONFIRMADOS seguros. Achados MÉDIO/BAIXO registrados em `PENDENCIAS.md`.
- **Contraste de texto corrigido**: 34 falhas (cores semânticas
  receita/despesa/investimento/pendente/negativo/benefício no tema
  claro, abaixo de 4.5:1) → 0 falhas, confirmado com
  `docs/design/scripts/contraste.js`.
- **P-011 fechado**: paleta categórica de gráficos re-trabalhada,
  `validate_palette.js` passa em claro e escuro (antes reprovava 8/8
  slots no escuro, incluindo a série 1 que se assumia correta).
- Refinamento visual mobile (Antigravity, `e84843d`/`a8a2d00`/`61cfb3e`):
  swipe-to-delete nos cards, cards edge-to-edge, bordas coloridas
  semânticas por tipo de lançamento (receita/despesa/investimento/vale),
  badge "Vale" com destaque, hover com checkbox em desktop/tablet.
- Banco de teste limpo (duas vezes nesta sessão): 125 famílias/86 usuários
  de teste acumulados removidos primeiro; depois a auditoria Sentinela R4
  criou mais 4 famílias de teste para os testes hostis e CAIU por rate limit
  antes de limpar — removidas manualmente (`FAMILIA_REAL_JOIN_CODE=RVFAXV`).
  Só restam Heitor e Carol em `auth.users`, família real intacta em ambas as
  limpezas.

- **Orçamento por categoria, completo de ponta a ponta** (`7b57e75`
  back-end, `05e401a`/`65ca804` front): `definirOrcamento`/`excluirOrcamento`
  (upsert nativo sobre `UNIQUE(family_id, category_id, month)`, atômico),
  card `GerenciadorOrcamentos` em Ajustes > Categorias, filtro de só
  categorias ativas de despesa/investimento no seletor (decisão de produto).
  Verificado: `tsc`/`vitest`/`next build` limpos, fluxo completo
  criar→editar→excluir testado end-to-end.
- **Recuperação de senha in-place no login** (`1d6317c`): modal direto em
  `/login`, preenche e-mail automaticamente se já digitado, rota
  `/recuperar-senha` continua ativa para quem acessa direto,
  `form-nova-senha.tsx` trata token PKCE e hash fragment.
- **UX de velocidade percebida e filtros avançados** (`3eb189b`): barra de
  progresso de navegação no topo, count-up de números (respeita Modo
  Privacidade — não anima quando oculto, verificado no código), feedback
  tátil em botões, entrada suave de cards/listas, som de sucesso corrigido
  (não corta mais no redirect), som+toast quando o parceiro lança algo com
  Realtime aberto, filtros novos em `/inicio` (categoria, busca por
  texto/valor, ordenação por data/valor) — tudo client-side, sem nova
  consulta ao servidor.

### Pendente

- **A-2 do Sentinela R5 (AÇÃO DO HEITOR, bloqueante para recuperação de
  senha funcionar):** no painel do Supabase → Authentication → URL
  Configuration, "Site URL" aponta para um domínio de preview da Vercel
  em vez de `https://financascasais.vercel.app`. Corrigir e adicionar
  `https://financascasais.vercel.app/nova-senha` às Redirect URLs.
- **M-1/M-2/M-3 do Sentinela R5** (MÉDIO, ver `docs/auditoria/r5-sentinela.md`):
  `/nova-senha` aceita token de outra conta sem validar que é do próprio
  visitante (Fachada); acerto de contas pode ser forjado/desfeito
  gravando direto na tabela, trava só existe na Action (Estrutura);
  campos de seleção do diálogo de editar sem nome acessível (Fachada,
  WCAG 1.3.1/4.1.2).
- **Teste real do push com dois dispositivos, pós-correção de
  diagnóstico** — Heitor precisa desativar/reativar notificações em
  Ajustes > Perfil para recriar a inscrição que nunca foi salva; depois
  testar de novo.
- **P-007/P-008/P-009** (achados Sentinela R4, severidade MÉDIA/BAIXA): tipo
  de conta mutável fora da Action, índice único com brechas de normalização
  (P-008 já corrigido na migration 00011, confirmar status em
  `PENDENCIAS.md`), arredondamento de ponto flutuante em valores
  monetários. Ver `docs/auditoria/sentinela-r4.md`.
- **SMTP (Resend)** — e-mail de confirmação/recuperação ainda no provedor
  padrão do Supabase; decisão do Heitor, não técnica.
- **Rotação da chave de serviço e senha do banco** — apareceram em chat
  nesta sessão (não vazaram para o GitHub, mas foram ditas em texto); rotação
  ainda não feita.

### Deixado de fora deliberadamente

- Open Finance (Pluggy/Belvo) — campo `accounts.external_id` reservado no
  schema, pesquisa de fornecedor não iniciada (é trabalho do Radar, Fase C).
- Suporte a mais de 2 membros por família — `member_limit` já trava isso;
  decisão de produto do Heitor sobre quando abrir.

## 5. Última auto-análise

Rodadas 6-8 (push real, orçamento/patrimônio/simulador, recuperação de
senha, UX de velocidade) todas verificadas independentemente
(`tsc`/`vitest`/`next build` limpos em cada uma, código revisado linha a
linha nos pontos sensíveis — mapeamento de `pagarFatura`/`registrarAcerto`,
regra de Modo Privacidade em `ValorMonetario`). Investigação de performance
feita com medição real (não suposição) antes de aprovar qualquer mudança
de back-end: concluiu que o servidor já estava bem otimizado (queries em
paralelo, push via `after()`), então nenhum prompt de back-end foi
repassado — só UX, que é o que realmente resolve a percepção de lentidão.

**Achado de segurança real nesta leva:** a Rodada 7 do Antigravity
(recuperação de senha, `1d6317c`) introduziu Host Header Injection —
`urlDoSite()` passou a ler `Origin`/`Host`/`X-Forwarded-Host` da própria
requisição (controláveis pelo atacante) para montar o link de reset de
senha, antes do fallback seguro. Corrigido no mesmo ciclo (`0c39e05`):
volta a usar só `NEXT_PUBLIC_SITE_URL`/`VERCEL_URL` (esta última definida
pela Vercel, não pelo cliente) — nunca cabeçalho de requisição.
`NEXT_PUBLIC_SITE_URL` configurada na Vercel pelo Heitor, redeploy
confirmado.

Dois ciclos de limpeza de banco nesta sessão (famílias de teste e, a
pedido do Heitor, todos os lançamentos da família real para recomeçar do
zero), sem perda de dado estrutural nos dois (família, membros, contas,
categorias sempre confirmados intactos). Outros achados de segurança
corrigidos no mesmo ciclo em que apareceram: hardcoded fallback de
`join_code` em 3 scripts de teste, e hardcoded fallback do **e-mail real
da Carol** em `semear.mjs` — os dois removidos, env var agora obrigatória
sem fallback.

A auditoria Sentinela R4 rodou parcialmente (confirmou isolamento
multi-tenant, validação Zod e exclusão-em-uso como seguros; achou 3 itens
MÉDIO/BAIXO — P-007/P-008/P-009) mas **caiu por rate limit da sessão do
agente** antes de escrever o relatório e de limpar as 4 famílias de teste
que criou. O Maestro reconstruiu o relatório a partir das evidências em
disco (`docs/auditoria/sentinela-r4.md`) e limpou o lixo manualmente.
Durante essa limpeza, o Heitor relatou o bug do `v_settlement` (acerto de
contas não zera a dívida) usando o app de verdade — causa raiz já
identificada e delegada ao Estrutura; correção em andamento.
