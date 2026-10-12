# Briefing de Front-end — Finanças a Dois v2

> **Para quem é este documento:** um agente de IA (Antigravity, Cursor, Lovable ou
> similar) que vai trabalhar na camada visual e de análise deste projeto, em
> paralelo com outro agente que cuida do back-end.
>
> Leia **tudo** antes de escrever a primeira linha. As seções 1 a 4 explicam o
> que o produto é e o que já existe. As seções 5 a 8 são as regras que você
> **não pode quebrar**. A seção 9 é a sua fila de trabalho.

---

## 0. Como começar (comandos exatos)

```bash
git clone <URL-DO-REPOSITORIO>
cd financas-a-dois/app
npm install
```

Crie `app/.env.local` (o arquivo é git-ignored; peça os valores ao dono do
projeto — eles **nunca** entram no repositório):

```
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>
SUPABASE_DB_PASSWORD=<senha do banco>
```

```bash
npm run dev          # http://localhost:3000
npx tsc --noEmit     # precisa sair exit 0
npx vitest run       # 167 testes passando hoje
```

**Primeira coisa a fazer:** rode `npx next build` uma vez. Antes disso,
`npx tsc --noEmit` acusa `Cannot find name 'LayoutProps'` — é tipo gerado pelo
Next, não erro de código.

**Para entrar no app** use a conta de teste que o dono do projeto fornecer. A
casa já existe, com ~32 lançamentos semeados em 3 meses.

Para repovoar o banco de teste:
```bash
set -a && . ./.env.local && set +a
ANON_KEY="$NEXT_PUBLIC_SUPABASE_ANON_KEY" SERVICE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
  node tests/integration/limpar-semente.mjs    # limpa
ANON_KEY="$NEXT_PUBLIC_SUPABASE_ANON_KEY" SERVICE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
  node tests/integration/semear.mjs            # semeia de novo
```
**Rodar `semear.mjs` duas vezes duplica os lançamentos.** Limpe antes.

---

## 1. O que o produto é

PWA de finanças para **casais**. Duas pessoas (Heitor e Carol) lançam as
despesas e receitas da casa no celular. O produto responde três perguntas que a
versão 1 respondia mal:

1. **"Quanto eu tenho de verdade em cada conta?"** — saldo real acumulado, com
   saldo inicial e todo o histórico pago. A v1 mostrava só o líquido do mês.
2. **"Quanto está na fatura do cartão e quando vence?"** — compras agrupadas por
   ciclo de fechamento.
3. **"Quem deve para quem no fim do mês?"** — acerto de contas do casal.

**A régua do produto, nas palavras do dono:** *"vai ajudar a visualizar,
gerenciar os gastos, entender nosso consumo e ajudar até mesmo investir."*

Ou seja: **o número tem de estar certo e legível.** Clareza vale mais que
elegância. O app não movimenta dinheiro — guarda o registro. E registro errado é
pior que registro nenhum: se o saldo mostra R$ 3.200 e o real é R$ 1.800, a
decisão de compra sai errada.

Mobile é o caso principal, não o secundário.

---

## 2. Stack — fixa, não reabra

| Item | Valor | Por quê |
|---|---|---|
| Framework | **Next.js 16.4**, App Router | — |
| React | 19.3 | — |
| CSS | **Tailwind CSS 4** | **NÃO existe `tailwind.config.ts`.** O tema é CSS-first via `@theme` em `globals.css`. Não crie esse arquivo. |
| Componentes | shadcn/ui, base `radix`, preset `nova` | `components.json` já existe |
| Banco | Supabase hospedado | **NÃO existe Supabase local.** Nunca use `--local` nem `db reset` |
| Formulários | React Hook Form + **Zod v3** | `form` do shadcn **não existe** neste registry; use RHF direto |
| Testes | Vitest | — |

### Armadilhas do Next.js 16 que vão te morder

