# Plano Estrutura — Onda 2: orçamento/metas, patrimônio, simulador

> FASE: PLANO (2026-10-14). Governado por `PLANO.md` seção 8 (8.1, 8.2, 8.3).
> Executado na mesma sessão, por pedido do Maestro. Desvios ficam no relatório.

## 0. Estado lido antes de planejar (saída real, não memória)

```
$ npx supabase migration list --db-url ...        (2026-10-14, antes de começar)
local 00001..00011 = remote 00001..00011          (nada pendente; nenhuma 00012 remota)

$ ls app/supabase/migrations/
00001_initial_schema.sql ... 00011_grupos_categoria_e_nome_normalizado.sql   (maior número: 00011)

Banco hospedado: server_version 17.11 | current_user postgres | rolbypassrls true | TimeZone UTC
mes corrente em America/Sao_Paulo: 2026-10
views existentes: as 4 com security_invoker=true
has_table_privilege('anon','public.v_monthly_summary','SELECT') = true   (ver risco R6)

Snapshot global ANTES:
familias 1 | usuarios 2 | lancamentos 34 | contas 3 | orcamentos 0 | metas 0
orcamentos com mes fora de ^2[0-9]{3}-(0[1-9]|1[0-2])$: 0
hash família real: transactions 337b60dc5bf42dd7458d60ca8df44827 | accounts e268215d4d639250af310cf8861f0677
                   category_budgets d41d8cd9... (vazio) | account_goals d41d8cd9... (vazio)

Família real, metadado (sem valores): lançamentos com date 2026-08..2027-03; pagos com
paid_date 2026-08..2026-10; contas criadas em 2026-10; 0 pagos com paid_date no futuro;
soma(current_balance) de TODAS as contas = soma das ativas não-cartão (a da /carteira): true
```

Triggers nas tabelas tocadas pelos fixtures: só `trg_transactions_touch` e
`trg_family_members_congela_estrutura` — nenhum valida tipo de categoria x tipo de lançamento.

## 1. Bloco 1 — o shape de `account_goals` e `category_budgets` atende?

Lido em `00001_initial_schema.sql` (linhas 269-292) e as policies em `00006` (linhas 326-368).

| Tabela | Colunas | Atende? |
|---|---|---|
| `account_goals` | `id, family_id, account_id, amount numeric(14,2) > 0, created_at`; `UNIQUE (family_id, account_id)`; FK composta para `accounts` | **Sim**, para "meta de saldo por conta": uma meta por conta, valor-alvo. Progresso = `account_goals.amount` x `v_account_balances.current_balance` (join por `account_id`). Sem coluna nova. |
| `category_budgets` | `id, family_id, category_id, amount numeric(14,2) > 0, month text ^\d{4}-\d{2}$, created_at`; `UNIQUE (family_id, category_id, month)`; FK composta para `categories` | **Sim** para "orçamento mensal por categoria", com UM defeito real: o CHECK de `month` aceita `2026-13`, `2026-00` e `0000-01`. A view converte `month` em data (`to_date`) para filtrar o mês de forma indexável; uma linha com mês impossível derrubaria a consulta da view **para a família inteira** (erro 22008), não só a linha. |

RLS das duas: 4 policies cada (SELECT/INSERT/UPDATE/DELETE), `TO authenticated`, `family_id =
(SELECT get_user_family_id_self())`, UPDATE com USING e WITH CHECK — já vigentes desde 00006.
**Nenhuma policy nova é necessária.**

