# Briefing Rodada 23 — 5 novos KPIs em /analises

> Data: 2026-11-22. Autor: Maestro. Dono do produto: Heitor.
> `VERIFICADO` = confirmei no código nesta data. `A PROVAR` = não medi; confirme antes de agir.

---

## 0. Estado de partida

Commits da Rodada 22 estão em `origin/main`. TSC limpo. ≥723 testes passando, 190 skipped.

**Esta rodada adiciona 5 novos KPIs à página `/analises`, organizados em dois novos componentes:**

1. **Ticket médio** — gasto médio por despesa paga no mês (`expense_paid / tx_count_despesas_pagas`)
2. **Rosca de forma de pagamento** — % de despesas pagas por canal (Pix, Crédito, Débito, etc.)
3. **Quem pagou mais** — comparação entre membros da família de quem arcou com mais despesas no mês
4. **Fixos vs. variáveis** — proporção de despesas recorrentes (parcelas) vs. pontuais no mês
5. **% do orçamento total consumido** — quanto do orçamento total definido já foi gasto no mês

**Arquivos principais a criar/alterar (VERIFICADO estrutura):**
- `src/app/(app)/(principal)/analises/page.tsx` — adicionar queries + agregações + novos componentes
- `src/components/analises/kpis-pagamento.tsx` — novo componente (KPIs 1 + 2 + 3)
- `src/components/analises/kpis-orcamento-fixos.tsx` — novo componente (KPIs 4 + 5)

**Esta rodada NÃO tem migration.** Todos os dados necessários já existem no banco.

---

## 1. Regras de segurança (inegociáveis)

- **Só existe banco de PRODUÇÃO.** Nenhuma escrita via browser durante testes.
- `npx vitest run` SEMPRE SEM `.env.local`. Se `skipped` cair para 0, PARE.
- `family_id` sempre vem da sessão via Server Component. Nunca do cliente.
- Afirmação sobre o que o código faz só entra em relatório com saída de comando ou trecho colado. Sem isso, escreva "A PROVAR:" na frente.

---

## 2. O que fazer

### B-1 — Ampliar a query `transacoesDoMes` em `analises/page.tsx`

**Arquivo:** `src/app/(app)/(principal)/analises/page.tsx` linha 55-58.

Trocar:
```ts
supabase
  .from('transactions')
  .select('id, date, amount, type, description, account_id, category_id, is_paid, is_benefit, is_futile, futile_label')
  .gte('date', inicio)
  .lte('date', fim)
  .order('date', { ascending: false }),
```

Por:
```ts
supabase
  .from('transactions')
  .select('id, date, amount, type, description, account_id, category_id, is_paid, is_benefit, is_futile, futile_label, payment_method_id, paid_by_member_id, recurrence_months')
  .gte('date', inicio)
  .lte('date', fim)
  .order('date', { ascending: false }),
```

Três campos adicionados: `payment_method_id`, `paid_by_member_id`, `recurrence_months`.

### B-2 — Buscar `payment_methods` e `family_members` no `Promise.all`

**Arquivo:** `src/app/(app)/(principal)/analises/page.tsx` linha 47.

O `Promise.all` atual tem 7 promessas. Adicionar mais 2 ao final:

```ts
const [resumos, categorias, contas, transacoesDoMes, metas, orcamentos, patrimonio, formasDePagamento, membros] = await Promise.all([
  // ... queries existentes sem mudança ...
  supabase
    .from('payment_methods')
    .select('id, name')
    .is('archived_at', null),
  supabase
    .from('family_members')
    .select('id, display_name')
    .is('left_at', null),
])
```

A PROVAR: verificar se a coluna de saída de membro em `family_members` é `left_at` ou `archived_at`. Consultar `app/supabase/migrations/00001_initial_schema.sql` para confirmar o nome exato da coluna de deleção lógica de membros. Se não existir coluna de deleção lógica, buscar `family_members` sem filtro.

### B-3 — Mapas de nomes para formas de pagamento e membros