1. **O middleware chama-se `proxy.ts`**, não `middleware.ts`. Fica na **raiz de
   `app/`** (não em `src/`, onde é silenciosamente ignorado). Exporta
   `proxy()` e `proxyConfig` — não `middleware()` e `config`.
2. **`params`, `searchParams`, `cookies()`, `headers()` são assíncronos.**
   Tipe como `Promise<...>` e use `await`.
3. **Toda page que lê sessão precisa de `await connection()`** no topo, senão
   o prerender falha com `unstable value Date.now()` (o client do Supabase lê o
   relógio ao tratar o token).
4. **`useActionState` chama `(estadoAnterior, payload)`**, mas as Server Actions
   deste projeto recebem `(formData)` — um argumento. É preciso um adaptador:
   ```ts
   const [estado, enviar, pendente] = useActionState(
     async (_anterior: ResultadoAction<T> | null, formData: FormData) =>
       aAction(formData),
     null,
   )
   ```
5. **`cn()` do shadcn NÃO faz tailwind-merge** neste projeto. Classes
   conflitantes não se resolvem por ordem — `border-transparent` na base vence
   `border-input` da variante. Ao estilizar primitivo, **meça com
   `getComputedStyle`**, não confie na classe.

---

## 3. O que JÁ EXISTE — não reescreva

### Telas prontas
```
/login                      funciona, login provado
/onboarding                 criar casa / entrar por código
/inicio                     indicadores do mês, saldo das contas, lista paginada
/lancar                     receita e despesa simples
/                           redireciona para /inicio
```

### Camada de dados (não toque)
```
src/actions/auth.ts         entrar, cadastrar, sair, pedirRecuperacaoDeSenha,
                            definirNovaSenha
src/actions/familia.ts      criarFamilia, entrarNaFamilia, verPreviaDaFamilia
src/actions/lancamento.ts   salvarLancamento, excluirLancamento
src/actions/resultado.ts    ResultadoAction<T>, sucesso(), falha(),
                            falhaDeValidacao(), traduzErroDoBanco()
src/lib/supabase/client.ts  createClient() para Client Component
src/lib/supabase/server.ts  async createClient() para Server Component/Action
src/types/database.ts       tipos gerados do schema real — 581 linhas
proxy.ts                    sessão + proteção de rotas
```

### Utilitários testados (83 testes) — USE, não reimplemente
```
src/lib/format.ts     formatBRL(valor, ocultar?), parseBRLInput(texto),
                      todayISO(), isoToBR(iso), brToISO(br),
                      addMonthsISO(iso, meses), monthKeyFromISO(iso),
                      monthLabel(iso), isValidISODate(iso),
                      daysInMonthISO(iso), diffDaysISO(de, para)
src/lib/invoice.ts    getInvoicePeriod(dataISO, diaFechamento),
                      getInvoiceDueDate(ano, mes, diaVencimento),
                      invoicePeriodLabel(ano, mes)
src/lib/settlement.ts calcSettlement(membros, lancamentos, regra),
                      resolveTransfer(saldos)
src/lib/hoje.ts       hoje no fuso de São Paulo, limites do mês
```

### Componentes já feitos
```
src/components/financeiro/valor-monetario.tsx   ← C-1/C-2/C-3 vivem AQUI
src/components/financeiro/valor-saldo.tsx
src/components/financeiro/badge-tipo.tsx
src/components/providers/ocultar-valores-provider.tsx
src/components/ui/campo-erro.tsx                ← o `form` do shadcn não existe
src/components/ui/estado-vazio.tsx
src/components/navegacao/navegacao-inferior.tsx
src/components/transacoes/item-transacao.tsx, paginacao-lancamentos.tsx,
                          form-lancamento.tsx
src/components/inicio/resumo-do-mes.tsx, saldo-das-contas.tsx
src/components/familia/form-criar-casa.tsx, form-entrar-casa.tsx
```

---

## 4. Design tokens — você CONSOME, não cria

**Fonte única:** `src/app/globals.css` (340 linhas) e
`docs/design/handoff.md` (506 linhas, com 180 pares de contraste medidos).