**Decisão D1 — CHECK novo em `category_budgets.month`, sem coluna nova.**
`month ~ '^2[01][0-9]{2}-(0[1-9]|1[0-2])$'` (anos 2000-2199, mês 01-12;
`transactions.invoice_year` aceita 2000-2200 — o ano 2200 fica de fora aqui, diferença de 1 ano
sem efeito prático). Pré-checagem dentro da migration conta as linhas que
violariam e aborta com mensagem; hoje são 0 (snapshot acima, regex do intervalo 2000-2999 — o
executor recontará com a regex final). Fonte: `supabase-postgres-best-practices` →
`schema-constraints.md` (constraint idempotente via `DO` + `pg_constraint`). Tabela vazia: lock
exclusivo instantâneo, sem `NOT VALID`. A regex é executada contra casos válidos/inválidos antes de
entrar na migration (L-004).

**Decisão D2 — orçamento é POR MÊS, como o schema já é.** Não decido "orçamento recorrente"
(vale até mudar): isso é regra de negócio. O schema atual suporta as duas leituras sem migration
(recorrência pode virar "copiar o mês anterior" numa action, ou uma view nova). Pergunta 1 ao Maestro.

## 2. `v_orcamento_progresso` (Bloco 1)

`security_invoker = true` (fonte: `supabase:supabase`, Security checklist — "Views bypass RLS by
default. In Postgres 15 and above, use CREATE VIEW ... WITH (security_invoker = true)"; banco é
PG 17.11). Uma linha por linha de `category_budgets`.

| Coluna | Tipo | Definição |
|---|---|---|
| `budget_id` | uuid | `category_budgets.id` |
| `family_id` | uuid | |
| `category_id` | uuid | |
| `category_name`, `category_type`, `category_icon`, `category_color` | text | de `categories` (rótulo do gráfico sem segunda consulta) |
| `category_archived_at` | timestamptz | a UI decide se esconde orçamento de categoria arquivada |
| `month` | text `YYYY-MM` | mês do orçamento |
| `budget_amount` | numeric(14,2) | limite |
| `spent_amount` | numeric | soma de `transactions.amount` da mesma família e categoria, `type IN ('despesa','investimento')`, `date` dentro do mês, **pago ou não** |
| `remaining_amount` | numeric | `budget_amount - spent_amount` (negativo = estourou) |
| `used_ratio` | numeric | `round(spent_amount / budget_amount, 4)`; 1.0000 = 100%. `amount > 0` pelo CHECK de 00001: sem divisão por zero |
| `tx_count` | bigint | lançamentos que entraram na soma |

**D3 — sem filtro de "mês corrente" dentro da view.** O banco roda em UTC (medido): um
`CURRENT_DATE` na view viraria o mês às 21h de Brasília do último dia. O cliente filtra
`.eq('month', mes)` com o mês calculado por `hojeEmSaoPaulo()` (`src/lib/hoje.ts`), que já
resolve o fuso. Bônus: histórico de meses anteriores sai da mesma view.

**D4 — o que conta como gasto.** `despesa` e `investimento` (as mesmas "saídas" de
`v_settlement`/`v_account_balances`); `receita` e `transferencia` nunca (transferência move
dinheiro entre contas da casa). Lançamento **não pago conta** — compra no cartão fica `is_paid =
false` até a fatura ser paga, e excluí-la zeraria o orçamento de quem usa cartão. Data =
`transactions.date` (dia da compra), não `paid_date` nem mês da fatura, igual a `v_monthly_summary`.

**D5 — filtro de mês indexável.** `t.date >= inicio AND t.date < inicio + 1 mês` (com `inicio =
to_date(month || '-01', 'YYYY-MM-DD')`), não `to_char(t.date) = month`: usa o índice existente
`idx_transactions_family_date (family_id, date DESC)`. Fonte: `supabase-postgres-best-practices`
→ `query-composite-indexes.md`. **Nenhum índice novo em `transactions`** — ver D9.
Execução: `to_date` virou `make_date(ano, mês, 1)`; o uso do índice foi confirmado por `EXPLAIN`
como `authenticated` (`Index Scan using idx_transactions_family_date`, faixa de data no `Index Cond`).

## 3. `v_patrimonio_mensal` (Bloco 2)

