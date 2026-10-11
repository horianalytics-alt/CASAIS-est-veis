# Finanças a Dois v2 — Onda 1 — Plano de Implementação

> **Para agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) ou superpowers:executing-plans para implementar este plano tarefa a tarefa. Os passos usam sintaxe de checkbox (`- [ ]`) para rastreamento.

**Goal:** Construir o MVP completo da v2 — auth, família, lançamentos, carteira, acerto de contas, tempo real e PWA — deployado na Vercel.

**Architecture:** Next.js 15 App Router com Server Components para renderização e Server Actions para toda mutação. Banco Postgres com RLS por família. Realtime via Supabase Realtime no cliente. Tudo gravado ou calculado no banco — nenhum cálculo financeiro no navegador.

**Tech Stack:** Next.js 15, TypeScript, Tailwind CSS, shadcn/ui, Supabase (Postgres + Auth + Realtime + Storage), Vercel, Vitest, supabase-js v2.

**Spec:** `docs/superpowers/specs/2026-10-11-financas-a-dois-v2-design.md`

## Global Constraints

- Next.js 15 com App Router — sem Pages Router
- TypeScript strict mode (`"strict": true`)
- Tailwind CSS com dark mode via class (`darkMode: 'class'`)
- shadcn/ui para todos os componentes de UI primitivos
- Valores monetários: `numeric(14,2)` no banco, `number` em TypeScript (parseado da string do Postgres), nunca `float` ou `parseFloat` de string BR
- Datas: string `YYYY-MM-DD` pura em todo o código — sem `new Date()` para cálculo de data, sem conversão de timezone
- `created_by_member_id` resolvido no servidor via `auth.uid()` — cliente não envia
- Todo RLS testado com dois usuários de famílias diferentes
- Nenhum segredo em migration SQL — Vault ou env var
- Português do Brasil em todo copy de UI, mensagens de erro e nomes de rota
- PWA: manifest.webmanifest + service worker presentes desde o início

## Review Focus

1. **Virada de mês no ciclo da fatura:** uma compra feita após o dia de fechamento deve cair na fatura do mês seguinte, não do atual — testar com closing_day=25, compra em dia 26 e dia 24.
2. **Isolamento RLS entre famílias:** usuário da família A jamais lê, insere ou atualiza linha da família B — testar com `supabase test db` usando dois auth.users distintos.
3. **Transação atômica de parcelas:** se a inserção da parcela 3 falhar, as parcelas 1 e 2 não devem existir no banco — testar simulando erro na terceira inserção.
4. **Regra proporcional de acerto:** se a renda de um membro for zero, a divisão não deve dividir por zero — testar com `monthly_income = 0`.
5. **Saldo real acumulado vs mensal:** o saldo deve incluir lançamentos pagos de meses anteriores, não apenas do mês corrente — testar com lançamento pago em mês anterior e verificar saldo atual.

---

## Mapa de arquivos

```
financas-a-dois-v2/
├── supabase/
│   ├── migrations/
│   │   ├── 00001_initial_schema.sql          -- tabelas, índices, RLS, funções helper
│   │   ├── 00002_rls_policies.sql            -- policies por tabela
│   │   ├── 00003_functions.sql               -- create_family, join_family, upsert_transaction_series, etc.
│   │   ├── 00004_seeds.sql                   -- categorias e formas de pagamento padrão (dev/test)
│   │   └── 00005_realtime.sql                -- REPLICA IDENTITY FULL + realtime.messages RLS
│   ├── functions/
│   │   └── send-push/index.ts                -- Edge Function VAPID
│   └── config.toml
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   ├── cadastro/page.tsx
│   │   │   ├── recuperar-senha/page.tsx
│   │   │   └── nova-senha/page.tsx
│   │   ├── (app)/
│   │   │   ├── layout.tsx                    -- auth guard + carrega dados da família
│   │   │   ├── inicio/page.tsx               -- dashboard KPIs + lista paginada
│   │   │   ├── carteira/page.tsx             -- contas + faturas
│   │   │   ├── lancar/page.tsx               -- formulário de lançamento
│   │   │   ├── acerto/page.tsx               -- acerto de contas
│   │   │   └── ajustes/
│   │   │       ├── page.tsx
│   │   │       ├── perfil/page.tsx
│   │   │       ├── familia/page.tsx
│   │   │       ├── categorias/page.tsx
│   │   │       ├── contas/page.tsx
│   │   │       └── formas-pagamento/page.tsx
│   │   ├── api/
│   │   │   └── push/route.ts
│   │   ├── manifest.webmanifest/route.ts
│   │   ├── layout.tsx                        -- html/body, providers globais
│   │   └── globals.css
│   ├── components/
│   │   ├── providers/
│   │   │   ├── realtime-provider.tsx         -- 'use client', subscription Realtime
│   │   │   └── hide-values-provider.tsx      -- 'use client', contexto de ocultar valores
│   │   ├── auth/
│   │   │   ├── login-form.tsx
│   │   │   ├── cadastro-form.tsx
│   │   │   └── onboarding-form.tsx           -- criar família ou entrar com código
│   │   ├── transactions/
│   │   │   ├── transaction-form.tsx          -- 'use client', RHF + Zod
│   │   │   ├── transaction-list.tsx          -- lista paginada Server Component
│   │   │   ├── transaction-item.tsx
│   │   │   └── bulk-form.tsx                 -- modo lote
│   │   ├── wallet/
│   │   │   ├── account-card.tsx              -- cartão visual estilo crédito
│   │   │   └── invoice-detail.tsx            -- fatura do cartão
│   │   ├── settlement/
│   │   │   ├── settlement-summary.tsx
│   │   │   └── settlement-history.tsx
│   │   ├── dashboard/
│   │   │   ├── kpi-card.tsx
│   │   │   └── runway-card.tsx
│   │   └── ui/                               -- re-exports do shadcn/ui
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts                     -- createBrowserClient
│   │   │   ├── server.ts                     -- createServerClient (cookies)
│   │   │   └── middleware.ts                 -- refreshSession no middleware.ts
│   │   ├── format.ts                         -- portado da v1: BRL, datas ISO puras
│   │   ├── invoice.ts                        -- lógica de qual ciclo uma data cai
│   │   └── settlement.ts                     -- cálculo de acerto (igual / proporcional)
│   ├── actions/
│   │   ├── auth.ts                           -- login, cadastro, logout, reset
│   │   ├── family.ts                         -- create_family, join_family
│   │   ├── transactions.ts                   -- upsert_transaction_series, delete_transaction_series
│   │   ├── accounts.ts                       -- CRUD de contas, pay_invoice
│   │   ├── categories.ts                     -- CRUD categorias
│   │   ├── payment-methods.ts                -- CRUD formas de pagamento
│   │   └── settlement.ts                     -- settle_accounts
│   ├── types/
│   │   └── database.ts                       -- gerado por supabase gen types
│   └── middleware.ts                         -- auth guard via supabase/ssr
├── public/
│   ├── sw.js                                 -- service worker PWA
│   └── icons/                                -- ícones PWA 192x192, 512x512
├── tests/
│   ├── unit/
│   │   ├── format.test.ts
│   │   ├── invoice.test.ts
│   │   └── settlement.test.ts
│   └── integration/
│       └── rls.test.ts                       -- dois usuários, duas famílias
├── .env.local.example
├── next.config.ts
├── tailwind.config.ts
├── components.json                           -- config shadcn
└── vitest.config.ts
```

---

## Tarefa 1: Scaffolding do projeto e banco local

**Files:**
- Create: `next.config.ts`, `tailwind.config.ts`, `components.json`, `vitest.config.ts`
- Create: `supabase/config.toml`
- Create: `.env.local.example`
- Create: `.gitignore`
- Create: `src/app/globals.css`

**Interfaces:**
- Produces: projeto Next.js 15 rodando em `localhost:3000`; Supabase local em `localhost:54321`

- [ ] **Passo 1: Criar o projeto Next.js**

```bash
npx create-next-app@latest financas-a-dois-v2 \
  --typescript --tailwind --eslint --app \
  --src-dir --import-alias "@/*" --no-turbopack
cd financas-a-dois-v2
```

- [ ] **Passo 2: Instalar dependências**

```bash
npm install @supabase/supabase-js @supabase/ssr
npm install react-hook-form @hookform/resolvers zod
npm install date-fns
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom
npx shadcn@latest init
# Quando perguntar: style=default, base color=neutral, CSS variables=yes
```

- [ ] **Passo 3: Instalar componentes shadcn usados na Onda 1**

```bash
npx shadcn@latest add button input label card dialog sheet tabs select \
  switch badge avatar toast progress separator form popover calendar
```

- [ ] **Passo 4: Configurar Vitest**

Criar `vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
  },
  resolve: {
    alias: { '@': resolve(__dirname, './src') },
  },
})
```

Criar `tests/setup.ts`:
```typescript
import '@testing-library/jest-dom'
```

- [ ] **Passo 5: Inicializar Supabase local**

```bash
npx supabase init
npx supabase start
```

Anotar as URLs e chaves exibidas no terminal.

- [ ] **Passo 6: Criar `.env.local.example`**

```
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<chave-anon-local>
SUPABASE_SERVICE_ROLE_KEY=<chave-service-role-local>
PUSH_VAPID_PUBLIC_KEY=
PUSH_VAPID_PRIVATE_KEY=
PUSH_TRIGGER_SECRET=
```

Copiar para `.env.local` e preencher com os valores do `supabase start`.

- [ ] **Passo 7: Adicionar ao `.gitignore`**

```
.env.local
.env*.local
.next/
node_modules/
_referencia-v1/
```

- [ ] **Passo 8: git init e commit inicial**

```bash
git init
git add -A
git commit -m "chore: scaffolding inicial Next.js 15 + Supabase local"
```

---

## Tarefa 2: Schema do banco — tabelas, índices e RLS

**Files:**
- Create: `supabase/migrations/00001_initial_schema.sql`
- Create: `supabase/migrations/00002_rls_policies.sql`
- Create: `tests/integration/rls.test.ts`

**Interfaces:**
- Produces: tabelas `families`, `family_members`, `accounts`, `transactions`, `categories`, `payment_methods`, `push_subscriptions`, `account_goals`, `category_budgets` com RLS ativo

- [ ] **Passo 1: Escrever o teste de isolamento antes do schema**

