-- Finanças a Dois v2 — schema inicial
-- Isolamento: toda tabela carrega family_id e é filtrada por RLS.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- families
-- ---------------------------------------------------------------------------
CREATE TABLE families (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL CHECK (length(btrim(name)) > 0),
  join_code    text NOT NULL UNIQUE CHECK (join_code ~ '^[A-Z2-9]{6}$'),
  split_rule   text NOT NULL DEFAULT 'equal'
               CHECK (split_rule IN ('equal', 'proportional')),
  member_limit int  NOT NULL DEFAULT 2 CHECK (member_limit BETWEEN 1 AND 20),
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- family_members
-- ---------------------------------------------------------------------------
CREATE TABLE family_members (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id      uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name   text NOT NULL CHECK (length(btrim(display_name)) > 0),
  avatar_url     text,
  monthly_income numeric(14,2) CHECK (monthly_income IS NULL OR monthly_income >= 0),
  joined_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (family_id, id),
  UNIQUE (family_id, user_id),
  -- Um usuário pertence a uma única família nesta onda.
  UNIQUE (user_id)
);

CREATE INDEX idx_family_members_family_id ON family_members(family_id);

-- Resolve a família do usuário logado. SECURITY DEFINER para que as policies
-- possam consultar family_members sem recursão de RLS.
CREATE OR REPLACE FUNCTION get_user_family_id(uid uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT family_id FROM family_members WHERE user_id = uid LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION get_user_family_id(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION get_user_family_id(uuid) TO authenticated;

-- Resolve o membro do usuário logado.
CREATE OR REPLACE FUNCTION get_user_member_id(uid uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM family_members WHERE user_id = uid LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION get_user_member_id(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION get_user_member_id(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- accounts
-- ---------------------------------------------------------------------------
CREATE TABLE accounts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id       uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  owner_member_id uuid,
  name            text NOT NULL CHECK (length(btrim(name)) > 0),
  type            text NOT NULL
                  CHECK (type IN ('corrente', 'beneficio', 'cartao', 'investimento')),
  initial_balance numeric(14,2) NOT NULL DEFAULT 0,
  closing_day     int CHECK (closing_day BETWEEN 1 AND 31),
  due_day         int CHECK (due_day BETWEEN 1 AND 31),
  sort_order      int NOT NULL DEFAULT 0,
  archived_at     timestamptz,
  -- Reservado para Open Finance (onda futura).
  external_id     text,
  created_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE (family_id, id),
  -- FK composta: a conta só aponta para membro da MESMA família.
  FOREIGN KEY (family_id, owner_member_id)
    REFERENCES family_members(family_id, id) ON DELETE SET NULL,
  -- Cartão exige ciclo; os outros tipos não têm ciclo.
  CONSTRAINT accounts_cartao_tem_ciclo CHECK (
    (type = 'cartao'  AND closing_day IS NOT NULL AND due_day IS NOT NULL) OR
    (type <> 'cartao' AND closing_day IS NULL     AND due_day IS NULL)
  )
);

CREATE INDEX idx_accounts_family_id ON accounts(family_id);

-- ---------------------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------------------
CREATE TABLE categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id  uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name       text NOT NULL CHECK (length(btrim(name)) > 0),
  type       text NOT NULL
             CHECK (type IN ('receita', 'despesa', 'investimento', 'todos')),
  icon       text,
  color      text,
  sort_order int NOT NULL DEFAULT 0,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (family_id, id)
);

CREATE INDEX idx_categories_family_id ON categories(family_id);

-- ---------------------------------------------------------------------------
-- payment_methods
-- ---------------------------------------------------------------------------
CREATE TABLE payment_methods (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id  uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name       text NOT NULL CHECK (length(btrim(name)) > 0),
  sort_order int NOT NULL DEFAULT 0,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (family_id, id)
);

CREATE INDEX idx_payment_methods_family_id ON payment_methods(family_id);

-- ---------------------------------------------------------------------------
-- transactions
-- ---------------------------------------------------------------------------
CREATE TABLE transactions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id            uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  type                 text NOT NULL
                       CHECK (type IN ('receita', 'despesa', 'investimento', 'transferencia')),
  description          text NOT NULL CHECK (length(btrim(description)) > 0),
  amount               numeric(14,2) NOT NULL CHECK (amount > 0),
  date                 date NOT NULL,

  account_id           uuid NOT NULL,
  to_account_id        uuid,

  -- De quem é o gasto. NULL = compartilhado pela regra da família.
  owner_member_id      uuid,
  owner_share          numeric(5,4) CHECK (owner_share BETWEEN 0 AND 1),

  -- Quem digitou e quem pagou. Ambos resolvidos no servidor.
  created_by_member_id uuid NOT NULL,
  paid_by_member_id    uuid NOT NULL,

  category_id          uuid,
  payment_method_id    uuid,

  is_paid              boolean NOT NULL DEFAULT false,
  paid_date            date,
  notes                text,

  is_benefit           boolean NOT NULL DEFAULT false,
  is_futile            boolean NOT NULL DEFAULT false,
  futile_label         text,

  recurrence_months    int CHECK (recurrence_months BETWEEN 1 AND 120),
  recurrence_index     int CHECK (recurrence_index >= 1),
  recurrence_parent_id uuid REFERENCES transactions(id) ON DELETE CASCADE,

  -- Em qual fatura a compra de cartão cai.
  invoice_year         int CHECK (invoice_year BETWEEN 2000 AND 2200),
  invoice_month        int CHECK (invoice_month BETWEEN 1 AND 12),

  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  -- Todas as FKs são compostas com family_id: nada aponta para outra família.
  FOREIGN KEY (family_id, account_id)
    REFERENCES accounts(family_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (family_id, to_account_id)
    REFERENCES accounts(family_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (family_id, owner_member_id)
    REFERENCES family_members(family_id, id) ON DELETE SET NULL,
  FOREIGN KEY (family_id, created_by_member_id)
    REFERENCES family_members(family_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (family_id, paid_by_member_id)
    REFERENCES family_members(family_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (family_id, category_id)
    REFERENCES categories(family_id, id) ON DELETE SET NULL,
  FOREIGN KEY (family_id, payment_method_id)
    REFERENCES payment_methods(family_id, id) ON DELETE SET NULL,

  -- Transferência tem destino; os outros tipos não.
  CONSTRAINT tx_transferencia_tem_destino CHECK (
    (type =  'transferencia' AND to_account_id IS NOT NULL AND to_account_id <> account_id) OR
    (type <> 'transferencia' AND to_account_id IS NULL)
  ),
  -- Transferência é movimentação entre contas: não entra no acerto nem em categoria.
  CONSTRAINT tx_transferencia_sem_rateio CHECK (
    type <> 'transferencia' OR (owner_member_id IS NULL AND owner_share IS NULL)
  ),
  -- Data de pagamento existe se, e somente se, está pago.
  CONSTRAINT tx_pago_tem_data CHECK (
    (is_paid = true AND paid_date IS NOT NULL) OR
    (is_paid = false AND paid_date IS NULL)
  ),
  -- Cota só faz sentido com responsável nomeado.
  CONSTRAINT tx_cota_exige_responsavel CHECK (
    owner_share IS NULL OR owner_member_id IS NOT NULL
  ),
  -- Fatura: ano e mês andam juntos.
  CONSTRAINT tx_fatura_completa CHECK (
    (invoice_year IS NULL     AND invoice_month IS NULL) OR
    (invoice_year IS NOT NULL AND invoice_month IS NOT NULL)
  ),
  -- Rótulo de fútil só com o marcador ligado.
  CONSTRAINT tx_rotulo_exige_futil CHECK (
    futile_label IS NULL OR is_futile = true
  )
);

CREATE INDEX idx_transactions_family_date ON transactions(family_id, date DESC);
CREATE INDEX idx_transactions_account ON transactions(account_id);
CREATE INDEX idx_transactions_to_account ON transactions(to_account_id)
  WHERE to_account_id IS NOT NULL;
CREATE INDEX idx_transactions_invoice ON transactions(family_id, account_id, invoice_year, invoice_month)
  WHERE invoice_year IS NOT NULL;
CREATE INDEX idx_transactions_series ON transactions(recurrence_parent_id)
  WHERE recurrence_parent_id IS NOT NULL;
CREATE INDEX idx_transactions_unpaid ON transactions(family_id, date)
  WHERE is_paid = false;

-- updated_at automático
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_transactions_touch
  BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ---------------------------------------------------------------------------
-- push_subscriptions
-- ---------------------------------------------------------------------------
CREATE TABLE push_subscriptions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id  uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  member_id  uuid NOT NULL,
  endpoint   text NOT NULL,
  p256dh     text NOT NULL,
  auth       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (member_id, endpoint),
  FOREIGN KEY (family_id, member_id)
    REFERENCES family_members(family_id, id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- Metas e orçamentos (telas na Onda 2; tabelas já criadas para não migrar depois)
-- ---------------------------------------------------------------------------
CREATE TABLE account_goals (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id  uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  account_id uuid NOT NULL,
  amount     numeric(14,2) NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (family_id, account_id),
  FOREIGN KEY (family_id, account_id)
    REFERENCES accounts(family_id, id) ON DELETE CASCADE
);

CREATE TABLE category_budgets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id   uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  category_id uuid NOT NULL,
  amount      numeric(14,2) NOT NULL CHECK (amount > 0),
  month       text NOT NULL CHECK (month ~ '^\d{4}-\d{2}$'),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (family_id, category_id, month),
  FOREIGN KEY (family_id, category_id)
    REFERENCES categories(family_id, id) ON DELETE CASCADE
);

CREATE INDEX idx_category_budgets_month ON category_budgets(family_id, month);