**Leia o handoff antes de escolher qualquer cor.** Não invente token, não use
hex solto, não use a escala padrão do Tailwind para cor.

### Duas dimensões independentes
```
modo    -> classe .dark no <html>
paleta  -> atributo data-paleta no <html>: cedro | ardosia | terra | ameixa
cascata -> .dark[data-paleta=X] > [data-paleta=X] > .dark > :root
```

A paleta sobrescreve **apenas** `--primary`, `--primary-foreground`, `--ring`,
`--accent`. A semântica financeira e o chassi **nunca** mudam com a paleta.

### Tokens semânticos (fixos em todas as paletas)
```
--receita  --despesa  --investimento  --transferencia
--pendente --negativo --beneficio
```

### Tipografia e espaçamento
O `@theme` mapeia cor, raio, sombra e easing — **não mapeia font-size nem
spacing**. Para esses, use a sintaxe de token:
```
text-(length:--texto-titulo)     gap-[var(--esp-4)]
```
Não escreva `text-[20px]` nem `p-4` arbitrário.

Fontes: **Instrument Sans** (UI, variável `--fonte-ui`) e **IBM Plex Mono**
(valores, `--fonte-mono`). Classes utilitárias prontas: `.valor`,
`.num-tabular`, `.texto-micro`.

**Armadilha:** `.valor` força `text-align: right`. É "dinheiro em coluna". Para
número que não é dinheiro alinhado (ex.: código de convite num input), use
`font-mono num-tabular`.

### Paleta de gráficos
`src/styles/chart-palette.ts` — 8 séries, validadas nos dois modos, com
separação ΔE mínima de 29,2 (claro) e 27,7 (escuro). **Use essa paleta nos
gráficos.** Não escolha cor de série à mão.

---

## 5. As TRÊS REGRAS que não podem ser violadas

Nasceram de números medidos, não de gosto. Se um componente quebrar uma delas,
**o componente está errado, não a regra.**

### C-1 — `--primary` nunca codifica valor financeiro

`--primary` serve só a: botão de ação principal, estado ativo de navegação,
link, anel de foco. Valor, badge de tipo e seta de direção usam **exclusivamente**
os tokens semânticos.

**Por quê, com número:** com 4 paletas livres e 7 semânticas fixas, alguma
paleta sempre cai no matiz de alguma semântica (Terra escuro `#F09070` vs
despesa `#FF8A7A`: razão 1.03:1). Não se resolve mexendo em hex; resolve-se
separando os usos.

**Gate verificável:** `grep -rn "primary" src/components/financeiro/` → **zero**.

### C-2 — Todo valor monetário exibe sinal `+` ou `−` explícito

Antes do `R$`, **sem exceção**.

**Por quê:** em protanopia (daltonismo mais comum), receita e despesa têm ΔE
12.6 (claro) e 11.6 (escuro) — as duas cores colapsam. O sinal sobrevive a
qualquer daltonismo e a impressão em preto e branco.

**Armadilha medida:** `formatBRL` devolve `-R$ 1.234,56` com **hífen** (`-`),
que **não** é o sinal `−` (U+2212) da regra. Use `Math.abs()` e componha o sinal
você mesmo. Deixar o `toLocaleString` decidir viola C-2 silenciosamente.

Investimento e transferência não levam sinal (não mudam patrimônio) — o reforço
deles é ícone + palavra do tipo.

### C-3 — Saldo negativo usa parênteses contábeis + ícone

`(R$ 1.234,56)` com ícone de alerta, além da cor.

**Por quê:** despesa vs saldo negativo têm ΔE 13.0 (claro) e 14.1 (escuro) já em
visão normal. A cor não distingue "esta linha é despesa" de "esta conta está no
vermelho".

### Teste de aceite (o auditor vai rodar)

Aplique `filter: grayscale(1)` na página. **Sem cor nenhuma**, receita, despesa,
pago, pendente e saldo negativo têm de continuar identificáveis. Se algum ficar
ambíguo, reprova.