`security_invoker = true` (mesma fonte). Uma linha por família por mês, sem buraco.

| Coluna | Tipo | Definição |
|---|---|---|
| `family_id` | uuid | |
| `month` | text `YYYY-MM` | mesmo formato de `v_monthly_summary` e `category_budgets` |
| `net_change` | numeric | variação do mês: receitas pagas − despesas/investimentos pagos, pelo mês de `paid_date` |
| `total_balance` | numeric | soma de `initial_balance` de todas as contas + soma acumulada de `net_change` até o mês |

**D6 — mesma definição de saldo de `v_account_balances`**, a única que existe: saldo = saldo
inicial + tudo o que foi pago. Consequências documentadas, não escolhidas por mim:
- **todas as contas**, inclusive cartão e arquivada (texto da seção 8.2: "todas as contas"; e
  excluir arquivada reescreveria o passado no dia em que a conta é arquivada);
- `transferencia` soma zero (sai de uma conta da casa, entra em outra da casa — FK composta
  garante a mesma família);
- lançamento do tipo `investimento` SAI do patrimônio, como já sai do saldo da conta em
  `v_account_balances`. Para ficar no patrimônio, o caminho é transferência para conta do tipo
  `investimento`. Pergunta 2 ao Maestro.
- `initial_balance` vale desde o início da série (não tem data própria). Criar uma conta nova
  com saldo inicial desloca a série inteira para cima. Pergunta 3 ao Maestro.
- Prova exigida no teste: o último ponto de `total_balance` = `sum(current_balance)` de
  `v_account_balances` da família. Na família real, hoje, esse total coincide com o "saldo total"
  da /carteira (medido: `true`).

**D7 — `paid_date`, não `date`.** Patrimônio é dinheiro que se moveu; compra no cartão baixa o
patrimônio no dia em que a fatura é paga (`pay_invoice` grava `paid_date` nas compras e a
transferência na mesma data). Usar `date` faria um pagamento de hoje reescrever um mês passado.

**D8 — série contínua, fuso explícito.** Início = menor entre o mês do primeiro `paid_date` e o
mês de criação da primeira conta (`created_at AT TIME ZONE 'America/Sao_Paulo'`). Fim = maior entre
o mês corrente em São Paulo (`now() AT TIME ZONE 'America/Sao_Paulo'`) e o mês do último
`paid_date`. `generate_series` sobre `timestamp` sem fuso (cast explícito): o resultado não depende
do `TimeZone` da sessão (PostgREST aceita `Prefer: timezone=`). Meses sem movimento repetem o saldo
(`net_change = 0`) — uma linha de gráfico não pode ter buraco que pareça queda.

## 4. Migration `00012_orcamento_progresso_e_patrimonio.sql`

Número provisório: **00012**. Rechecado com `ls` imediatamente antes de criar o arquivo e de novo
depois de `git pull --rebase origin main`, antes do `db push` (aviso de concorrência do Maestro).
Nome no padrão do projeto (`000NN_descricao.sql`, todas as 11 anteriores), não o timestamp do
`supabase migration new` — Desvio a registrar.

Blocos, em uma transação:
1. Pré-checagem de `month` inválido → `RAISE EXCEPTION` com contagem.
2. `ADD CONSTRAINT category_budgets_mes_valido CHECK (...)` idempotente (`DO` + `pg_constraint`).
3. `CREATE VIEW public.v_orcamento_progresso WITH (security_invoker = true)`.
4. `CREATE VIEW public.v_patrimonio_mensal WITH (security_invoker = true)`.
5. `REVOKE ALL ... FROM PUBLIC, anon, authenticated; GRANT SELECT ... TO authenticated` nas duas
   (padrão de 00010 para `v_settlement`; changelog Supabase 2026-04-28 "Tables not exposed to Data
   API automatically": exposição passa a exigir GRANT explícito — o GRANT explícito funciona nos
   dois regimes).