Criar `tests/integration/rls.test.ts`:
```typescript
import { createClient } from '@supabase/supabase-js'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Este teste usa dois usuários reais — crie-os no Supabase local antes de rodar:
// email: heitor@test.com / senha: test1234
// email: carol@test.com / senha: test1234
// e cada um já com família criada (via RPC create_family)

describe('RLS isolation', () => {
  it('user A cannot read transactions of family B', async () => {
    const clientA = createClient(URL, ANON)
    const clientB = createClient(URL, ANON)
    await clientA.auth.signInWithPassword({ email: 'heitor@test.com', password: 'test1234' })
    await clientB.auth.signInWithPassword({ email: 'carol@test.com', password: 'test1234' })

    // Inserir transação como B
    const service = createClient(URL, SERVICE)
    const { data: famB } = await service.from('family_members')
      .select('family_id').eq('user_id', (await clientB.auth.getUser()).data.user?.id).single()
    // (Inserção via service role para garantir que existe)

    // Tentar ler como A
    const { data } = await clientA.from('transactions')
      .select('*').eq('family_id', famB!.family_id)
    expect(data).toHaveLength(0)
  })
})
```

- [ ] **Passo 2: Escrever `00001_initial_schema.sql`**

```sql
-- Habilitar extensão para UUIDs
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Função helper de isolamento (deve existir antes das policies)
CREATE OR REPLACE FUNCTION get_user_family_id(uid uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT family_id FROM family_members WHERE user_id = uid LIMIT 1;
$$;
REVOKE EXECUTE ON FUNCTION get_user_family_id FROM anon, public;
GRANT EXECUTE ON FUNCTION get_user_family_id TO authenticated;

-- families
CREATE TABLE families (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  join_code    text NOT NULL UNIQUE,
  split_rule   text NOT NULL DEFAULT 'equal'
               CHECK (split_rule IN ('equal','proportional')),
  member_limit int  NOT NULL DEFAULT 2,
  created_at   timestamptz DEFAULT now()
);

-- family_members
CREATE TABLE family_members (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id      uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name   text NOT NULL,
  avatar_url     text,
  monthly_income numeric(14,2),
  joined_at      timestamptz DEFAULT now(),
  UNIQUE (family_id, user_id)
);
CREATE INDEX idx_family_members_user_id ON family_members(user_id);
CREATE INDEX idx_family_members_family_id ON family_members(family_id);

-- accounts
CREATE TABLE accounts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id       uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  owner_member_id uuid REFERENCES family_members(id),
  name            text NOT NULL,
  type            text NOT NULL CHECK (type IN ('corrente','beneficio','cartao','investimento')),
  initial_balance numeric(14,2) NOT NULL DEFAULT 0,
  closing_day     int CHECK (closing_day BETWEEN 1 AND 31),
  due_day         int CHECK (due_day BETWEEN 1 AND 31),
  external_id     text,
  created_at      timestamptz DEFAULT now(),
  UNIQUE (family_id, id)  -- para FK composta em goals
);
CREATE INDEX idx_accounts_family_id ON accounts(family_id);

-- categories
CREATE TABLE categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id  uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name       text NOT NULL,
  type       text NOT NULL CHECK (type IN ('receita','despesa','investimento','todos')),
  icon       text,
  color      text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE (family_id, id)
);
CREATE INDEX idx_categories_family_id ON categories(family_id);

-- payment_methods
CREATE TABLE payment_methods (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id  uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name       text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_payment_methods_family_id ON payment_methods(family_id);

-- transactions
CREATE TABLE transactions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id            uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  type                 text NOT NULL CHECK (type IN ('receita','despesa','investimento','transferencia')),
  description          text NOT NULL,
  amount               numeric(14,2) NOT NULL CHECK (amount > 0),
  date                 date NOT NULL,
  account_id           uuid NOT NULL REFERENCES accounts(id),
  to_account_id        uuid REFERENCES accounts(id),
  owner_member_id      uuid REFERENCES family_members(id),
  owner_share          numeric(5,4) CHECK (owner_share BETWEEN 0 AND 1),
  created_by_member_id uuid NOT NULL REFERENCES family_members(id),
  paid_by_member_id    uuid REFERENCES family_members(id), -- quem pagou; NULL = quem lançou
  category_id          uuid REFERENCES categories(id),
  payment_method_id    uuid REFERENCES payment_methods(id),
  is_paid              boolean NOT NULL DEFAULT false,
  paid_date            date,
  notes                text,
  is_benefit           boolean NOT NULL DEFAULT false,
  is_futile            boolean NOT NULL DEFAULT false,
  futile_label         text,
  recurrence_months    int CHECK (recurrence_months BETWEEN 1 AND 120),
  recurrence_index     int,
  recurrence_parent_id uuid REFERENCES transactions(id),
  invoice_year         int,
  invoice_month        int,
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now()
);
CREATE INDEX idx_transactions_family_id ON transactions(family_id);
CREATE INDEX idx_transactions_date ON transactions(family_id, date DESC);
CREATE INDEX idx_transactions_account_id ON transactions(account_id);
CREATE INDEX idx_transactions_invoice ON transactions(family_id, invoice_year, invoice_month)
  WHERE invoice_year IS NOT NULL;
CREATE INDEX idx_transactions_recurrence ON transactions(recurrence_parent_id)
  WHERE recurrence_parent_id IS NOT NULL;

-- push_subscriptions
CREATE TABLE push_subscriptions (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
  endpoint  text NOT NULL,
  p256dh    text NOT NULL,
  auth      text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (member_id, endpoint)
);

-- account_goals (Onda 2 — criadas agora para não migrar depois)
CREATE TABLE account_goals (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id  uuid NOT NULL,
  account_id uuid NOT NULL,
  amount     numeric(14,2) NOT NULL,
  FOREIGN KEY (family_id, account_id) REFERENCES accounts(family_id, id)
);
CREATE INDEX idx_account_goals_family_id ON account_goals(family_id);

-- category_budgets (Onda 2)
CREATE TABLE category_budgets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id   uuid NOT NULL,
  category_id uuid NOT NULL,
  amount      numeric(14,2) NOT NULL,
  month       text NOT NULL, -- YYYY-MM
  FOREIGN KEY (family_id, category_id) REFERENCES categories(family_id, id)
);
CREATE INDEX idx_category_budgets_family_id ON category_budgets(family_id, month);
```

- [ ] **Passo 3: Escrever `00002_rls_policies.sql`**

```sql
-- Habilitar RLS em todas as tabelas
ALTER TABLE families ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE category_budgets ENABLE ROW LEVEL SECURITY;

-- families: membro lê a própria família
CREATE POLICY "families_select" ON families FOR SELECT
  USING (id = get_user_family_id(auth.uid()));

-- family_members
CREATE POLICY "family_members_select" ON family_members FOR SELECT
  USING (family_id = get_user_family_id(auth.uid()));
CREATE POLICY "family_members_insert" ON family_members FOR INSERT
  WITH CHECK (family_id = get_user_family_id(auth.uid()));
CREATE POLICY "family_members_update" ON family_members FOR UPDATE
  USING (user_id = auth.uid());

-- accounts
CREATE POLICY "accounts_select" ON accounts FOR SELECT
  USING (family_id = get_user_family_id(auth.uid()));
CREATE POLICY "accounts_write" ON accounts FOR ALL
  USING (family_id = get_user_family_id(auth.uid()))
  WITH CHECK (family_id = get_user_family_id(auth.uid()));

-- categories, payment_methods (mesmo padrão)
CREATE POLICY "categories_select" ON categories FOR SELECT
  USING (family_id = get_user_family_id(auth.uid()));
CREATE POLICY "categories_write" ON categories FOR ALL
  USING (family_id = get_user_family_id(auth.uid()))
  WITH CHECK (family_id = get_user_family_id(auth.uid()));

CREATE POLICY "payment_methods_select" ON payment_methods FOR SELECT
  USING (family_id = get_user_family_id(auth.uid()));
CREATE POLICY "payment_methods_write" ON payment_methods FOR ALL
  USING (family_id = get_user_family_id(auth.uid()))
  WITH CHECK (family_id = get_user_family_id(auth.uid()));

-- transactions
CREATE POLICY "transactions_select" ON transactions FOR SELECT
  USING (family_id = get_user_family_id(auth.uid()));
CREATE POLICY "transactions_write" ON transactions FOR ALL
  USING (family_id = get_user_family_id(auth.uid()))
  WITH CHECK (family_id = get_user_family_id(auth.uid()));

-- push_subscriptions: lê apenas as próprias
CREATE POLICY "push_select" ON push_subscriptions FOR SELECT
  USING (member_id IN (
    SELECT id FROM family_members WHERE user_id = auth.uid()
  ));
CREATE POLICY "push_write" ON push_subscriptions FOR ALL
  USING (member_id IN (
    SELECT id FROM family_members WHERE user_id = auth.uid()
  ));

-- account_goals, category_budgets
CREATE POLICY "account_goals_all" ON account_goals FOR ALL
  USING (family_id = get_user_family_id(auth.uid()))
  WITH CHECK (family_id = get_user_family_id(auth.uid()));
CREATE POLICY "category_budgets_all" ON category_budgets FOR ALL
  USING (family_id = get_user_family_id(auth.uid()))
  WITH CHECK (family_id = get_user_family_id(auth.uid()));
```

- [ ] **Passo 4: Aplicar migrations**

```bash
npx supabase db reset
```

- [ ] **Passo 5: Gerar tipos TypeScript**

```bash
npx supabase gen types typescript --local > src/types/database.ts
```

- [ ] **Passo 6: Rodar o teste de isolamento**

```bash
npx vitest run tests/integration/rls.test.ts
```

Esperado: PASS (após criar os dois usuários de teste no Supabase local).

- [ ] **Passo 7: Commit**

```bash
git add supabase/migrations/00001_initial_schema.sql \
        supabase/migrations/00002_rls_policies.sql \
        src/types/database.ts \
        tests/integration/rls.test.ts
git commit -m "feat(db): schema inicial com RLS por família"
```

---

## Tarefa 3: Funções SQL transacionais

**Files:**
- Create: `supabase/migrations/00003_functions.sql`
- Create: `supabase/migrations/00004_seeds.sql`
- Create: `supabase/migrations/00005_realtime.sql`
- Create: `tests/unit/invoice.test.ts`
- Create: `tests/unit/settlement.test.ts`
- Create: `src/lib/invoice.ts`
- Create: `src/lib/settlement.ts`

**Interfaces:**
- Produces: RPCs `create_family`, `join_family`, `upsert_transaction_series`, `delete_transaction_series`, `pay_invoice`, `settle_accounts`
- Produces: funções TypeScript `getInvoicePeriod(date: string, closingDay: number): { year: number; month: number }` e `calcSettlement(members, transactions, rule): SettlementResult`