Após as queries, adicionar (na seção de variáveis derivadas da page):

```ts
const listaFormasPagamento = formasDePagamento.data ?? []
const mapaFormasPagamento = new Map(listaFormasPagamento.map((f) => [f.id, f.name]))

const listaMembros = membros.data ?? []
const mapaMembros = new Map(listaMembros.map((m) => [m.id, m.display_name]))
```

### B-4 — Calcular os 5 KPIs como variáveis derivadas antes do `return`

Adicionar após o bloco de `rotulosFuteis` (linha ~161) e antes do bloco de exportação CSV:

```ts
// KPI 1: Ticket médio (despesas pagas)
const despesasPagas = transacoes.filter((t) => t.type === 'despesa' && t.is_paid)
const totalDespesasPagas = despesasPagas.reduce((soma, t) => soma + Number(t.amount), 0)
const ticketMedio = despesasPagas.length > 0 ? totalDespesasPagas / despesasPagas.length : 0

// KPI 2: Rosca de forma de pagamento (despesas pagas)
const gastosPorFormaPagamento = new Map<string, number>()
for (const t of despesasPagas) {
  const nomeForma = t.payment_method_id
    ? mapaFormasPagamento.get(t.payment_method_id) ?? 'Sem forma'
    : 'Sem forma'
  gastosPorFormaPagamento.set(nomeForma, (gastosPorFormaPagamento.get(nomeForma) ?? 0) + Number(t.amount))
}
const itensFormaPagamento = Array.from(gastosPorFormaPagamento.entries())
  .map(([nome, valor]) => ({ nome, valor }))
  .sort((a, b) => b.valor - a.valor)

// KPI 3: Quem pagou mais (despesas pagas)
const gastosPorMembro = new Map<string, number>()
for (const t of despesasPagas) {
  const nomeMembro = mapaMembros.get(t.paid_by_member_id) ?? 'Membro'
  gastosPorMembro.set(nomeMembro, (gastosPorMembro.get(nomeMembro) ?? 0) + Number(t.amount))
}
const itensPorMembro = Array.from(gastosPorMembro.entries())
  .map(([nome, valor]) => ({ nome, valor }))
  .sort((a, b) => b.valor - a.valor)

// KPI 4: Fixos vs. variáveis (despesas do mês)
const despesasDoMes = transacoes.filter((t) => t.type === 'despesa')
const totalDespesas = despesasDoMes.reduce((soma, t) => soma + Number(t.amount), 0)
const totalFixos = despesasDoMes
  .filter((t) => t.recurrence_months !== null && t.recurrence_months !== undefined && t.recurrence_months > 0)
  .reduce((soma, t) => soma + Number(t.amount), 0)
const totalVariaveis = totalDespesas - totalFixos
const percentualFixos = totalDespesas > 0 ? (totalFixos / totalDespesas) * 100 : 0

// KPI 5: % do orçamento total consumido
const listaOrcamentos = orcamentos.data ?? []
const orcamentoTotalDefinido = listaOrcamentos.reduce((soma, o) => soma + Number(o.budget_amount), 0)
const orcamentoTotalGasto = listaOrcamentos.reduce((soma, o) => soma + Number(o.spent_amount), 0)
const percentualOrcamentoConsumido = orcamentoTotalDefinido > 0
  ? (orcamentoTotalGasto / orcamentoTotalDefinido) * 100
  : 0
```

### F-1 — Criar componente `KpisPagamento`

**Arquivo:** `src/components/analises/kpis-pagamento.tsx` (CRIAR)

Contém KPIs 1, 2 e 3 num único `Card` responsivo. Interface de props:

```tsx
interface KpisPagamentoProps {
  ticketMedio: number
  itensFormaPagamento: Array<{ nome: string; valor: number }>
  itensPorMembro: Array<{ nome: string; valor: number }>
  totalDespesasPagas: number
  mesRotulo: string
}
```

**Layout sugerido:**