6. `COMMENT ON VIEW` em cada uma.
7. Rede de proteção (`DO`): as 2 views existem, `security_invoker=true` nas 2, anon sem SELECT,
   authenticated com SELECT, constraint presente — senão `RAISE EXCEPTION` e nada entra.

Sem `INSERT` de dado. Sem `ALTER` em migration aplicada. Não destrutiva (nenhum `DROP` de
dado/coluna, nenhum `ALTER TYPE`; a constraint nova é validada contra 0 linhas).

**D9 — nenhum DDL em `transactions`.** Um índice `(family_id, category_id, date)` ajudaria a view
de orçamento, mas o outro agente Estrutura (push) pode estar mexendo em `transactions` agora.
Com dezenas de lançamentos por família, o índice `(family_id, date DESC)` basta. Se o Dash medir
lentidão com `EXPLAIN`, vira migration nova.

## 5. `src/lib/simulador.ts` (Bloco 3)

Função pura, sem I/O, sem float em dinheiro: aritmética em `BigInt` com **um único
arredondamento no fim** (meio para cima). `tsconfig` target ES2017: sem literal `1n` e sem `**`
(o operador poderia ser transpilado para `Math.pow`, que lança erro com BigInt) — potência por
laço de multiplicação.

```ts
export interface EntradaSimulacao {
  valorCentavos: number   // inteiro, 0..99_999_999_999_999 (teto de numeric(14,2) em centavos)
  taxaMensalBps: number   // inteiro, pontos-base ao mês: 100 = 1% a.m.; 0..10_000
  meses: number           // inteiro, 0..600
}
export type ErroSimulacao =
  | 'valor_invalido' | 'taxa_invalida' | 'meses_invalido' | 'resultado_grande_demais'
export type ResultadoSimulacao =
  | { ok: true; valorFinalCentavos: number; rendimentoCentavos: number }
  | { ok: false; erro: ErroSimulacao }
export interface PontoProjecao { mes: number; valorCentavos: number }
export type ResultadoProjecao =
  | { ok: true; pontos: PontoProjecao[] }          // meses + 1 pontos, do mês 0 ao último
  | { ok: false; erro: ErroSimulacao }
export const LIMITES_SIMULACAO: { valorMaxCentavos; taxaMaxBps; mesesMax }

export function simularValorFuturo(entrada: EntradaSimulacao): ResultadoSimulacao
export function projetarValorFuturo(entrada: EntradaSimulacao): ResultadoProjecao
export function taxaPercentualParaBps(texto: string): number | null   // "1,07" -> 107
```

**D10 — entrada por objeto nomeado**, não 3 números posicionais: trocar `meses` por `taxa` em
chamada posicional compila e erra em silêncio.
**D11 — taxa em pontos-base inteiros** (1 bp = 0,01% a.m.), a granularidade com que banco anuncia
taxa ("1,07% a.m."). `taxaPercentualParaBps` converte o texto digitado SEM `parseFloat`, para não
repetir P-009 na taxa: aceita vírgula ou ponto, até 2 casas; 3+ casas, sinal, vazio ou lixo → `null`.
**D12 — valor negativo é RECUSADO** (`valor_invalido`), não convertido com `abs`: "o que eu não
gastei" negativo não tem sentido, e aceitar esconderia um bug de quem chama (ex.: passar o valor
de uma receita). Valor não inteiro (`12.5` centavos), `NaN`, `Infinity` → `valor_invalido`.
**D13 — erro como código, nunca `throw`.** A função roda dentro de render de componente; um
`throw` derrubaria a tela. A frase de erro é copy de UI (Fachada, `design:ux-copy`), não minha.
**D14 — arredondamento único no fim**, não mês a mês: o número bate com `VF = VP·(1+i)^n` que o
usuário confere na calculadora. Cada ponto da projeção é arredondado de forma independente.
**D15 — resultado acima de `Number.MAX_SAFE_INTEGER` → `resultado_grande_demais`** (ex.: teto de
valor a 100% a.m. por 600 meses), nunca número impreciso.