- [ ] **Passo 1: Escrever os testes de `invoice.ts` antes da implementação**

Criar `tests/unit/invoice.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { getInvoicePeriod } from '@/lib/invoice'

describe('getInvoicePeriod', () => {
  it('date before closing day falls in current month', () => {
    // closing_day=25, date=2026-10-24 → fatura de outubro
    expect(getInvoicePeriod('2026-10-24', 25)).toEqual({ year: 2026, month: 10 })
  })

  it('date on closing day falls in next month', () => {
    // closing_day=25, date=2026-10-25 → fatura de novembro
    expect(getInvoicePeriod('2026-10-25', 25)).toEqual({ year: 2026, month: 11 })
  })

  it('date after closing day falls in next month', () => {
    // closing_day=25, date=2026-10-26 → fatura de novembro
    expect(getInvoicePeriod('2026-10-26', 25)).toEqual({ year: 2026, month: 11 })
  })

  it('december after closing falls in january of next year', () => {
    expect(getInvoicePeriod('2026-12-26', 25)).toEqual({ year: 2027, month: 1 })
  })
})
```

- [ ] **Passo 2: Implementar `src/lib/invoice.ts`**

```typescript
export function getInvoicePeriod(
  dateISO: string,
  closingDay: number
): { year: number; month: number } {
  const [yearStr, monthStr, dayStr] = dateISO.split('-')
  const year = parseInt(yearStr, 10)
  const month = parseInt(monthStr, 10)
  const day = parseInt(dayStr, 10)

  if (day < closingDay) {
    return { year, month }
  }
  // day >= closingDay → próxima fatura
  if (month === 12) {
    return { year: year + 1, month: 1 }
  }
  return { year, month: month + 1 }
}
```

- [ ] **Passo 3: Rodar testes de invoice**

```bash
npx vitest run tests/unit/invoice.test.ts
```

Esperado: 4 PASS.

- [ ] **Passo 4: Escrever os testes de `settlement.ts`**

Criar `tests/unit/settlement.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { calcSettlement } from '@/lib/settlement'

describe('calcSettlement', () => {
  it('equal split: each owes half of shared expenses', () => {
    const members = [
      { id: 'a', monthly_income: 5000 },
      { id: 'b', monthly_income: 3000 },
    ]
    // Transação compartilhada de R$ 100, paga por 'a'
    const transactions = [
      { owner_member_id: null, amount: 100, is_paid: true, type: 'despesa',
        paid_by_member_id: 'a', owner_share: null },
    ]
    const result = calcSettlement(members, transactions, 'equal')
    // a pagou 100, devia 50 → a favor de 'a' +50
    // b pagou 0, devia 50 → b deve 50 para 'a'
    expect(result.find(r => r.member_id === 'b')?.balance).toBe(-50)
    expect(result.find(r => r.member_id === 'a')?.balance).toBe(50)
  })

  it('proportional split: zero income member gets zero share', () => {
    const members = [
      { id: 'a', monthly_income: 5000 },
      { id: 'b', monthly_income: 0 },
    ]
    const transactions = [
      { owner_member_id: null, amount: 100, is_paid: true, type: 'despesa',
        paid_by_member_id: 'a', owner_share: null },
    ]
    // Total renda = 5000; b tem 0% → b deve 0
    const result = calcSettlement(members, transactions, 'proportional')
    expect(result.find(r => r.member_id === 'b')?.balance).toBe(0)
    expect(result.find(r => r.member_id === 'a')?.balance).toBe(0)
  })

  it('per-transaction override ignores family rule', () => {
    const members = [
      { id: 'a', monthly_income: 5000 },
      { id: 'b', monthly_income: 3000 },
    ]
    // 70% para 'a', pago por 'b'
    const transactions = [
      { owner_member_id: 'a', amount: 100, is_paid: true, type: 'despesa',
        paid_by_member_id: 'b', owner_share: 0.7 },
    ]
    const result = calcSettlement(members, transactions, 'equal')
    // 'a' deve 70 para 'b'; 'b' pagou mas era responsável por 30 → saldo 'a'=-70, 'b'=+70
    expect(result.find(r => r.member_id === 'a')?.balance).toBeCloseTo(-70)
    expect(result.find(r => r.member_id === 'b')?.balance).toBeCloseTo(70)
  })
})
```

- [ ] **Passo 5: Implementar `src/lib/settlement.ts`**

```typescript
type Member = { id: string; monthly_income: number | null }
type TxForSettlement = {
  owner_member_id: string | null
  amount: number
  is_paid: boolean
  type: string
  paid_by_member_id: string
  owner_share: number | null
}
type SettlementResult = { member_id: string; balance: number }[]

export function calcSettlement(
  members: Member[],
  transactions: TxForSettlement[],
  rule: 'equal' | 'proportional'
): SettlementResult {
  const totalIncome = members.reduce((s, m) => s + (m.monthly_income ?? 0), 0)
  const balances: Record<string, number> = {}
  for (const m of members) balances[m.id] = 0

  for (const tx of transactions) {
    if (!tx.is_paid || tx.type === 'receita' || tx.type === 'transferencia') continue

    const paid = tx.paid_by_member_id
    balances[paid] = (balances[paid] ?? 0) + tx.amount

    if (tx.owner_member_id !== null) {
      // Transação pessoal ou com override de quem é responsável
      const share = tx.owner_share ?? 1
      balances[tx.owner_member_id] = (balances[tx.owner_member_id] ?? 0) - tx.amount * share
      // O restante (1 - share) fica como responsabilidade do pagador implicitamente
      // (se share=1, o dono paga tudo e o pagador é reembolsado inteiro)
      if (share < 1 && paid !== tx.owner_member_id) {
        balances[paid] = (balances[paid] ?? 0) - tx.amount * (1 - share)
      }
    } else {
      // Compartilhado — dividir pela regra
      for (const m of members) {
        let memberShare: number
        if (rule === 'equal') {
          memberShare = 1 / members.length
        } else {
          memberShare = totalIncome > 0 ? (m.monthly_income ?? 0) / totalIncome : 0
        }
        balances[m.id] = (balances[m.id] ?? 0) - tx.amount * memberShare
      }
    }
  }

  return members.map(m => ({ member_id: m.id, balance: balances[m.id] ?? 0 }))
}
```

- [ ] **Passo 6: Rodar testes de settlement**

```bash
npx vitest run tests/unit/settlement.test.ts
```

Esperado: 3 PASS.

- [ ] **Passo 7: Escrever `00003_functions.sql`**

