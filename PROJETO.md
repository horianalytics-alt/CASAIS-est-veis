# PROJETO.md — Finanças a Dois

> Retrato ÚNICO do estado atual. Sempre sobrescrito, nunca acumulado.
> Última atualização: 2026-10-13, por Maestro, após fecho parcial da Fase A.
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
- CRUD completo de categorias/formas de pagamento/contas — back-end publicado
  nesta rodada (`18c327e`); front do Antigravity ainda usa uma implementação
  local temporária que fala direto com o Supabase do navegador, troca
  pendente (ver `BRIEFING-FRONTEND-RODADA4.md`, já enviado).
- Realtime entre as duas sessões (Heitor↔Carol): lançamento novo aparece e
  lançamento excluído some, sem duplicar — provado 5/5.
- Rotação de código de convite, com limite de tentativas.
- PWA: manifest, ícones, service worker com handler de push e
  `notificationclick` — mas o ENVIO do push ainda não existe no back (ver
  pendências).
- Previsão de fixos/parcelas nos próximos 6 meses, em Análises.
- Feedback sonoro (WebAudio) com toggle em Ajustes.
- Banco de teste limpo: 125 famílias de teste e 66 usuários órfãos removidos
  nesta sessão (preservando só a família real, por `user_id`, não por
  e-mail). Só restam Heitor e Carol em `auth.users`.

### Pendente

- **Push real:** o módulo `src/lib/supabase/servico.ts` (único lugar
  autorizado a usar `service_role`) ainda não foi escrito. Depende disso:
  gerar e configurar as chaves VAPID na Vercel.
- **`pagarFatura`/`registrarAcerto`** como Server Actions (troca as chamadas
  diretas de `pay_invoice`/`settle_up` do navegador) — bloqueante para o push
  cobrir também essas duas ações.
- **Metas por conta / orçamento por categoria** — schema existe
  (`account_goals`, `category_budgets`), sem view de progresso nem tela.
- **Patrimônio e simulador de gasto fútil** — não iniciados (Fase B).
- **Sentinela (auditoria independente)** — ainda não rodou nesta leva de
  mudanças (categorias/formas/contas + limpeza do banco). Próximo passo.
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

Nesta sessão: commit do backend da Rodada 3 (categorias/formas/contas) após
verificação independente (`tsc` limpo, 208 testes + 23 de integração contra
banco real, `categorias-crud.mjs` 30/30 com controle negativo de RLS).
Limpeza de banco executada com confirmação do Heitor, sem perda de dado real
(família e os 2 membros reais confirmados intactos antes e depois). Um
achado de segurança automática (hardcoded fallback de `join_code` em 3
scripts de teste) corrigido no mesmo ciclo — scripts agora exigem a env var
e abortam sem apagar nada se faltar.

Sentinela e auditoria formal (A4 do plano) ainda não rodaram sobre este
conjunto de mudanças — é o próximo passo, depois que a Rodada 4 do
Antigravity (troca dos imports locais pelos reais) estiver publicada.
