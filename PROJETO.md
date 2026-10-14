# PROJETO.md — Finanças a Dois

> Retrato ÚNICO do estado atual. Sempre sobrescrito, nunca acumulado.
> Última atualização: 2026-10-14, por Maestro, após push real e metas/
> orçamento/patrimônio/simulador (back-end) + UX/UI renovada (front).
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
  (fecha o risco R-13). **Falta:** chaves VAPID configuradas na Vercel (ver
  pendências — eu já gerei o par, só falta você colar na Vercel) e o front
  do Antigravity trocar as chamadas diretas pelas novas actions + botão
  "Ativar notificações".
- **Metas por conta / Orçamento por categoria / Patrimônio / Simulador de
  gasto fútil** — back-end completo (`306cef7`, migration 00013):
  `v_orcamento_progresso` e `v_patrimonio_mensal` (ambas
  `security_invoker=true`, isolamento testado), `src/lib/simulador.ts`
  (juros compostos em centavos inteiros). **Falta:** telas (Dash +
  Fachada) — ainda não planejadas/delegadas.
- Previsão de fixos/parcelas nos próximos 6 meses, em Análises.
- UX/UI de `/inicio`, `/lancar`, `/acerto`, `/carteira` renovada
  (Antigravity, `bee799a`): cores funcionais por tipo (entrada/saída/
  pendência/cartão), filtros em pílula por membro e tipo, fluxo visual do
  acerto com avatares, botão de lançar flutuante no mobile. Cards de
  Análises corrigidos (`9b3a0f1`): container `max-w-7xl`, grid responsivo
  sem espremer. Modo privacidade (ocultar valores) agora funciona de
  verdade em toda a árvore autenticada — estava desconectado do contexto.
- Feedback sonoro (WebAudio) com toggle em Ajustes.
- Banco de teste limpo (duas vezes nesta sessão): 125 famílias/86 usuários
  de teste acumulados removidos primeiro; depois a auditoria Sentinela R4
  criou mais 4 famílias de teste para os testes hostis e CAIU por rate limit
  antes de limpar — removidas manualmente (`FAMILIA_REAL_JOIN_CODE=RVFAXV`).
  Só restam Heitor e Carol em `auth.users`, família real intacta em ambas as
  limpezas.

### Pendente

- **Chaves VAPID na Vercel (bloqueante para o push funcionar de ponta a
  ponta):** par gerado em 2026-10-14 (`npx web-push generate-vapid-keys`).
  Só o Heitor pode configurar — ver "Só você pode fazer" no `PLANO.md`
  seção relevante. Variáveis: `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (Production +
  Preview) e `VAPID_PRIVATE_KEY` (Production + Preview, **sem**
  `NEXT_PUBLIC_`, nunca no repositório).
- **Front do push** (Antigravity, briefing ainda não escrito): trocar as
  chamadas diretas de `pay_invoice`/`settle_up` em
  `dialogo-pagar-fatura.tsx`/`dialogo-acertar.tsx` pelas Server Actions
  `pagarFatura`/`registrarAcerto`; botão "Ativar notificações" (o
  `sw.js` já tem o handler).
- **Telas de metas/orçamento/patrimônio/simulador** (Dash + Fachada, ainda
  não planejadas) — back-end pronto (`v_orcamento_progresso`,
  `v_patrimonio_mensal`, `simulador.ts`).
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

Commit do backend da Rodada 3 (categorias/formas/contas) e front da Rodada 4
(Antigravity ligou tudo nas Server Actions reais) — ambos verificados
independentemente (`tsc`/`vitest`/`next build` limpos). Dois ciclos de
limpeza de banco nesta sessão, sem perda de dado real nos dois (família e os
2 membros reais confirmados intactos antes e depois de cada um). Dois
achados de segurança corrigidos no mesmo ciclo em que apareceram: hardcoded
fallback de `join_code` em 3 scripts de teste, e hardcoded fallback do
**e-mail real da Carol** em `semear.mjs` — os dois removidos, env var agora
obrigatória sem fallback.

A auditoria Sentinela R4 rodou parcialmente (confirmou isolamento
multi-tenant, validação Zod e exclusão-em-uso como seguros; achou 3 itens
MÉDIO/BAIXO — P-007/P-008/P-009) mas **caiu por rate limit da sessão do
agente** antes de escrever o relatório e de limpar as 4 famílias de teste
que criou. O Maestro reconstruiu o relatório a partir das evidências em
disco (`docs/auditoria/sentinela-r4.md`) e limpou o lixo manualmente.
Durante essa limpeza, o Heitor relatou o bug do `v_settlement` (acerto de
contas não zera a dívida) usando o app de verdade — causa raiz já
identificada e delegada ao Estrutura; correção em andamento.