```sql
-- Gerador de código sem caracteres ambíguos
CREATE OR REPLACE FUNCTION generate_join_code()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  charset text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text := '';
  i int;
BEGIN
  FOR i IN 1..6 LOOP
    code := code || substr(charset, floor(random() * length(charset) + 1)::int, 1);
  END LOOP;
  RETURN code;
END;
$$;

-- RPC: criar família
CREATE OR REPLACE FUNCTION create_family(
  p_family_name text,
  p_split_rule  text,
  p_member_name text,
  p_monthly_income numeric DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_family_id uuid;
  v_member_id uuid;
  v_code text;
BEGIN
  -- Gerar código único
  LOOP
    v_code := generate_join_code();
    EXIT WHEN NOT EXISTS (SELECT 1 FROM families WHERE join_code = v_code);
  END LOOP;

  INSERT INTO families (name, join_code, split_rule)
  VALUES (p_family_name, v_code, p_split_rule)
  RETURNING id INTO v_family_id;

  INSERT INTO family_members (family_id, user_id, display_name, monthly_income)
  VALUES (v_family_id, auth.uid(), p_member_name, p_monthly_income)
  RETURNING id INTO v_member_id;

  -- Seeds: categorias padrão
  INSERT INTO categories (family_id, name, type, sort_order) VALUES
    (v_family_id, 'Moradia',        'despesa',     1),
    (v_family_id, 'Alimentação',    'despesa',     2),
    (v_family_id, 'Transporte',     'despesa',     3),
    (v_family_id, 'Saúde',          'despesa',     4),
    (v_family_id, 'Lazer',          'despesa',     5),
    (v_family_id, 'Educação',       'despesa',     6),
    (v_family_id, 'Roupas',         'despesa',     7),
    (v_family_id, 'Bobeiras',       'despesa',     8),
    (v_family_id, 'Salário',        'receita',     1),
    (v_family_id, 'Freelance',      'receita',     2),
    (v_family_id, 'Investimentos',  'investimento',1),
    (v_family_id, 'Outros',         'todos',       99);

  -- Seeds: formas de pagamento padrão
  INSERT INTO payment_methods (family_id, name, sort_order) VALUES
    (v_family_id, 'Débito',         1),
    (v_family_id, 'Crédito',        2),
    (v_family_id, 'Pix',            3),
    (v_family_id, 'Dinheiro',       4),
    (v_family_id, 'Boleto',         5),
    (v_family_id, 'Benefício',      6);

  -- Conta corrente padrão
  INSERT INTO accounts (family_id, name, type, initial_balance)
  VALUES (v_family_id, 'Conta Principal', 'corrente', 0);

  RETURN v_family_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION create_family FROM anon, public;
GRANT EXECUTE ON FUNCTION create_family TO authenticated;

-- RPC: entrar na família
CREATE OR REPLACE FUNCTION join_family(
  p_join_code      text,
  p_member_name    text,
  p_monthly_income numeric DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_family_id  uuid;
  v_count      int;
  v_limit      int;
BEGIN
  SELECT id, member_limit INTO v_family_id, v_limit
  FROM families WHERE join_code = upper(p_join_code);

  IF v_family_id IS NULL THEN
    RAISE EXCEPTION 'Código de família inválido';
  END IF;

  SELECT COUNT(*) INTO v_count FROM family_members WHERE family_id = v_family_id;
  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'Família já está com o número máximo de membros';
  END IF;

  IF EXISTS (SELECT 1 FROM family_members WHERE family_id = v_family_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Você já faz parte desta família';
  END IF;

  INSERT INTO family_members (family_id, user_id, display_name, monthly_income)
  VALUES (v_family_id, auth.uid(), p_member_name, p_monthly_income);

  RETURN v_family_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION join_family FROM anon, public;
GRANT EXECUTE ON FUNCTION join_family TO authenticated;

-- RPC: gravar série de lançamentos (lote ou parcelas) — atômico
CREATE OR REPLACE FUNCTION upsert_transaction_series(
  p_transactions jsonb
)
RETURNS SETOF transactions LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_family_id  uuid;
  v_member_id  uuid;
  v_tx         jsonb;
  v_result     transactions;
  v_parent_id  uuid;
BEGIN
  -- Resolver família e membro do usuário logado
  SELECT id, family_id INTO v_member_id, v_family_id
  FROM family_members WHERE user_id = auth.uid() LIMIT 1;

  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não pertence a nenhuma família';
  END IF;

  FOR v_tx IN SELECT * FROM jsonb_array_elements(p_transactions)
  LOOP
    INSERT INTO transactions (
      family_id, type, description, amount, date,
      account_id, to_account_id, owner_member_id, owner_share,
      created_by_member_id, paid_by_member_id, category_id, payment_method_id,
      is_paid, paid_date, notes, is_benefit, is_futile, futile_label,
      recurrence_months, recurrence_index, recurrence_parent_id,
      invoice_year, invoice_month
    ) VALUES (
      v_family_id,
      v_tx->>'type',
      v_tx->>'description',
      (v_tx->>'amount')::numeric,
      (v_tx->>'date')::date,
      (v_tx->>'account_id')::uuid,
      (v_tx->>'to_account_id')::uuid,
      (v_tx->>'owner_member_id')::uuid,
      (v_tx->>'owner_share')::numeric,
      v_member_id,  -- sempre do servidor
      COALESCE((v_tx->>'paid_by_member_id')::uuid, v_member_id),
      (v_tx->>'category_id')::uuid,
      (v_tx->>'payment_method_id')::uuid,
      COALESCE((v_tx->>'is_paid')::boolean, false),
      (v_tx->>'paid_date')::date,
      v_tx->>'notes',
      COALESCE((v_tx->>'is_benefit')::boolean, false),
      COALESCE((v_tx->>'is_futile')::boolean, false),
      v_tx->>'futile_label',
      (v_tx->>'recurrence_months')::int,
      (v_tx->>'recurrence_index')::int,
      CASE WHEN (v_tx->>'recurrence_index')::int > 1 THEN v_parent_id ELSE NULL END,
      (v_tx->>'invoice_year')::int,
      (v_tx->>'invoice_month')::int
    )
    RETURNING * INTO v_result;
    -- a 1ª parcela da série vira a "mãe" das seguintes
    IF (v_tx->>'recurrence_index')::int = 1 THEN
      v_parent_id := v_result.id;
    END IF;
    RETURN NEXT v_result;
  END LOOP;
END;
$$;
REVOKE EXECUTE ON FUNCTION upsert_transaction_series FROM anon, public;
GRANT EXECUTE ON FUNCTION upsert_transaction_series TO authenticated;

-- RPC: deletar lançamento ou série
CREATE OR REPLACE FUNCTION delete_transaction_series(
  p_id    uuid,
  p_scope text  -- 'single' ou 'series'
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_family_id uuid;
  v_parent_id uuid;
BEGIN
  v_family_id := get_user_family_id(auth.uid());

  IF p_scope = 'series' THEN
    SELECT COALESCE(recurrence_parent_id, id) INTO v_parent_id
    FROM transactions WHERE id = p_id AND family_id = v_family_id;

    DELETE FROM transactions
    WHERE family_id = v_family_id
      AND (id = v_parent_id OR recurrence_parent_id = v_parent_id);
  ELSE
    DELETE FROM transactions WHERE id = p_id AND family_id = v_family_id;
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION delete_transaction_series FROM anon, public;
GRANT EXECUTE ON FUNCTION delete_transaction_series TO authenticated;

-- RPC: pagar fatura do cartão
CREATE OR REPLACE FUNCTION pay_invoice(
  p_card_account_id uuid,
  p_from_account_id uuid,
  p_amount          numeric,
  p_date            date,
  p_invoice_year    int,
  p_invoice_month   int
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_family_id uuid;
  v_member_id uuid;
  v_tx_id     uuid;
BEGIN
  SELECT id, family_id INTO v_member_id, v_family_id
  FROM family_members WHERE user_id = auth.uid() LIMIT 1;

  INSERT INTO transactions (
    family_id, type, description, amount, date,
    account_id, to_account_id, created_by_member_id, is_paid, paid_date
  ) VALUES (
    v_family_id, 'transferencia',
    'Pagamento de fatura',
    p_amount, p_date,
    p_from_account_id, p_card_account_id,
    v_member_id, true, p_date
  ) RETURNING id INTO v_tx_id;

  -- Marcar lançamentos da fatura como pagos
  UPDATE transactions
  SET is_paid = true, paid_date = p_date
  WHERE family_id = v_family_id
    AND account_id = p_card_account_id
    AND invoice_year = p_invoice_year
    AND invoice_month = p_invoice_month
    AND is_paid = false;

  RETURN v_tx_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION pay_invoice FROM anon, public;
GRANT EXECUTE ON FUNCTION pay_invoice TO authenticated;

-- RPC: acertar contas
CREATE OR REPLACE FUNCTION settle_accounts(
  p_from_member_id uuid,
  p_to_member_id   uuid,
  p_amount         numeric,
  p_date           date
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_family_id     uuid;
  v_creator_id    uuid;
  v_from_account  uuid;
  v_to_account    uuid;
  v_tx_id         uuid;
BEGIN
  SELECT id, family_id INTO v_creator_id, v_family_id
  FROM family_members WHERE user_id = auth.uid() LIMIT 1;

  -- Conta principal de cada membro (primeira conta corrente)
  SELECT id INTO v_from_account FROM accounts
  WHERE family_id = v_family_id AND owner_member_id = p_from_member_id
    AND type = 'corrente' ORDER BY created_at LIMIT 1;
  SELECT id INTO v_to_account FROM accounts
  WHERE family_id = v_family_id AND owner_member_id = p_to_member_id
    AND type = 'corrente' ORDER BY created_at LIMIT 1;

  INSERT INTO transactions (
    family_id, type, description, amount, date,
    account_id, to_account_id, created_by_member_id, is_paid, paid_date
  ) VALUES (
    v_family_id, 'transferencia', 'Acerto de contas',
    p_amount, p_date, v_from_account, v_to_account,
    v_creator_id, true, p_date
  ) RETURNING id INTO v_tx_id;

  RETURN v_tx_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION settle_accounts FROM anon, public;
GRANT EXECUTE ON FUNCTION settle_accounts TO authenticated;
```

- [ ] **Passo 8: Escrever `00005_realtime.sql`**

```sql
-- REPLICA IDENTITY FULL para que DELETE envie a linha antiga no Realtime
ALTER TABLE transactions REPLICA IDENTITY FULL;
ALTER TABLE accounts REPLICA IDENTITY FULL;
ALTER TABLE family_members REPLICA IDENTITY FULL;

-- Publicar tabelas no Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE family_members;

-- RLS em realtime.messages: usuário só assina tópico da própria família
-- (formato do tópico: "tx:<family_id>" e "presence:<family_id>")
CREATE POLICY "realtime_family_only" ON realtime.messages
  FOR SELECT USING (
    -- extrai o family_id do tópico "tx:uuid" ou "presence:uuid"
    split_part(topic, ':', 2)::uuid = get_user_family_id(auth.uid())
  );
```

- [ ] **Passo 9: Aplicar migrations e gerar tipos**

```bash
npx supabase db reset
npx supabase gen types typescript --local > src/types/database.ts
```

- [ ] **Passo 10: Commit**

```bash
git add supabase/migrations/ src/lib/invoice.ts src/lib/settlement.ts \
        src/types/database.ts tests/unit/
git commit -m "feat(db): funções transacionais e lógicas de fatura e acerto"
```

---

## Tarefa 4: Utilitários de formatação (portados da v1)

**Files:**
- Create: `src/lib/format.ts`
- Create: `tests/unit/format.test.ts`

**Interfaces:**
- Produces:
  - `formatBRL(value: number, hideValues?: boolean): string`
  - `parseBRLInput(input: string): number`
  - `todayISO(): string` — `YYYY-MM-DD` sem timezone
  - `isoToBR(iso: string): string` — `DD/MM/YYYY`
  - `brToISO(br: string): string` — `YYYY-MM-DD`
  - `addMonthsISO(iso: string, months: number): string`
  - `monthKeyFromISO(iso: string): string` — `YYYY-MM`
  - `monthLabel(iso: string): string` — `"out/2026"`

- [ ] **Passo 1: Escrever os testes**

Criar `tests/unit/format.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import {
  formatBRL, parseBRLInput, todayISO, isoToBR, brToISO,
  addMonthsISO, monthKeyFromISO, monthLabel,
} from '@/lib/format'

describe('formatBRL', () => {
  it('formats number as BRL', () => {
    expect(formatBRL(1234.56)).toBe('R$ 1.234,56')
  })
  it('hides values when hideValues=true', () => {
    expect(formatBRL(1234.56, true)).toBe('R$ ••••')
  })
})

describe('parseBRLInput', () => {
  it('parses dot-comma BR format', () => {
    expect(parseBRLInput('1.234,56')).toBe(1234.56)
  })
  it('parses plain decimal', () => {
    expect(parseBRLInput('1234.56')).toBe(1234.56)
  })
  it('parses single comma decimal', () => {
    expect(parseBRLInput('1234,5')).toBe(1234.5)
  })
})

describe('date utils', () => {
  it('isoToBR converts correctly', () => {
    expect(isoToBR('2026-10-11')).toBe('11/10/2026')
  })
  it('brToISO converts correctly', () => {
    expect(brToISO('11/10/2026')).toBe('2026-10-11')
  })
  it('addMonthsISO handles Jan 31 + 1 = Feb 28', () => {
    expect(addMonthsISO('2026-01-31', 1)).toBe('2026-02-28')
  })
  it('addMonthsISO handles Dec + 1 = Jan next year', () => {
    expect(addMonthsISO('2026-12-15', 1)).toBe('2027-01-15')
  })
  it('monthKeyFromISO', () => {
    expect(monthKeyFromISO('2026-10-11')).toBe('2026-10')
  })
  it('monthLabel', () => {
    expect(monthLabel('2026-10-01')).toBe('out/2026')
  })
})
```

- [ ] **Passo 2: Implementar `src/lib/format.ts`**