- **Seção 1 — Ticket médio:** stat simples com `<ValorMonetario />`, subtitle "por despesa paga". Se `ticketMedio === 0`, exibir estado vazio "Nenhuma despesa paga neste mês".
- **Seção 2 — Forma de pagamento:** mini-barras horizontais (sem recharts — SVG inline ou div com `width: X%`). Cada item: nome da forma + barra proporcional + valor `<ValorMonetario />`. Se `itensFormaPagamento.length === 0`, exibir estado vazio.
- **Seção 3 — Quem pagou mais:** idem com barras horizontais, nomes dos membros. Se apenas 1 membro, exibir "Apenas um membro registrado este mês".

**Regras visuais:**
- `useOcultarValores()` via `<ValorMonetario />` em todos os valores monetários.
- Barras: use `bg-primary` para o membro/forma com maior valor, `bg-muted-foreground/30` para os demais.
- Dark mode: tokens existentes; não hard-code cores.
- Sem paginação — máximo de 10 itens em cada lista (no slice da page antes de passar a prop).

### F-2 — Criar componente `KpisOrcamentoFixos`

**Arquivo:** `src/components/analises/kpis-orcamento-fixos.tsx` (CRIAR)

Contém KPIs 4 e 5. Interface de props:

```tsx
interface KpisOrcamentoFixosProps {
  totalFixos: number
  totalVariaveis: number
  percentualFixos: number
  orcamentoTotalDefinido: number
  orcamentoTotalGasto: number
  percentualOrcamentoConsumido: number
  mesRotulo: string
}
```

**Layout sugerido:**

- **KPI 4 — Fixos vs. variáveis:** barra de progresso bipartida (fixos + variáveis em cores distintas) com legenda embaixo. Se `totalFixos + totalVariaveis === 0`, estado vazio.
  - Cor fixos: `bg-chart-1` (token existente).
  - Cor variáveis: `bg-chart-2` (token existente).
  - Texto: "X% fixos · Y% variáveis" + valores absolutos em `<ValorMonetario />`.
- **KPI 5 — % do orçamento:** barra de progresso simples, `width: percentualOrcamentoConsumido%` com teto em 100% visualmente (overflow pode ultrapassar; mostrar texto "NNN% do orçamento" sem truncar o número). Se `orcamentoTotalDefinido === 0`, exibir "Nenhum orçamento definido para este mês" com link para `/ajustes/categorias`.

**Regras visuais:** mesmas do F-1.

### F-3 — Registrar os novos componentes na page

**Arquivo:** `src/app/(app)/(principal)/analises/page.tsx`

Adicionar imports dos dois novos componentes no topo do arquivo:
```tsx
import { KpisPagamento } from '@/components/analises/kpis-pagamento'
import { KpisOrcamentoFixos } from '@/components/analises/kpis-orcamento-fixos'
```

Inserir os dois blocos no JSX, **entre** o `MapaDeCalorDias` e o fechamento do `</main>` — ou seja, no final da página (depois de todos os gráficos existentes), cada um dentro de `<ScrollReveal replayOnScroll>`:

```tsx
{/* KPIs de pagamento: ticket médio, forma de pagamento, quem pagou mais */}
<ScrollReveal replayOnScroll>
  <KpisPagamento
    ticketMedio={ticketMedio}
    itensFormaPagamento={itensFormaPagamento.slice(0, 10)}
    itensPorMembro={itensPorMembro.slice(0, 10)}
    totalDespesasPagas={totalDespesasPagas}
    mesRotulo={rotuloDoMes(mes)}
  />
</ScrollReveal>

{/* KPIs de orçamento: fixos vs. variáveis, % do orçamento total */}
<ScrollReveal replayOnScroll>
  <KpisOrcamentoFixos
    totalFixos={totalFixos}
    totalVariaveis={totalVariaveis}
    percentualFixos={percentualFixos}
    orcamentoTotalDefinido={orcamentoTotalDefinido}
    orcamentoTotalGasto={orcamentoTotalGasto}
    percentualOrcamentoConsumido={percentualOrcamentoConsumido}
    mesRotulo={rotuloDoMes(mes)}
  />
</ScrollReveal>
```

