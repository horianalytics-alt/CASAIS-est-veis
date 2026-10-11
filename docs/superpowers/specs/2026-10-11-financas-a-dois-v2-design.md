# Finanças a Dois v2 — Design Spec

> Autores: Heitor (produto) + Maestro (arquitetura)
> Data: 2026-10-11
> Status: APROVADO — pronto para plano de implementação

---

## 1. O que é e para quem

PWA mobile-first para casais (e futuramente famílias) lançarem receitas, despesas, investimentos e transferências numa casa compartilhada, com sincronização em tempo real entre os membros, fatura de cartão de crédito, saldo real de contas e acerto de contas entre os dois.

**Beta privado:** Heitor, Carol e convidados da família/amigos. Registro aberto (sem código de convite), com arquitetura pronta para ser produto público multi-família no futuro.

---

## 2. Stack

| Camada | Tecnologia | Justificativa (fonte) |
|---|---|---|
| Framework | Next.js 15 App Router + TypeScript | Renderização no servidor, Server Actions transacionais, PWA com route handlers — fonte: `vercel:nextjs` |
| Estilo | Tailwind CSS + shadcn/ui | Componentes acessíveis, dark mode, tokens via CSS variables |
| Banco | Supabase Postgres | RLS por família, Realtime, Auth, Storage — fonte: `supabase:supabase-postgres-best-practices` |
| Auth | Supabase Auth (email/senha) | Cada membro tem login próprio |
| Tempo real | Supabase Realtime (postgres_changes + presence) | Canal por família, RLS no `realtime.messages` |
| Deploy | Vercel | Integração com Next.js, previews por branch |
| Push | Supabase Edge Function + Web Push VAPID | Segredo só em Vault/env, nunca em migration |
| Testes | Vitest (unitário) + Supabase local (integração) | — |

---

## 3. Modelo de dados — Onda 1

Todas as tabelas têm `family_id uuid NOT NULL REFERENCES families(id)` e RLS que verifica `get_user_family_id(auth.uid()) = family_id`. A função `get_user_family_id` é `SECURITY DEFINER` com `search_path` fixo em `public`, e seu `EXECUTE` é revogado de `anon` (padrão aprendido na v1).

### 3.1 `families`

```sql
id          uuid PRIMARY KEY DEFAULT gen_random_uuid()
name        text NOT NULL
join_code   text NOT NULL UNIQUE  -- 6 chars, sem 0/O/1/I (charset: ABCDEFGHJKLMNPQRSTUVWXYZ23456789)
split_rule  text NOT NULL CHECK (split_rule IN ('equal','proportional'))
member_limit int NOT NULL DEFAULT 2
created_at  timestamptz DEFAULT now()
```

### 3.2 `family_members`

```sql
id          uuid PRIMARY KEY DEFAULT gen_random_uuid()
family_id   uuid NOT NULL REFERENCES families(id)
user_id     uuid NOT NULL REFERENCES auth.users(id)
display_name text NOT NULL
avatar_url  text
monthly_income numeric(14,2) -- para regra proporcional
joined_at   timestamptz DEFAULT now()
UNIQUE (family_id, user_id)
```

### 3.3 `accounts`

```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
family_id       uuid NOT NULL REFERENCES families(id)
owner_member_id uuid REFERENCES family_members(id) -- null = conta conjunta
name            text NOT NULL
type            text NOT NULL CHECK (type IN ('corrente','beneficio','cartao','investimento'))
initial_balance numeric(14,2) NOT NULL DEFAULT 0
-- Campos exclusivos de cartão (NULL para outros tipos):
closing_day     int CHECK (closing_day BETWEEN 1 AND 31)
due_day         int CHECK (due_day BETWEEN 1 AND 31)
-- Reservado para Open Finance (Onda 3):
external_id     text
created_at      timestamptz DEFAULT now()
```

### 3.4 `transactions`

```sql
id                   uuid PRIMARY KEY DEFAULT gen_random_uuid()
family_id            uuid NOT NULL REFERENCES families(id)
type                 text NOT NULL CHECK (type IN ('receita','despesa','investimento','transferencia'))
description          text NOT NULL
amount               numeric(14,2) NOT NULL CHECK (amount > 0)
date                 date NOT NULL  -- string YYYY-MM-DD, sem timezone
account_id           uuid NOT NULL REFERENCES accounts(id)
-- Para transferência: conta destino
to_account_id        uuid REFERENCES accounts(id)
-- Para despesa/investimento compartilhado:
owner_member_id      uuid REFERENCES family_members(id) -- null = casal
-- Cota do responsável (NULL = usa regra da família):
owner_share          numeric(5,4) CHECK (owner_share BETWEEN 0 AND 1)
-- Autor (sempre vem do servidor, nunca do cliente):
created_by_member_id uuid NOT NULL REFERENCES family_members(id)
category_id          uuid REFERENCES categories(id)
payment_method_id    uuid REFERENCES payment_methods(id)
is_paid              boolean NOT NULL DEFAULT false
paid_date            date
notes                text
is_benefit           boolean NOT NULL DEFAULT false
is_futile            boolean NOT NULL DEFAULT false
futile_label         text
-- Parcelas:
recurrence_months    int CHECK (recurrence_months BETWEEN 1 AND 120)
recurrence_index     int
recurrence_parent_id uuid REFERENCES transactions(id)
-- Fatura do cartão: em qual ciclo de fatura esta transação cai
invoice_year         int
invoice_month        int
created_at           timestamptz DEFAULT now()
updated_at           timestamptz DEFAULT now()
```