Casos de borda testados (valores esperados derivados por Python `fractions`, independente do código):
0 meses, taxa 0, valor 0, valor negativo, não-inteiros, NaN/Infinity, limites (teto aceito, teto+1
recusado), meio-centavo exato (half-up), caso em que arredondar mês a mês daria outro número, caso em
que `Math.round(v * Math.pow(1+i, n))` erra (prova de que float não serve), estouro.

## 6. Testes

**6.1 Isolamento RLS — `app/tests/integration/onda2-rls.sql` + runner `onda2-rls.mjs`**
(mesmo arranjo de `grupos-rls.*`): um único `DO` que cria 2 usuários/2 famílias/contas/categorias/
orçamentos/lançamentos de teste com uuid novo, troca o papel com `set_config('request.jwt.claims')`
+ `SET LOCAL ROLE authenticated`, e termina SEMPRE em `RAISE EXCEPTION` com o placar — rollback
garantido de tudo, inclusive se uma asserção quebrar no meio. Não toca na família real. Mesmo
assim: snapshot global + hash da família real antes e depois de cada execução (L-007).

Asserções (valores esperados calculados à mão a partir dos fixtures, escritos no `.sql`):
- orçamento: A lê os 2 próprios (controle positivo); A com filtro na família B → 0; A sem filtro →
  só linhas de A; A pelo `budget_id` de B → 0; gasto de março = pago + não pago + cartão pela data
  da compra; receita, transferência, outra categoria e meses vizinhos fora; abril só com o seu;
  `used_ratio` e `remaining_amount`; B lê o próprio e não lê A.
- patrimônio: A lê só as próprias linhas; filtro em B → 0; série sem buraco do 1º mês ao mês
  corrente SP; valores por mês (carrega saldo em mês sem movimento; cartão entra pelo `paid_date`;
  transferência soma zero; não pago fora); último ponto = `sum(current_balance)` de
  `v_account_balances`; B idem.
- `anon`: SELECT nas 2 views → 42501; `has_table_privilege` anon=false, authenticated=true.
- CHECK de `month`: `2025-13`, `2025-00`, `1999-12` → 23514; `2025-12` aceito.

**Vermelho obrigatório, duas vezes, antes da migration ser aplicada:**
1. contra o schema aplicado (views não existem) → o teste não chega ao placar (falta a feature);
2. com um rascunho VULNERÁVEL (as 2 views SEM `security_invoker`), via `--com-migration` em
   rollback → as asserções de isolamento FALHAM (o `postgres` dono da view tem `rolbypassrls`).
Depois: rascunho correto via `--com-migration` → verde; `db push`; verde contra o schema aplicado.
O runner confere depois de cada `--com-migration` que as views e a constraint NÃO ficaram no banco.

**6.2 Unit — `app/tests/unit/simulador.test.ts`** (vitest), escrito antes de `simulador.ts`;
vermelho por módulo inexistente e depois por comportamento.

## 7. Ordem de operações

1. Snapshot ANTES (feito, seção 0).
2. Regex do CHECK executada contra casos (L-004).
3. `simulador.test.ts` → vermelho → `simulador.ts` → verde.
4. `onda2-rls.sql` + runner → vermelho 1 (schema aplicado) → rascunho vulnerável → vermelho 2 →
   migration correta em rollback → verde → snapshot/hash.
5. `ls migrations/` de novo; `git pull --rebase origin main`; `ls` de novo; renumerar se preciso.
   Conflito de TABELA (outro agente alterando `category_budgets` ou criando as mesmas views) =
   parar e devolver ao Maestro.