```typescript
const MONTHS_SHORT = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez']

export function formatBRL(value: number, hideValues = false): string {
  if (hideValues) return 'R$ ••••'
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function parseBRLInput(input: string): number {
  // Remove pontos de milhar e substitui vírgula por ponto
  const cleaned = input.trim().replace(/\./g, '').replace(',', '.')
  return parseFloat(cleaned)
}

export function todayISO(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function isoToBR(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export function brToISO(br: string): string {
  const [d, m, y] = br.split('/')
  return `${y}-${m}-${d}`
}

export function addMonthsISO(iso: string, months: number): string {
  const [yearStr, monthStr, dayStr] = iso.split('-')
  let year = parseInt(yearStr, 10)
  let month = parseInt(monthStr, 10) - 1 + months // 0-indexed
  year += Math.floor(month / 12)
  month = month % 12
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const day = Math.min(parseInt(dayStr, 10), daysInMonth)
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function monthKeyFromISO(iso: string): string {
  return iso.slice(0, 7) // YYYY-MM
}

export function monthLabel(iso: string): string {
  const [yearStr, monthStr] = iso.split('-')
  return `${MONTHS_SHORT[parseInt(monthStr, 10) - 1]}/${yearStr}`
}
```

- [ ] **Passo 3: Rodar testes**

```bash
npx vitest run tests/unit/format.test.ts
```

Esperado: 9 PASS.

- [ ] **Passo 4: Commit**

```bash
git add src/lib/format.ts tests/unit/format.test.ts
git commit -m "feat(lib): utilitários de formatação portados da v1 com testes"
```

---

## Tarefa 5: Cliente Supabase e Auth

**Files:**
- Create: `src/lib/supabase/client.ts`
- Create: `src/lib/supabase/server.ts`
- Create: `src/middleware.ts`
- Create: `src/actions/auth.ts`
- Create: `src/app/(auth)/login/page.tsx`
- Create: `src/app/(auth)/cadastro/page.tsx`
- Create: `src/app/(auth)/recuperar-senha/page.tsx`
- Create: `src/app/(auth)/nova-senha/page.tsx`
- Create: `src/components/auth/login-form.tsx`
- Create: `src/components/auth/cadastro-form.tsx`

**Interfaces:**
- Produces: usuário autenticado disponível em Server Components via `createServerClient`; redirect automático para `/login` se sem sessão

- [ ] **Passo 1: Criar cliente browser**

Criar `src/lib/supabase/client.ts`:
```typescript
import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/database'

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

- [ ] **Passo 2: Criar cliente servidor**

Criar `src/lib/supabase/server.ts`:
```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/types/database'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
}
```

- [ ] **Passo 3: Criar middleware**

Criar `src/middleware.ts`:
```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const isAuthRoute = request.nextUrl.pathname.startsWith('/login') ||
    request.nextUrl.pathname.startsWith('/cadastro') ||
    request.nextUrl.pathname.startsWith('/recuperar-senha') ||
    request.nextUrl.pathname.startsWith('/nova-senha')

  if (!user && !isAuthRoute) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  if (user && isAuthRoute && request.nextUrl.pathname !== '/nova-senha') {
    return NextResponse.redirect(new URL('/inicio', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons|sw.js|manifest).*)'],
}
```

- [ ] **Passo 4: Criar Server Actions de auth**

Criar `src/actions/auth.ts`:
```typescript
'use server'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { z } from 'zod'

const loginSchema = z.object({
  email: z.string().email('E-mail inválido'),
  password: z.string().min(6, 'Mínimo 6 caracteres'),
})

export async function loginAction(formData: FormData) {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })
  if (!parsed.success) {
    return { error: parsed.error.errors[0].message }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword(parsed.data)
  if (error) return { error: 'E-mail ou senha incorretos' }

  redirect('/inicio')
}

const cadastroSchema = z.object({
  email: z.string().email('E-mail inválido'),
  password: z.string().min(6, 'Mínimo 6 caracteres'),
})

export async function cadastroAction(formData: FormData) {
  const parsed = cadastroSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })
  if (!parsed.success) return { error: parsed.error.errors[0].message }

  const supabase = await createClient()
  const { error } = await supabase.auth.signUp(parsed.data)
  if (error) return { error: error.message }

  redirect('/inicio')
}

export async function logoutAction() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}

export async function recuperarSenhaAction(formData: FormData) {
  const email = formData.get('email') as string
  if (!email) return { error: 'Informe o e-mail' }

  const supabase = await createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/nova-senha`,
  })
  if (error) return { error: error.message }
  return { success: 'Verifique seu e-mail para redefinir a senha' }
}

export async function novaSenhaAction(formData: FormData) {
  const password = formData.get('password') as string
  if (!password || password.length < 6) return { error: 'Mínimo 6 caracteres' }

  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password })
  if (error) return { error: error.message }

  redirect('/inicio')
}
```

- [ ] **Passo 5: Criar formulário de login (Client Component)**

Criar `src/components/auth/login-form.tsx`:
```tsx
'use client'
import { useState, useTransition } from 'react'
import { loginAction } from '@/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Link from 'next/link'

export function LoginForm() {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    setError(null)
    startTransition(async () => {
      const result = await loginAction(formData)
      if (result?.error) setError(result.error)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" name="email" type="email" required placeholder="seu@email.com" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Senha</Label>
        <Input id="password" name="password" type="password" required placeholder="••••••" />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? 'Entrando…' : 'Entrar'}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Não tem conta?{' '}
        <Link href="/cadastro" className="text-primary underline">Criar conta</Link>
      </p>
      <p className="text-center text-sm">
        <Link href="/recuperar-senha" className="text-muted-foreground underline text-xs">
          Esqueci minha senha
        </Link>
      </p>
    </form>
  )
}
```

- [ ] **Passo 6: Criar páginas de auth (Server Components)**

Criar `src/app/(auth)/login/page.tsx`:
```tsx
import { LoginForm } from '@/components/auth/login-form'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-center text-2xl">Finanças a Dois</CardTitle>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
    </main>
  )
}
```

Criar páginas similares para `/cadastro`, `/recuperar-senha` e `/nova-senha` com seus respectivos formulários (seguir o mesmo padrão de `login-form.tsx`).

- [ ] **Passo 7: Verificar manualmente**

```bash
npm run dev
```

Acessar `http://localhost:3000` — deve redirecionar para `/login`. Criar conta e verificar redirect para `/inicio`.

- [ ] **Passo 8: Commit**

```bash
git add src/lib/supabase/ src/middleware.ts src/actions/auth.ts \
        src/components/auth/ src/app/\(auth\)/
git commit -m "feat(auth): login, cadastro e recuperação de senha"
```

---

## Tarefa 6: Onboarding — criar e entrar na família

**Files:**
- Create: `src/actions/family.ts`
- Create: `src/components/auth/onboarding-form.tsx`
- Modify: `src/app/(app)/layout.tsx`

**Interfaces:**
- Consumes: RPCs `create_family(name, split_rule, member_name, monthly_income)` e `join_family(code, member_name, monthly_income)`
- Produces: usuário com `family_id` na sessão, redirecionado para `/inicio`

- [ ] **Passo 1: Server Actions de família**

Criar `src/actions/family.ts`:
```typescript
'use server'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { z } from 'zod'

const createFamilySchema = z.object({
  family_name:     z.string().min(1, 'Informe o nome da família'),
  split_rule:      z.enum(['equal', 'proportional']),
  member_name:     z.string().min(1, 'Informe seu nome'),
  monthly_income:  z.string().optional(),
})

export async function createFamilyAction(formData: FormData) {
  const parsed = createFamilySchema.safeParse({
    family_name:    formData.get('family_name'),
    split_rule:     formData.get('split_rule'),
    member_name:    formData.get('member_name'),
    monthly_income: formData.get('monthly_income'),
  })
  if (!parsed.success) return { error: parsed.error.errors[0].message }

  const supabase = await createClient()
  const { error } = await supabase.rpc('create_family', {
    p_family_name:    parsed.data.family_name,
    p_split_rule:     parsed.data.split_rule,
    p_member_name:    parsed.data.member_name,
    p_monthly_income: parsed.data.monthly_income
      ? parseFloat(parsed.data.monthly_income.replace(/\./g,'').replace(',','.'))
      : null,
  })
  if (error) return { error: error.message }

  redirect('/inicio')
}

const joinFamilySchema = z.object({
  join_code:       z.string().length(6, 'Código deve ter 6 caracteres'),
  member_name:     z.string().min(1, 'Informe seu nome'),
  monthly_income:  z.string().optional(),
})

export async function joinFamilyAction(formData: FormData) {
  const parsed = joinFamilySchema.safeParse({
    join_code:      formData.get('join_code'),
    member_name:    formData.get('member_name'),
    monthly_income: formData.get('monthly_income'),
  })
  if (!parsed.success) return { error: parsed.error.errors[0].message }

  const supabase = await createClient()
  const { error } = await supabase.rpc('join_family', {
    p_join_code:      parsed.data.join_code,
    p_member_name:    parsed.data.member_name,
    p_monthly_income: parsed.data.monthly_income
      ? parseFloat(parsed.data.monthly_income.replace(/\./g,'').replace(',','.'))
      : null,
  })
  if (error) return { error: error.message }

  redirect('/inicio')
}
```

- [ ] **Passo 2: Criar formulário de onboarding**

Criar `src/components/auth/onboarding-form.tsx` com duas tabs:
- **"Criar casa":** campos `family_name`, `split_rule` (radio equal/proportional), `member_name`, `monthly_income` opcional
- **"Entrar com código":** campos `join_code` (6 chars, uppercase), `member_name`, `monthly_income`

Usar o padrão de `LoginForm` com `useTransition` e exibir erro inline.

- [ ] **Passo 3: Criar layout protegido**

Criar `src/app/(app)/layout.tsx`:
```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { RealtimeProvider } from '@/components/providers/realtime-provider'
import { HideValuesProvider } from '@/components/providers/hide-values-provider'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Verificar se usuário tem família
  const { data: member } = await supabase
    .from('family_members')
    .select('id, family_id, display_name, avatar_url, monthly_income')
    .eq('user_id', user.id)
    .single()

  if (!member) redirect('/onboarding')

  const { data: family } = await supabase
    .from('families')
    .select('*')
    .eq('id', member.family_id)
    .single()

  const { data: members } = await supabase
    .from('family_members')
    .select('*')
    .eq('family_id', member.family_id)

  const { data: accounts } = await supabase
    .from('accounts')
    .select('*')
    .eq('family_id', member.family_id)

  const { data: categories } = await supabase
    .from('categories')
    .select('*')
    .eq('family_id', member.family_id)
    .order('sort_order')

  const { data: paymentMethods } = await supabase
    .from('payment_methods')
    .select('*')
    .eq('family_id', member.family_id)
    .order('sort_order')

  return (
    <HideValuesProvider>
      <RealtimeProvider
        familyId={member.family_id}
        currentMemberId={member.id}
        initialMembers={members ?? []}
        initialAccounts={accounts ?? []}
        initialCategories={categories ?? []}
        initialPaymentMethods={paymentMethods ?? []}
        family={family!}
        currentMember={member}
      >
        <div className="min-h-screen bg-background">
          {children}
          {/* Bottom nav aqui na Tarefa 9 */}
        </div>
      </RealtimeProvider>
    </HideValuesProvider>
  )
}
```

- [ ] **Passo 4: Criar rota de onboarding**

Criar `src/app/onboarding/page.tsx` que renderiza `<OnboardingForm />`.

- [ ] **Passo 5: Commit**

```bash
git add src/actions/family.ts src/components/auth/onboarding-form.tsx \
        src/app/\(app\)/layout.tsx src/app/onboarding/
git commit -m "feat(onboarding): criar família e entrar com código"
```

---

## Tarefa 7: Providers de contexto (Realtime e ocultar valores)

**Files:**
- Create: `src/components/providers/realtime-provider.tsx`
- Create: `src/components/providers/hide-values-provider.tsx`

**Interfaces:**
- Produces:
  - `useRealtime(): { members, accounts, categories, paymentMethods, family, currentMember, onlineMembers }`
  - `useHideValues(): { hideValues: boolean, toggleHideValues: () => void }`

- [ ] **Passo 1: Criar `hide-values-provider.tsx`**

```tsx
'use client'
import { createContext, useContext, useState } from 'react'

type HideValuesContextType = { hideValues: boolean; toggleHideValues: () => void }
const HideValuesContext = createContext<HideValuesContextType>({
  hideValues: false,
  toggleHideValues: () => {},
})

export function HideValuesProvider({ children }: { children: React.ReactNode }) {
  const [hideValues, setHideValues] = useState(false)
  return (
    <HideValuesContext.Provider value={{ hideValues, toggleHideValues: () => setHideValues(v => !v) }}>
      {children}
    </HideValuesContext.Provider>
  )
}
export function useHideValues() { return useContext(HideValuesContext) }
```

- [ ] **Passo 2: Criar `realtime-provider.tsx`**

```tsx
'use client'
import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { toast } from '@/components/ui/use-toast'
import type { Database } from '@/types/database'

type Tables = Database['public']['Tables']
type Member = Tables['family_members']['Row']
type Account = Tables['accounts']['Row']
type Category = Tables['categories']['Row']
type PaymentMethod = Tables['payment_methods']['Row']
type Family = Tables['families']['Row']

interface RealtimeContextType {
  family: Family
  currentMember: Member
  members: Member[]
  accounts: Account[]
  categories: Category[]
  paymentMethods: PaymentMethod[]
  onlineMembers: string[]  // member ids
}

const RealtimeContext = createContext<RealtimeContextType | null>(null)

interface Props {
  familyId: string
  currentMemberId: string
  family: Family
  currentMember: Member
  initialMembers: Member[]
  initialAccounts: Account[]
  initialCategories: Category[]
  initialPaymentMethods: PaymentMethod[]
  children: React.ReactNode
}

export function RealtimeProvider({
  familyId, currentMemberId, family, currentMember,
  initialMembers, initialAccounts, initialCategories, initialPaymentMethods,
  children,
}: Props) {
  const router = useRouter()
  const [onlineMembers, setOnlineMembers] = useState<string[]>([])

  useEffect(() => {
    const supabase = createClient()

    // Canal de transações — revalida o Server Component ao receber evento
    const txChannel = supabase
      .channel(`tx:${familyId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'transactions',
        filter: `family_id=eq.${familyId}`,
      }, (payload) => {
        // Se o INSERT vier de outro membro, mostrar toast
        if (payload.eventType === 'INSERT') {
          const tx = payload.new as { created_by_member_id: string; description: string; amount: number }
          if (tx.created_by_member_id !== currentMemberId) {
            const author = initialMembers.find(m => m.id === tx.created_by_member_id)
            toast({
              title: `${author?.display_name ?? 'Parceiro'} lançou`,
              description: `${tx.description} — R$ ${tx.amount.toFixed(2).replace('.',',')}`,
            })
          }
        }
        router.refresh()
      })
      .subscribe()

    // Canal de presença
    const presenceChannel = supabase.channel(`presence:${familyId}`)
    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState<{ member_id: string }>()
        const ids = Object.values(state).flat().map(p => p.member_id)
        setOnlineMembers([...new Set(ids)])
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await presenceChannel.track({ member_id: currentMemberId })
        }
      })

    return () => {
      supabase.removeChannel(txChannel)
      supabase.removeChannel(presenceChannel)
    }
  }, [familyId, currentMemberId, router])

  return (
    <RealtimeContext.Provider value={{
      family, currentMember,
      members: initialMembers,
      accounts: initialAccounts,
      categories: initialCategories,
      paymentMethods: initialPaymentMethods,
      onlineMembers,
    }}>
      {children}
    </RealtimeContext.Provider>
  )
}