Já passa hoje: veja `docs/auditoria/evidencias-fachada/prova-C1C2C3-grayscale.png`.

### A-1 — Alvo de toque ≥ 44×44px (WCAG 2.5.5)

**Medido:** nenhuma variante do `Button` do shadcn chega a 44px (`default` é
`h-8` = 32px). Use `size="toque"` ou `size="icone-toque"`.

**Armadilha:** `min-h-[44px]` é **ignorado em elemento inline**. Um link de
texto precisa de `inline-block` + padding vertical. Verifique com
`getBoundingClientRect`, não lendo a classe — um link que "parecia certo" media
66×16px.

### C-4 — Borda de controle nunca usa `--border`

`--border` é decorativa (1.23:1). Controle de formulário usa `--border-input`.

---

## 6. Regras do banco que a UI precisa respeitar

Há CHECK constraint no banco para cada uma. Violar dá erro de constraint em vez
de mensagem amigável.

| Regra | Detalhe |
|---|---|
| `amount > 0` **sempre** | **O sinal vem do TIPO, não do valor digitado** |
| `is_paid: true` | EXIGE `paid_date` |
| `is_paid: false` | EXIGE `paid_date: null` |
| `transferencia` | EXIGE `to_account_id` ≠ `account_id`; PROÍBE `owner_member_id`/`owner_share` |
| outros tipos | PROÍBEM `to_account_id` |
| `owner_share` | só com `owner_member_id` presente |
| `futile_label` | só com `is_futile: true` |
| `created_by_member_id` | resolvido no SERVIDOR via `auth.uid()` — **não envie do client** |
| cartão (`type: 'cartao'`) | EXIGE `closing_day` E `due_day`; não-cartão proíbe os dois |
| `family_members` | o membro só altera `display_name`, `monthly_income`, `avatar_url` **da própria linha**. `family_id`/`user_id`/`joined_at` são congelados por trigger (erro `23514`) |

### Datas e dinheiro
- **Datas:** string `YYYY-MM-DD` pura. **Nunca** `new Date()` para cálculo,
  nunca conversão de timezone. Use os helpers de `src/lib/format.ts`.
- **Dinheiro:** `numeric(14,2)` no banco. Para o acerto, centavos **inteiros**
  no TypeScript — float acumula erro.

### Regra do ciclo da fatura (já implementada e testada)
Compra **no dia** do fechamento pertence ao ciclo **SEGUINTE**.
Provado: fechamento dia 25 → compra dia 24 cai em outubro, compra dia 25 cai em
novembro.

---

## 7. Contrato de dados

### Server Actions (`src/actions/`)

Todas retornam a mesma forma:
```ts
type ResultadoAction<T = void> =
  | { ok: true; dados: T }
  | { ok: false; erro: string; camposComErro?: Record<string, string[]> }
```
`erro` já vem **em português, pronto para exibir**. Nunca carrega mensagem crua
do Postgres. **Não duplique essas mensagens no seu copy** — exiba como vem.
`camposComErro` sai do `.flatten().fieldErrors` do Zod v3.

**Três convenções de chamada diferentes — não presuma:**

| Actions | Assinatura | Como consumir |
|---|---|---|
| `entrar`, `cadastrar`, `pedirRecuperacaoDeSenha`, `definirNovaSenha`, `criarFamilia`, `entrarNaFamilia` | `(formData: FormData)` | `useActionState` **com adaptador de aridade** |
| `salvarLancamento` | `(input: EntradaDeLancamento \| EntradaDeLancamento[])` — **objeto tipado, NÃO FormData** | RHF controlado + `startTransition`, guardando o resultado em `useState` |
| `sair` | retorna `Promise<never>` (faz `redirect` por dentro) | **não** envolva em `try/catch` |