---

## 3. O que NÃO fazer

- Não altere migrations.
- Não altere os 11 componentes de análise existentes — só adicionar os 2 novos.
- Não use Recharts para as barras horizontais dos KPIs 2 e 3 — barras simples de `div` com `width: X%` são suficientes, mais leves e sem risco de erro de hidratação.
- Não busque dados de `v_monthly_summary` para o ticket médio — calcule direto das `transacoesDoMes` já carregadas (mais granular e preciso para o mês filtrado).
- Não adicione rota nova.
- Não instale dependências.
- Não altere `botao-exportar-csv.tsx` — a exportação fica como está.

---

## 4. Verificação esperada

- `npx tsc --noEmit` limpo (0 erros). Dois componentes novos + mudanças na page — provável ter erros de tipo se os campos novos em `transacoesDoMes` não estiverem no tipo gerado.
  - A PROVAR: verificar se `src/types/database.ts` já inclui `payment_method_id`, `paid_by_member_id`, `recurrence_months` no tipo `transactions.Row`. Se sim, o TypeScript inferirá corretamente do select. Se não, o `select('...')` mais amplo não gerará erro de tipo no Supabase client, mas ao usar `t.payment_method_id` o tipo será `any` ou precisará de cast — anote isso como pendência.
- `npx vitest run` SEM `.env.local` — ≥190 skipped, ≥723 passando. Se `skipped` = 0, PARE. Esta rodada não adiciona testes unitários novos (componentes puramente visuais), mas os existentes não devem quebrar.
- Dev server: `cd app && npm run dev` (porta 3000).
- Screenshots com caminho **absoluto** em 375px, 768px, 1440px + dark mode:
  - Página `/analises` rolada até os dois novos componentes, visíveis na tela.
  - Estado com dados: se a família de produção tiver despesas pagas com forma de pagamento preenchida, a rosca aparece. Se não, a seção de "Sem forma" deve aparecer para o total de despesas.
  - Console sem erros.
- Commit por grupo funcional; `git pull --rebase origin main` antes do push.

---

## 5. Regra de afirmação

Afirmação sobre o que o código existente faz só entra em relatório com saída do comando ou trecho colado. Sem isso, escreva "A PROVAR:" na frente.

---

## 6. Ao terminar

- Lista de arquivos criados/alterados com linhas.
- Confirmação dos campos `payment_method_id`, `paid_by_member_id`, `recurrence_months` disponíveis no tipo TypeScript (ou pendência se não estiverem).
- Confirmação do nome da coluna de saída de membro em `family_members` (confirmado ou corrigido).
- Saída de `npx tsc --noEmit` e `npx vitest run` coladas no relatório.
- Screenshots dos novos componentes nos 3 breakpoints + dark mode.
- Pendências abertas.
- Bloco `### Auto-Análise` obrigatório.

**Fontes verificadas pelo Maestro:**
- `src/app/(app)/(principal)/analises/page.tsx` linhas 47–76 (VERIFICADO — `Promise.all` com 7 promessas, `transacoesDoMes` sem `payment_method_id`/`paid_by_member_id`/`recurrence_months`)
- `app/supabase/migrations/00001_initial_schema.sql` (VERIFICADO — `payment_methods` tabela com `id, name, archived_at`; `transactions.payment_method_id`, `transactions.paid_by_member_id`, `transactions.recurrence_months`)
- `src/app/(app)/(principal)/analises/page.tsx` linhas 240–285 (VERIFICADO — JSX completo; inserir novos componentes após `MapaDeCalorDias`, antes de `</main>`)
- `v_monthly_summary` em `00004_views.sql` (VERIFICADO — `tx_count` e `expense_paid` existem, mas ticket médio calculado client-side é mais preciso para o mês filtrado)