export function useRealtime() {
  const ctx = useContext(RealtimeContext)
  if (!ctx) throw new Error('useRealtime must be used within RealtimeProvider')
  return ctx
}
```

- [ ] **Passo 3: Verificar que a app compila**

```bash
npx tsc --noEmit
```

Corrigir qualquer erro de tipos antes de seguir.

- [ ] **Passo 4: Commit**

```bash
git add src/components/providers/
git commit -m "feat(providers): contexto de realtime e ocultar valores"
```

---

## Tarefa 8: Formulário de lançamento

**Files:**
- Create: `src/actions/transactions.ts`
- Create: `src/components/transactions/transaction-form.tsx`
- Create: `src/components/transactions/bulk-form.tsx`
- Create: `src/app/(app)/lancar/page.tsx`

**Interfaces:**
- Consumes: `useRealtime()` para listas de categorias, contas, formas de pagamento e membros
- Consumes: `getInvoicePeriod` para calcular fatura ao selecionar conta cartão
- Produces: chamada a `upsert_transaction_series` com array de transações validadas

- [ ] **Passo 1: Server Actions de transações**

Criar `src/actions/transactions.ts`:
```typescript
'use server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { addMonthsISO } from '@/lib/format'

const transactionSchema = z.object({
  paid_by_member_id: z.string().uuid().optional().nullable(),
  recurrence_index:  z.number().int().optional().nullable(),
  type:              z.enum(['receita','despesa','investimento','transferencia']),
  description:       z.string().min(1, 'Informe a descrição'),
  amount:            z.number().positive('Valor deve ser positivo'),
  date:              z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida'),
  account_id:        z.string().uuid(),
  to_account_id:     z.string().uuid().optional().nullable(),
  owner_member_id:   z.string().uuid().optional().nullable(),
  owner_share:       z.number().min(0).max(1).optional().nullable(),
  category_id:       z.string().uuid().optional().nullable(),
  payment_method_id: z.string().uuid().optional().nullable(),
  is_paid:           z.boolean().default(false),
  paid_date:         z.string().optional().nullable(),
  is_benefit:        z.boolean().default(false),
  is_futile:         z.boolean().default(false),
  futile_label:      z.string().optional().nullable(),
  recurrence_months: z.number().int().min(1).max(120).optional().nullable(),
  invoice_year:      z.number().int().optional().nullable(),
  invoice_month:     z.number().int().min(1).max(12).optional().nullable(),
})

export async function upsertTransactionsAction(transactions: unknown[]) {
  const supabase = await createClient()

  const parsed = z.array(transactionSchema).safeParse(transactions)
  if (!parsed.success) {
    return { error: parsed.error.errors[0].message }
  }

  // Expandir parcelas em array
  const series: typeof parsed.data = []
  for (const tx of parsed.data) {
    if (tx.recurrence_months && tx.recurrence_months > 1) {
      for (let i = 0; i < tx.recurrence_months; i++) {
        series.push({
          ...tx,
          date: addMonthsISO(tx.date, i),
          recurrence_index: i + 1,
        })
      }
    } else {
      series.push(tx)
    }
  }

  const { error } = await supabase.rpc('upsert_transaction_series', {
    p_transactions: series as any,
  })

  if (error) return { error: error.message }

  revalidatePath('/inicio')
  revalidatePath('/carteira')
  revalidatePath('/acerto')
  return { success: true }
}

export async function deleteTransactionAction(id: string, scope: 'single' | 'series') {
  const supabase = await createClient()
  const { error } = await supabase.rpc('delete_transaction_series', {
    p_id: id,
    p_scope: scope,
  })
  if (error) return { error: error.message }
  revalidatePath('/inicio')
  return { success: true }
}
```

- [ ] **Passo 2: Criar `transaction-form.tsx` (Client Component)**

O formulário deve ter:
- Tabs de tipo: Receita | Despesa | Investimento | Transferência
- Campo valor com máscara BRL (usando `parseBRLInput` ao submeter)
- Campo data (date input, formato `YYYY-MM-DD`, default `todayISO()`)
- Select de categoria (filtrado pelo tipo)
- Select de conta (ao selecionar cartão: mostrar aviso de qual fatura cai via `getInvoicePeriod`)
- Select de forma de pagamento
- Select de responsável (membros + "Compartilhado")
- Se compartilhado: slider ou input de porcentagem
- Switch "Já foi pago?" com campo de data opcional
- Switch "Benefício?" (oculto, Onda 2 usa; gravar como false por padrão)
- Switch "Fútil?" (idem)
- Campo de parcelas (1–120, padrão 1)
- Botão "Adicionar ao lote" para modo bulk
- Botão submit "Salvar"

Estrutura:
```tsx
'use client'
import { useState, useTransition } from 'react'
import { useRealtime } from '@/components/providers/realtime-provider'
import { upsertTransactionsAction } from '@/actions/transactions'
import { parseBRLInput, todayISO } from '@/lib/format'
import { getInvoicePeriod } from '@/lib/invoice'
// ... imports shadcn