6. `npx supabase db push --db-url` → `migration list` mostra 00012 em Remote.
7. `onda2-rls.mjs` contra o schema aplicado → verde; regressões `grupos-rls.mjs` (SQL, rollback).
8. `npx supabase gen types typescript --db-url` → `src/types/database.ts`; `npx tsc --noEmit`;
   `npx vitest run tests/unit`.
9. Snapshot DEPOIS + hash da família real (iguais ao ANTES, salvo lançamento feito pelo próprio
   casal no app durante a sessão — se o hash mudar, investigo por `updated_at`/`created_at`).
10. `security-review`, varredura de segredo, commit, `git pull --rebase`, push.

## 8. Riscos

- **R1 concorrência de migration** — tratado no passo 5. Se o outro agente publicar 00012 primeiro,
  a minha vira 00013 ANTES do `db push` (nunca depois).
- **R2 teste roda no banco de produção** — dentro de transação que sempre aborta; prova de rollback
  pelo runner + snapshot. Se um trigger novo do push existir em `transactions` (ex.: `pg_net`), ele
  dispara dentro da mesma transação e é desfeito junto.
- **R3 constraint nova** — tabela com 0 linhas medidas; pré-checagem aborta com mensagem se houver
  linha inválida no deploy.
- **R4 semântica de patrimônio** (D6) — espelha `v_account_balances`; perguntas 2 e 3.
- **R5 view com `now()`** — STABLE; o mês corrente é de São Paulo, não do servidor.
- **R6 achado lateral, fora do escopo** — `anon` tem SELECT em `v_account_balances`, `v_invoices` e
  `v_monthly_summary` (medido na execução: `has_table_privilege` = true nas 3, false em
  `v_settlement` — 00010 só revogou nesta). Não vaza dado: com `security_invoker`, anon esbarra no `REVOKE ALL` de
  `transactions`. Higiene; registro como pendência, não corrijo aqui.
- Nenhum `SECURITY DEFINER` novo; nenhum uso de `service_role` em código de app; nenhuma env var nova.

## 9. Fora do escopo (não faço)

Server Actions de CRUD de orçamento/meta (`src/actions/` não está nos arquivos permitidos); view de
progresso de meta por conta (não pedida — o join é direto, D1); aporte mensal recorrente no simulador;
soma de gasto fútil por período em view; correção de P-009 em `lancamento.ts`; R6.

## 10. Perguntas ao Maestro (não bloqueiam a execução; mudam só view, nunca dado)

1. Orçamento é por mês (precisa ser cadastrado a cada mês) ou recorrente (vale até mudar)? Hoje: por mês.
2. Lançamento do tipo `investimento` deve continuar SAINDO do patrimônio (como sai do saldo da conta hoje)?
3. Conta nova com saldo inicial deve deslocar o passado (hoje) ou só aparecer a partir do mês de criação?
4. Quem escreve `category_budgets`/`account_goals`: Server Action nova (minha, numa próxima rodada) ou
   escrita direta pelo PostgREST com RLS? PROJETO.md lista Server Action como porta única só para
   lançamento/categoria/conta/fatura.

## 11. Nota de execução (2026-10-14, mesma sessão)

- A migration saiu como **00013**, não 00012: na segunda checagem de `ls`, o agente Estrutura do push
  já tinha criado `00012_indice_push_familia.sql` (só índice em `push_subscriptions`, sem conflito de
  tabela) e a aplicado no remoto. `db push --dry-run` listou só a 00013 antes do push real.
- O scratchpad da sessão é compartilhado com o outro agente: os arquivos auxiliares desta execução
  ficaram em `scratchpad/estrutura-onda2/`.
- Além do teste SQL, entrou `tests/integration/onda2-views.int.test.ts` (caminho PostgREST com JWT
  de usuário e anon), escrito depois das views aplicadas — é complemento, não a prova de TDD (a prova
  é `onda2-rls.sql`: vermelho sem a view, vermelho com views sem `security_invoker`, vermelho sem o
  CHECK, verde).