### RPCs do banco (via `supabase.rpc(...)`)
```
create_family(p_family_name, p_split_rule, p_member_name, p_monthly_income)
  -> TABLE(family_id uuid, member_id uuid, join_code text)
join_family(p_join_code, p_member_name, p_monthly_income)
  -> TABLE(family_id uuid, member_id uuid)
family_preview(p_join_code)
  -> TABLE(name, member_count, member_limit, has_room)
save_transactions(p_items jsonb)   -> SETOF transactions
delete_transactions(p_id uuid, p_scope text DEFAULT 'single') -> int
pay_invoice(p_card_account_id, p_from_account_id, p_invoice_year,
            p_invoice_month, p_date) -> uuid
settle_up(p_from_member_id, p_to_member_id, p_amount, p_date) -> uuid
get_user_family_id_self()  -> uuid | null
get_user_member_id_self()  -> uuid | null
```

### Views para leitura (SELECT direto; RLS já aplicado)
```
v_account_balances   account_id, family_id, name, type, owner_member_id,
                     initial_balance, closing_day, due_day, sort_order,
                     archived_at, current_balance, pending_outflow, pending_inflow
v_invoices           family_id, account_id, account_name, closing_day, due_day,
                     invoice_year, invoice_month, total_amount, open_amount,
                     tx_count, is_paid, due_date
v_settlement         family_id, member_id, display_name, share, total_paid,
                     total_owed, balance
v_monthly_summary    family_id, month('YYYY-MM'), income_total, income_paid,
                     expense_total, expense_paid, investment_total,
                     investment_paid, payable, receivable, tx_count
```

Todas com `security_invoker = true` — o RLS da tabela base se aplica como o
usuário que consulta.

### Erros em português que as RPCs levantam (trate na UI)
```
"Você precisa estar logado para entrar em uma família"
"Você já faz parte de uma família"
"Código de convite não encontrado"
"Esta família já está completa"
código 23514: "Não é permitido mudar a família de um membro"
código 23514: "Não é permitido mudar a data de entrada de um membro"
```

---

## 8. Fronteiras — o que você NÃO pode tocar

Há outro agente trabalhando no back-end em paralelo. Para não haver conflito:

### PROIBIDO para você
```
app/supabase/migrations/   schema, RLS, funções SQL — NUNCA edite migration
                           já aplicada; correção é migration NOVA
app/src/actions/           Server Actions
app/src/lib/supabase/      clients
app/src/types/database.ts  tipos gerados
app/proxy.ts               middleware de sessão
app/src/lib/format.ts      utilitários com 83 testes
app/src/lib/invoice.ts
app/src/lib/settlement.ts
```

Se precisar de um dado que não existe (coluna faltante, índice, view nova),
**pare e reporte** — isso vira migration nova do back-end, não ALTER seu.

### SEU
```
app/src/components/        componentes
app/src/app/               rotas e layouts (exceto globals.css)
app/src/features/          copy e helpers de UI
```

### Com cuidado
```
app/src/app/globals.css    tokens — mexa só se for evoluir o sistema de design,
app/src/styles/            e documente em docs/design/handoff.md
```

---

## 9. A FILA DE TRABALHO — em ordem de prioridade

### 9.1 Carteira (`/carteira`) — PRIORIDADE MÁXIMA

É uma das três funcionalidades **novas** que justificam a v2.

- **Contas em estilo cartão de crédito** (pedido explícito do dono): cada conta
  como um cartão visual, com nome, tipo, saldo atual e saldo previsto.
- Dados de `v_account_balances`: `current_balance` já inclui saldo inicial +
  histórico pago (é o bug da v1 corrigido). `pending_outflow` e `pending_inflow`
  são o previsto.
- **Saldo negativo obedece C-3**: parênteses contábeis + ícone.
- **Fatura do cartão**: de `v_invoices`, agrupada por ciclo. Mostre
  `total_amount`, `open_amount`, `due_date`, quantas compras.
- **Pagar fatura**: chama `pay_invoice(cartao, conta_origem, ano, mes, data?)`.
  A função calcula o total em aberto sozinha e levanta erro se for zero.