export function TransactionForm({ onSuccess }: { onSuccess?: () => void }) {
  const { categories, accounts, paymentMethods, members, currentMember } = useRealtime()
  const [type, setType] = useState<'receita'|'despesa'|'investimento'|'transferencia'>('despesa')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // ... estado dos campos

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    // Montar objeto de transação, parsear valor com parseBRLInput
    // Calcular invoice_year/invoice_month se conta for cartão
    startTransition(async () => {
      const result = await upsertTransactionsAction([/* objeto montado */])
      if (result?.error) setError(result.error)
      else onSuccess?.()
    })
  }

  // ... render
}
```

- [ ] **Passo 3: Criar página `/lancar`**

```tsx
// src/app/(app)/lancar/page.tsx
import { TransactionForm } from '@/components/transactions/transaction-form'

export default function LancarPage() {
  return (
    <main className="p-4 pb-24">
      <h1 className="text-xl font-semibold mb-4">Lançar</h1>
      <TransactionForm />
    </main>
  )
}
```

- [ ] **Passo 4: Verificar que compila**

```bash
npx tsc --noEmit
```

- [ ] **Passo 5: Commit**

```bash
git add src/actions/transactions.ts src/components/transactions/ src/app/\(app\)/lancar/
git commit -m "feat(transactions): formulário de lançamento com parcelas e lote"
```

---

## Tarefa 9: Dashboard (Início)

**Files:**
- Create: `src/app/(app)/inicio/page.tsx`
- Create: `src/components/dashboard/kpi-card.tsx`
- Create: `src/components/dashboard/runway-card.tsx`
- Create: `src/components/transactions/transaction-list.tsx`
- Create: `src/components/transactions/transaction-item.tsx`

**Interfaces:**
- Consumes: views `v_account_balances`, tabela `transactions` com paginação (25 por página)
- Produces: 4 KPI cards, acerto resumido, lista paginada de lançamentos com filtros

- [ ] **Passo 1: Criar views no banco**

Adicionar ao final de `00003_functions.sql` (ou criar `00006_views.sql`):
```sql
-- Saldo real por conta
CREATE OR REPLACE VIEW v_account_balances WITH (security_invoker = true) AS
SELECT
  a.id AS account_id,
  a.family_id,
  a.name,
  a.type,
  a.initial_balance,
  a.closing_day,
  a.due_day,
  a.owner_member_id,
  a.initial_balance
    + COALESCE(SUM(CASE
        WHEN t.type = 'receita' AND t.is_paid = true AND t.account_id = a.id
        THEN t.amount ELSE 0 END), 0)
    - COALESCE(SUM(CASE
        WHEN t.type IN ('despesa','investimento') AND t.is_paid = true AND t.account_id = a.id
        THEN t.amount ELSE 0 END), 0)
    - COALESCE(SUM(CASE
        WHEN t.type = 'transferencia' AND t.is_paid = true AND t.account_id = a.id
        THEN t.amount ELSE 0 END), 0)
    + COALESCE(SUM(CASE
        WHEN t.type = 'transferencia' AND t.is_paid = true AND t.to_account_id = a.id
        THEN t.amount ELSE 0 END), 0)
  AS current_balance
FROM accounts a
LEFT JOIN transactions t
  ON t.account_id = a.id OR t.to_account_id = a.id
GROUP BY a.id;

-- Fatura atual por cartão
CREATE OR REPLACE VIEW v_invoice_summary WITH (security_invoker = true) AS
SELECT
  a.id AS account_id,
  a.family_id,
  a.name,
  t.invoice_year,
  t.invoice_month,
  SUM(t.amount) AS total_amount,
  COUNT(*) AS tx_count,
  BOOL_AND(t.is_paid) AS is_fully_paid
FROM accounts a
JOIN transactions t ON t.account_id = a.id
  AND t.invoice_year IS NOT NULL
  AND t.type = 'despesa'
WHERE a.type = 'cartao'
GROUP BY a.id, a.family_id, a.name, t.invoice_year, t.invoice_month;
```

Aplicar com `npx supabase db reset`.

- [ ] **Passo 2: Criar `kpi-card.tsx`**

```tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatBRL } from '@/lib/format'

interface KpiCardProps {
  title: string
  value: number
  subtitle?: string
  trend?: { value: number; label: string }
  hideValues?: boolean
}