### 3.5 `categories`

```sql
id          uuid PRIMARY KEY DEFAULT gen_random_uuid()
family_id   uuid NOT NULL REFERENCES families(id)
name        text NOT NULL
type        text NOT NULL CHECK (type IN ('receita','despesa','investimento','todos'))
icon        text
color       text
sort_order  int NOT NULL DEFAULT 0
created_at  timestamptz DEFAULT now()
```

### 3.6 `payment_methods`

```sql
id          uuid PRIMARY KEY DEFAULT gen_random_uuid()
family_id   uuid NOT NULL REFERENCES families(id)
name        text NOT NULL
sort_order  int NOT NULL DEFAULT 0
created_at  timestamptz DEFAULT now()
```

### 3.7 `push_subscriptions`

```sql
id          uuid PRIMARY KEY DEFAULT gen_random_uuid()
family_id   uuid NOT NULL REFERENCES families(id)
member_id   uuid NOT NULL REFERENCES family_members(id)
endpoint    text NOT NULL
p256dh      text NOT NULL
auth        text NOT NULL
created_at  timestamptz DEFAULT now()
UNIQUE (member_id, endpoint)
```

### 3.8 Tabelas da Onda 2 (schema criado na Onda 1 para não migrar depois)

```sql
-- account_goals
id          uuid PRIMARY KEY DEFAULT gen_random_uuid()
family_id   uuid NOT NULL REFERENCES families(id)
account_id  uuid NOT NULL REFERENCES accounts(id)
amount      numeric(14,2) NOT NULL
-- category_budgets
id          uuid PRIMARY KEY DEFAULT gen_random_uuid()
family_id   uuid NOT NULL REFERENCES families(id)
category_id uuid NOT NULL REFERENCES categories(id)
amount      numeric(14,2) NOT NULL
month       text NOT NULL  -- YYYY-MM
```

### 3.9 FK composta nos goals/budgets

Para evitar FK que ignora RLS (bug da v1): `FOREIGN KEY (family_id, account_id) REFERENCES accounts(family_id, id)` — requer `UNIQUE (family_id, id)` em `accounts`.

---

## 4. RLS — política por tabela

Padrão único: um usuário vê e edita apenas linhas da própria família.

```sql
-- Habilitar em todas as tabelas:
ALTER TABLE <tabela> ENABLE ROW LEVEL SECURITY;

-- Policy de leitura:
CREATE POLICY "familia_select" ON <tabela>
  FOR SELECT USING (family_id = get_user_family_id(auth.uid()));

-- Policy de escrita (INSERT/UPDATE/DELETE):
CREATE POLICY "familia_write" ON <tabela>
  FOR ALL USING (family_id = get_user_family_id(auth.uid()));
```

`get_user_family_id`:
```sql
CREATE OR REPLACE FUNCTION get_user_family_id(uid uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT family_id FROM family_members WHERE user_id = uid LIMIT 1;
$$;
REVOKE EXECUTE ON FUNCTION get_user_family_id FROM anon, public;
GRANT EXECUTE ON FUNCTION get_user_family_id TO authenticated;
```

Testes de isolamento obrigatórios: usuário A não lê linha de família B em nenhuma tabela.

---

## 5. Cálculos no banco (views com `security_invoker`)

Toda view de agregação usa `WITH (security_invoker = true)` para que o RLS da tabela base seja aplicado no contexto do usuário chamador — não do dono da view.

### 5.1 `v_account_balances`

```sql
-- Saldo real = saldo_inicial + receitas pagas - despesas pagas - investimentos pagos
--              - transferências saindo + transferências chegando
-- (filtrando is_paid = true e type != 'receita' para debitar)
```

### 5.2 `v_invoice_summary`

```sql
-- Para cada cartão: fatura atual (aberta), fatura fechada não paga, total
-- Ciclo determinado por: se date > closing_day → cai na fatura do mês seguinte
```

### 5.3 `v_settlement`

```sql
-- Para cada membro: quanto pagou de transações owner_member_id = member OU casal
-- Quanto deveria ter pago pela regra (equal → 50%, proportional → renda/total)
-- Saldo = pago - dever → positivo = te devem, negativo = você deve
```