- Arquivar/desarquivar conta (`archived_at`).

### 9.2 Acerto de contas (`/acerto`)

A segunda funcionalidade nova. É a pergunta "quem deve para quem?".

- Dados de `v_settlement`: por membro, `total_paid`, `total_owed`, `balance`.
- Os saldos dos dois **se anulam** — se não anularem, há bug.
- Mostre **quem paga a quem e quanto**: use `resolveTransfer(saldos)` de
  `src/lib/settlement.ts` (já testado, 26 testes).
- **Registrar o acerto**: `settle_up(de_membro, para_membro, valor, data?)`.
  Cria uma transferência, que é **excluída** do próprio cálculo do acerto —
  senão o acerto entraria na conta do acerto e a dívida nunca zeraria.
- Explique a regra de divisão em uso (igual ou proporcional à renda).

### 9.3 Ajustes (`/ajustes` e subpáginas)

Hoje **não existe**, e por isso o dono não consegue ver quem está na casa nem o
código de convite.

- `/ajustes/familia` — membros, regra de divisão, **o código de convite visível
  sempre** (hoje ele só aparecia uma vez, na criação, e sumia)
- `/ajustes/perfil` — nome, renda (só a própria linha!)
- `/ajustes/contas` — criar/editar conta, inclusive cartão com
  `closing_day`/`due_day`
- `/ajustes/categorias` e `/ajustes/formas-pagamento`
- **Seletor de paleta e de modo** — os 4 temas existem no CSS e ninguém os liga.
  A especificação está em `docs/design/handoff.md` seção 6, e
  `src/styles/tema.ts` já tem o helper. Precisa de script anti-flash +
  `suppressHydrationWarning` (a v1 pintava via `useEffect` e dava flash).
- **Toggle de ocultar valores** — o provider existe
  (`ocultar-valores-provider.tsx`) e nada o liga. `formatBRL` já respeita.

### 9.4 Completar `/lancar`

- **Parcelas**: campo de número de parcelas. O banco gera a série inteira
  in-SQL (`recurrence_months` no item do `save_transactions`) — **não gere
  parcela no cliente**.
- **Lote**: vários lançamentos de uma vez (a action já aceita array).
- **Transferência** entre contas: exige `to_account_id` diferente de
  `account_id`, e proíbe rateio.
- **Rótulo de fatura ao vivo**: ao escolher cartão + data, mostre **em qual
  fatura a compra vai cair**, antes de salvar. Use `getInvoicePeriod` de
  `src/lib/invoice.ts`. Isso evita a surpresa do ciclo virando o mês.

### 9.5 `/cadastro`

Hoje dá 404 e o link existe no `/login`.

**Atenção:** a confirmação de e-mail do Supabase está **LIGADA**. `cadastrar()`
retorna `{ precisaConfirmarEmail: boolean }` e **não cria sessão**. A tela tem de
mostrar "confira seu e-mail", não navegar para o onboarding.

### 9.6 PWA

- `src/app/manifest.webmanifest/route.ts` — valores em
  `docs/design/handoff.md` seção 4.2, com os pares `any` e `maskable`
  **separados**
- Service worker (`public/sw.js`). **Acrescente `/sw.js` à exclusão do
  `proxyConfig.matcher`** — hoje ele é interceptado.
- Ícones já existem em `public/icons/`

### 9.7 Onda 2 — Análises (é onde o v1 parecia mais rico)

**Carregue a skill `dataviz` antes de escrever código de gráfico**, se o seu
ambiente a tiver. Use `src/styles/chart-palette.ts` para cor de série.

- **Rosca por categoria** — para onde o dinheiro vai
- **Barras mensais** — evolução de receita vs despesa
- **Pareto de gastos** — os 20% de categorias que são 80% do gasto
- **Mapa de calor** — dias de maior gasto
- **Previsão de fixos** — o que se repete todo mês
- **Patrimônio** — evolução do saldo somado
- **Eficiência de Benefício** — a coluna `is_benefit` existe em `transactions`
- **Simulador de gasto fútil** — `is_futile` e `futile_label` existem
- **Metas por conta** — a tabela `account_goals` já existe
- **Exportação CSV**