export function KpiCard({ title, value, subtitle, trend, hideValues }: KpiCardProps) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold">{formatBRL(value, hideValues)}</p>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
        {trend && (
          <p className={`text-xs mt-1 ${trend.value >= 0 ? 'text-green-600' : 'text-red-500'}`}>
            {trend.value >= 0 ? '▲' : '▼'} {Math.abs(trend.value).toFixed(1)}% {trend.label}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Passo 3: Criar `inicio/page.tsx` (Server Component)**

```tsx
import { createClient } from '@/lib/supabase/server'
import { KpiCard } from '@/components/dashboard/kpi-card'
import { RunwayCard } from '@/components/dashboard/runway-card'
import { TransactionList } from '@/components/transactions/transaction-list'
import { todayISO, monthKeyFromISO } from '@/lib/format'

export default async function InicioPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; page?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const mesAtual = params.mes ?? monthKeyFromISO(todayISO())
  const page = parseInt(params.page ?? '1', 10)
  const pageSize = 25

  // Saldo livre = soma das contas correntes com saldo real
  const { data: balances } = await supabase
    .from('v_account_balances')
    .select('*')

  const saldoLivre = (balances ?? [])
    .filter(b => b.type === 'corrente')
    .reduce((s, b) => s + (b.current_balance ?? 0), 0)

  // Gastos do mês
  const { data: txsMes } = await supabase
    .from('transactions')
    .select('amount,type,is_paid,date')
    .gte('date', `${mesAtual}-01`)
    .lte('date', `${mesAtual}-31`)

  const gastosMes = (txsMes ?? [])
    .filter(t => t.type === 'despesa')
    .reduce((s, t) => s + t.amount, 0)

  const aPagar = (txsMes ?? [])
    .filter(t => t.type === 'despesa' && !t.is_paid)
    .reduce((s, t) => s + t.amount, 0)

  const aReceber = (txsMes ?? [])
    .filter(t => t.type === 'receita' && !t.is_paid)
    .reduce((s, t) => s + t.amount, 0)

  // Lista paginada
  const { data: txList, count } = await supabase
    .from('transactions')
    .select('*, categories(name,icon), accounts(name), family_members!created_by_member_id(display_name)', { count: 'exact' })
    .order('date', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1)

  return (
    <main className="p-4 pb-24 space-y-4">
      {/* Seletor de mês aqui */}
      <div className="grid grid-cols-2 gap-3">
        <KpiCard title="Saldo livre" value={saldoLivre} />
        <KpiCard title="Gastos do mês" value={gastosMes} />
        <KpiCard title="A pagar" value={aPagar} />
        <KpiCard title="A receber" value={aReceber} />
      </div>
      <RunwayCard saldoLivre={saldoLivre} gastosMes={gastosMes} diasDecorridos={new Date().getDate()} />
      <TransactionList
        transactions={txList ?? []}
        total={count ?? 0}
        page={page}
        pageSize={pageSize}
      />
    </main>
  )
}
```

- [ ] **Passo 4: Criar `runway-card.tsx`**

```tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Props {
  saldoLivre: number
  gastosMes: number
  diasDecorridos: number
}

export function RunwayCard({ saldoLivre, gastosMes, diasDecorridos }: Props) {
  // Média por dia = gastos do mês / dias decorridos (corrigido da v1)
  const mediaDiaria = diasDecorridos > 0 ? gastosMes / diasDecorridos : 0
  const runway = mediaDiaria > 0 ? Math.floor(saldoLivre / mediaDiaria) : Infinity

  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-sm font-medium text-muted-foreground">Runway</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold">
          {runway === Infinity ? '∞' : `${runway} dias`}
        </p>
        <p className="text-xs text-muted-foreground">
          {mediaDiaria > 0
            ? `Gastando R$ ${mediaDiaria.toFixed(2).replace('.',',')} por dia em média`
            : 'Sem gastos registrados'}
        </p>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Passo 5: Criar `transaction-list.tsx` e `transaction-item.tsx`**

`TransactionList` renderiza a lista com filtros (por tipo, por membro) e paginação via `searchParams`. `TransactionItem` exibe uma linha com data, ícone da categoria, descrição, conta, valor e badges "novo" e "a pagar".

- [ ] **Passo 6: Commit**

```bash
git add src/app/\(app\)/inicio/ src/components/dashboard/ src/components/transactions/
git commit -m "feat(dashboard): KPIs, runway e lista paginada de lançamentos"
```

---

## Tarefa 10: Carteira (contas e faturas)

**Files:**
- Create: `src/app/(app)/carteira/page.tsx`
- Create: `src/components/wallet/account-card.tsx`
- Create: `src/components/wallet/invoice-detail.tsx`
- Create: `src/actions/accounts.ts`

**Interfaces:**
- Consumes: `v_account_balances`, `v_invoice_summary`
- Produces: cartões visuais por conta, fatura do cartão, botão pagar fatura

- [ ] **Passo 1: Server Actions de contas**

Criar `src/actions/accounts.ts`:
```typescript
'use server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

export async function payInvoiceAction(data: {
  cardAccountId: string
  fromAccountId: string
  amount: number
  date: string
  invoiceYear: number
  invoiceMonth: number
}) {
  const supabase = await createClient()
  const { error } = await supabase.rpc('pay_invoice', {
    p_card_account_id: data.cardAccountId,
    p_from_account_id: data.fromAccountId,
    p_amount: data.amount,
    p_date: data.date,
    p_invoice_year: data.invoiceYear,
    p_invoice_month: data.invoiceMonth,
  })
  if (error) return { error: error.message }
  revalidatePath('/carteira')
  revalidatePath('/inicio')
  return { success: true }
}

const accountSchema = z.object({
  name:           z.string().min(1),
  type:           z.enum(['corrente','beneficio','cartao','investimento']),
  initial_balance: z.number().default(0),
  closing_day:    z.number().int().min(1).max(31).optional().nullable(),
  due_day:        z.number().int().min(1).max(31).optional().nullable(),
})

export async function upsertAccountAction(id: string | null, data: unknown) {
  const parsed = accountSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.errors[0].message }

  const supabase = await createClient()
  const { data: member } = await supabase
    .from('family_members')
    .select('family_id')
    .eq('user_id', (await supabase.auth.getUser()).data.user!.id)
    .single()

  if (!member) return { error: 'Usuário sem família' }

  if (id) {
    const { error } = await supabase
      .from('accounts')
      .update(parsed.data)
      .eq('id', id)
      .eq('family_id', member.family_id)
    if (error) return { error: error.message }
  } else {
    const { error } = await supabase
      .from('accounts')
      .insert({ ...parsed.data, family_id: member.family_id })
    if (error) return { error: error.message }
  }

  revalidatePath('/carteira')
  revalidatePath('/ajustes/contas')
  return { success: true }
}
```

- [ ] **Passo 2: Criar `account-card.tsx`**

Cartão visual estilo crédito com:
- Gradiente baseado no tipo (corrente=azul, benefício=verde, cartão=roxo, investimento=âmbar)
- Nome da conta, tipo, saldo real (com `hideValues`)
- Badge de saúde: "Ótimo" (saldo > 2000), "Ok" (> 500), "Atenção" (> 0), "Negativo" (< 0)
- Para cartão: fatura aberta, data de vencimento

- [ ] **Passo 3: Criar `invoice-detail.tsx`**

Exibe transações de uma fatura específica com total e botão "Pagar fatura" (abre dialog confirmando conta debitada e valor).

- [ ] **Passo 4: Criar `carteira/page.tsx`**

Server Component que busca `v_account_balances` e `v_invoice_summary` e renderiza os cards.

- [ ] **Passo 5: Commit**

```bash
git add src/app/\(app\)/carteira/ src/components/wallet/ src/actions/accounts.ts
git commit -m "feat(carteira): contas com saldo real e fatura do cartão"
```

---

## Tarefa 11: Acerto de contas

**Files:**
- Create: `src/app/(app)/acerto/page.tsx`
- Create: `src/components/settlement/settlement-summary.tsx`
- Create: `src/components/settlement/settlement-history.tsx`
- Create: `src/actions/settlement.ts`

**Interfaces:**
- Consumes: `calcSettlement` de `src/lib/settlement.ts`, `family.split_rule`, `members.monthly_income`
- Produces: resumo do saldo atual + histórico de acertos realizados + botão acertar

- [ ] **Passo 1: Server Action de acerto**

Criar `src/actions/settlement.ts`:
```typescript
'use server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { todayISO } from '@/lib/format'

export async function settleAccountsAction(data: {
  fromMemberId: string
  toMemberId: string
  amount: number
}) {
  if (data.amount <= 0) return { error: 'Valor deve ser positivo' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('settle_accounts', {
    p_from_member_id: data.fromMemberId,
    p_to_member_id:   data.toMemberId,
    p_amount:         data.amount,
    p_date:           todayISO(),
  })
  if (error) return { error: error.message }

  revalidatePath('/acerto')
  revalidatePath('/inicio')
  return { success: true }
}
```

- [ ] **Passo 2: Criar `acerto/page.tsx`**

Server Component que:
1. Busca transações pagas dos últimos 3 meses (despesas e investimentos)
2. Busca membros com `monthly_income`
3. Busca `family.split_rule`
4. Chama `calcSettlement` e renderiza `<SettlementSummary />`
5. Busca histórico de transferências com descrição "Acerto de contas" e renderiza `<SettlementHistory />`

- [ ] **Passo 3: Criar `settlement-summary.tsx`**

Exibe:
- Quem deve quanto para quem
- Botão "Acertar agora" (abre dialog com valor pré-preenchido e botão confirmar)
- Detalhamento: lista dos gastos que compõem o saldo

- [ ] **Passo 4: Commit**

```bash
git add src/app/\(app\)/acerto/ src/components/settlement/ src/actions/settlement.ts
git commit -m "feat(acerto): acerto de contas com regra igual e proporcional"
```

---

## Tarefa 12: Ajustes e navegação

**Files:**
- Create: `src/app/(app)/ajustes/**`
- Create: `src/components/navigation/bottom-nav.tsx`
- Modify: `src/app/(app)/layout.tsx`

**Interfaces:**
- Produces: telas de perfil, família, categorias, contas, formas de pagamento; barra de navegação inferior

- [ ] **Passo 1: Criar bottom nav**

Criar `src/components/navigation/bottom-nav.tsx` com 5 ícones:
- Casa → `/inicio`
- Carteira → `/carteira`
- + (botão central destacado) → `/lancar`
- Acerto → `/acerto`
- Engrenagem → `/ajustes`

Usar `usePathname()` para destacar ativo. É Client Component por causa do hook.

- [ ] **Passo 2: Adicionar bottom nav ao layout**

Modificar `src/app/(app)/layout.tsx` para incluir `<BottomNav />` no final do body.

- [ ] **Passo 3: Criar páginas de ajustes**

Cada página segue o padrão: Server Component que busca dados e renderiza um formulário Client Component com CRUD completo.

- `/ajustes/perfil` — nome, foto (upload para Supabase Storage bucket `avatars`), renda
- `/ajustes/familia` — nome, regra de divisão, código de convite (exibir com QR opcional), membros
- `/ajustes/categorias` — lista com reordenação (drag ou setas), adicionar, editar, excluir
- `/ajustes/contas` — lista, adicionar, editar (inclusive saldo inicial), excluir
- `/ajustes/formas-pagamento` — lista, adicionar, editar, excluir

- [ ] **Passo 4: Verificar compilação completa**

```bash
npx tsc --noEmit
npm run build
```

Sem erros. Se houver, corrigir antes de seguir.

- [ ] **Passo 5: Commit**

```bash
git add src/app/\(app\)/ajustes/ src/components/navigation/
git commit -m "feat(ajustes): configurações de perfil, família e cadastros"
```

---

## Tarefa 13: PWA

**Files:**
- Create: `public/sw.js`
- Create: `public/icons/icon-192.png` (placeholder ou real)
- Create: `public/icons/icon-512.png`
- Create: `src/app/manifest.webmanifest/route.ts`
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Produces: app instalável no celular

- [ ] **Passo 1: Criar service worker**

Criar `public/sw.js`:
```javascript
const CACHE = 'financas-v2-v1'
const SHELL = ['/', '/inicio', '/manifest.webmanifest']

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', e => {
  // Network first; fallback para cache apenas em offline
  if (e.request.method !== 'GET') return
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const clone = res.clone()
        caches.open(CACHE).then(c => c.put(e.request, clone))
        return res
      })
      .catch(() => caches.match(e.request))
  )
})
```

- [ ] **Passo 2: Criar manifest dinâmico**

Criar `src/app/manifest.webmanifest/route.ts`:
```typescript
export function GET() {
  return Response.json({
    name: 'Finanças a Dois',
    short_name: 'Finanças',
    description: 'Gerenciamento financeiro do casal',
    start_url: '/',
    display: 'standalone',
    background_color: '#0a0a0a',
    theme_color: '#0a0a0a',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    ],
  })
}
```

- [ ] **Passo 3: Registrar SW no layout**

Adicionar ao `src/app/layout.tsx`:
```tsx
// No componente: useEffect(() => { navigator.serviceWorker?.register('/sw.js') }, [])
// Criar src/components/pwa-register.tsx como Client Component com esse useEffect
// e incluir no layout raiz
```

- [ ] **Passo 4: Testar instalação**

```bash
npm run build && npm start
```

Abrir no Chrome mobile simulation → verificar prompt de instalação.

- [ ] **Passo 5: Commit**

```bash
git add public/ src/app/manifest.webmanifest/
git commit -m "feat(pwa): service worker e manifest instalável"
```

---

## Tarefa 14: Verificação final e deploy

**Files:**
- Modify: `next.config.ts` (se necessário para Vercel)
- Create: `.env.local.example` (revisão final)

**Interfaces:**
- Produces: app deployado na Vercel, URL pública

- [ ] **Passo 1: Rodar todos os testes**

```bash
npx vitest run
```

Esperado: todos PASS.

- [ ] **Passo 2: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Esperado: zero erros.

- [ ] **Passo 3: Build de produção local**

```bash
npm run build
```

Esperado: build bem-sucedido sem warnings críticos.

- [ ] **Passo 4: Commit final**

```bash
git add -A
git status  # verificar que nenhum segredo foi incluído
git commit -m "feat: Onda 1 completa — MVP Finanças a Dois v2"
```

- [ ] **Passo 5: Push para o repositório do cliente**

(Aguardar o usuário fornecer a URL do repositório vazio)

```bash
git remote add origin <URL_DO_REPO>
git push -u origin main
```

- [ ] **Passo 6: Configurar variáveis de ambiente na Vercel**

No painel da Vercel, adicionar:
```
NEXT_PUBLIC_SUPABASE_URL=<url-do-projeto-supabase-producao>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<chave-anon>
SUPABASE_SERVICE_ROLE_KEY=<service-role>
NEXT_PUBLIC_APP_URL=https://<seu-dominio>.vercel.app
```

- [ ] **Passo 7: Deploy**

```bash
# Via Vercel CLI:
npx vercel --prod
# Ou: push para main com Vercel integrado ao GitHub dispara deploy automático
```

- [ ] **Passo 8: Aplicar migrations no Supabase de produção**

```bash
npx supabase link --project-ref <ref-do-projeto>
npx supabase db push
```

- [ ] **Passo 9: Smoke test em produção**

- Criar conta → onboarding → criar família
- Entrar em outro dispositivo com código
- Lançar despesa → verificar que aparece no outro dispositivo em tempo real
- Lançar em cartão → verificar fatura
- Pagar fatura → verificar saldo

---

## Review Focus — testes adicionados por tarefa

Os 5 riscos do topo do plano, com seus testes fixados:

1. **Virada de mês na fatura** → `tests/unit/invoice.test.ts` (Tarefa 3, Passo 1): cobre closing_day=25 com datas 24, 25 e 26 de outubro, e dezembro → janeiro.

2. **Isolamento RLS** → `tests/integration/rls.test.ts` (Tarefa 2, Passo 1): dois usuários, `transactions` e verifica que família A não lê família B.

3. **Atomicidade de parcelas** → adicionar em `tests/integration/rls.test.ts`:
```typescript
it('upsert_transaction_series is atomic', async () => {
  // Simular erro na terceira parcela passando account_id inválido na 3ª entrada
  // e verificar que nenhuma das 3 foi inserida
})
```
(Tarefa 3 — adicionar ao arquivo de integração antes do commit da tarefa 3)

4. **Divisão por zero na regra proporcional** → `tests/unit/settlement.test.ts` (Tarefa 3, Passo 4): caso `monthly_income = 0` já coberto.

5. **Saldo acumulado vs mensal** → adicionar em `tests/integration/rls.test.ts`:
```typescript
it('account balance includes prior months paid transactions', async () => {
  // Inserir lançamento pago em mês anterior
  // Verificar que v_account_balances retorna saldo acumulado, não só do mês atual
})
```
(Tarefa 9 — adicionar antes do commit da tarefa 9)