---

## 6. Funções SQL transacionais (Server Actions chamam estas)

### 6.1 `create_family(name, split_rule, member_name, monthly_income)`
Cria família + membro inicial + seed de categorias, formas de pagamento e conta corrente — tudo num bloco transacional.

### 6.2 `join_family(join_code, member_name, monthly_income)`
Valida código, verifica `member_limit`, cria `family_members`. Retorna erro se família cheia.

### 6.3 `upsert_transaction_series(payload[])`
Recebe array de lançamentos (lote ou parcelas), grava todos ou nenhum. `created_by_member_id` é resolvido no servidor pelo `auth.uid()`, nunca vem do cliente.

### 6.4 `delete_transaction_series(id, scope)`
`scope`: `'single'` ou `'series'`. Para `'series'` deleta pai e todos os filhos com mesmo `recurrence_parent_id`.

### 6.5 `pay_invoice(account_id, from_account_id, amount, date)`
Cria transferência de `from_account_id` → `account_id` (cartão) e marca os lançamentos da fatura como pagos.

### 6.6 `settle_accounts(date)`
Cria transferência entre contas dos membros pelo valor do saldo de acerto.

---

## 7. Rotas Next.js App Router

Fonte das decisões: `vercel:nextjs`.

```
app/
  (auth)/
    login/page.tsx              -- Server Component, redireciona se sessão ativa
    cadastro/page.tsx
    recuperar-senha/page.tsx
    nova-senha/page.tsx
  (app)/                        -- layout.tsx faz auth guard server-side
    layout.tsx                  -- carrega dados da família via Server Component
    page.tsx                    -- redireciona para /inicio
    inicio/page.tsx             -- dashboard
    carteira/page.tsx           -- contas e faturas
    lancar/page.tsx             -- formulário de lançamento (pode receber ?edit=<id>)
    acerto/page.tsx             -- acerto de contas
    ajustes/
      page.tsx
      perfil/page.tsx
      familia/page.tsx
      categorias/page.tsx
      contas/page.tsx
      formas-pagamento/page.tsx
  api/
    push/route.ts               -- recebe webhook do banco, despacha para Edge Function
  manifest.webmanifest/route.ts -- PWA manifest dinâmico
```

**Fronteira Server/Client:**
- `(app)/layout.tsx`: Server Component — carrega membros, contas, categorias uma vez.
- `inicio/page.tsx`: Server Component — busca KPIs e lista paginada de lançamentos.
- `TransactionForm`: Client Component — estado local do formulário, validação Zod.
- `RealtimeProvider`: Client Component — subscription Supabase Realtime, toast, presença.
- `HideValuesProvider`: Client Component — estado global de olho.

---

## 8. Tempo real

Canais por família:
- `tx:<family_id>` — postgres_changes em `transactions` (INSERT/UPDATE/DELETE)
- `presence:<family_id>` — quem está online

Ao receber INSERT de outro membro: toast *"[Nome] lançou R$ X — [descrição]"*, badge "novo" por 5s, som (Onda 2).

RLS no `realtime.messages`: usuário só assina tópico da própria família.

---

## 9. PWA

- `/public/manifest.webmanifest` — nome, ícones, `start_url`, `display: standalone`, `theme_color`
- `/public/sw.js` — service worker mínimo: cache de shell, fetch passthrough
- `next/head` ou metadata com `apple-touch-icon`, `theme-color`

---

## 10. Segurança

| Requisito | Solução |
|---|---|
| Segredo do push | Supabase Vault (`vault.secrets`) ou env var `PUSH_TRIGGER_SECRET` — nunca em migration |
| `created_by_member_id` | Resolvido no servidor por `auth.uid()` — cliente não envia |
| FK com RLS | FK composta `(family_id, id)` em contas/categorias para evitar referência cruzada de família |
| Variáveis sensíveis | `.env.local` ignorado por `.gitignore`, nunca commitado |
| Limite de membros | Verificado na função `join_family` antes de inserir |

---

## 11. Onda 2 (não implementar na Onda 1)

- Analytics: donut, barras, Pareto, heatmap, forecast corrigido, patrimônio corrigido
- Eficiência de Benefício, Simulador de gasto fútil
- Metas (account_goals + category_budgets — tabelas criadas na Onda 1)
- Push notifications (Web Push VAPID via Edge Function)
- Sons
- Paletas de cor adicionais
- Exportar CSV

---

## 12. Onda 3 / fora de escopo

- Importação de dados da v1
- Open Finance (campo `external_id` reservado)
- Offline-first / PWA com sync
- Convite por e-mail
- Interface para >2 membros (banco pronto, UI não)
- Planos e cobrança
- App nativo nas lojas
- Multi-moeda