**Regra de view:** se precisar de view de agregação nova, ela exige
`security_invoker = true`. Mas **view é do back-end** — reporte a necessidade,
não crie.

### 9.8 Tempo real

Supabase Realtime já está configurado (migration `00005`). As tabelas
`transactions`, `accounts` e `family_members` estão na publicação com
`REPLICA IDENTITY FULL`. O tópico carrega o `family_id`.

Ao implementar: cuide para **não duplicar** a linha que o próprio usuário acabou
de inserir.

---

## 10. Dívida conhecida — não é bug novo

Estes itens já foram identificados e **não foram verificados no navegador**:

- Estado vazio de `/inicio` (a casa semeada nunca está vazia) — é a primeira
  impressão de quem acabou de criar a casa
- Paginação com 2+ páginas (o maior mês tem 16 linhas; a página mostra 20)
- `loading.tsx` e `error.tsx` compilam mas não foram forçados
- `/inicio` e `/lancar` em 768px e 1440px no **modo escuro**
- Contraste numérico dos pares novos criados na última rodada

E uma pendência de produto, **bloqueante para abrir o app a famílias maiores**:
o código de convite **não expira e não tem limite de tentativas**. Hoje o limite
de 2 membros protege; com famílias maiores, não protegerá. Veja `PENDENCIAS.md`.

---

## 11. Como entregar — o padrão deste projeto

Toda entrega de front-end exige, com caminho de arquivo:

1. **Screenshots em 375px, 768px e 1440px, mais um em modo escuro**
2. **Console sem erro** (`browser_console_messages` ou equivalente)
3. `npx tsc --noEmit` → exit 0
4. `npx vitest run` → sem regressão (167 testes hoje)
5. O gate C-1: `grep -rn "primary" src/components/financeiro/` → zero
6. O teste `grayscale(1)` continuando a passar

**Não marque como verificado o que você não observou.** Se não deu para testar,
escreva `NÃO VERIFICADO` e o motivo. Este projeto trata afirmação sem evidência
como defeito de processo.

**Commite à medida** — um commit por tela que funcione.

---

## 12. Documentos de referência no repositório

| Arquivo | O que tem |
|---|---|
| `PLANO.md` | escopo, não-escopo, decisões de plataforma com fonte, modelo de isolamento de dados por tabela |
| `PENDENCIAS.md` | o que ficou fora e por quê; decisões pendentes do dono |
| `RETOMADA.md` | estado atual, armadilhas já descobertas |
| `docs/design/handoff.md` | **o handoff de design — 506 linhas, 180 contrastes medidos.** Leia antes de tocar em cor |
| `docs/design/plano-tokens.md` | o raciocínio por trás dos tokens |
| `docs/planos/fachada-onda1-telas.md` | o plano das telas, 590+ linhas |
| `docs/superpowers/specs/*-design.md` | a especificação original do produto |
| `docs/auditoria/evidencias-fachada/` | screenshots e provas |

---

## 13. Resumo em uma tela

**O que você está construindo:** a camada visual de um app de finanças para
casal, onde o número tem de estar certo e legível antes de ser bonito.

**O que não pode quebrar:** C-1 (primary não pinta dinheiro), C-2 (todo valor
com sinal), C-3 (saldo negativo com parênteses), A-1 (44px de alvo de toque).

**O que já está pronto:** banco, segurança, autenticação, tokens de design,
login, onboarding, início e lançar.

**O que falta, em ordem:** Carteira → Acerto → Ajustes → parcelas/lote/
transferência → cadastro → PWA → análises.

**A régua:** *visualizar, entender o consumo, decidir.* Se uma decisão de design
ajuda nisso, está certa. Se só embeleza, pode esperar.
