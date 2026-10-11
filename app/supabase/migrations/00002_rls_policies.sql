-- RLS: cada pessoa lê e escreve apenas linhas da própria família.
-- As policies usam (SELECT get_user_family_id(auth.uid())) para que o Postgres
-- avalie a função UMA vez por query, não uma vez por linha.

ALTER TABLE families           ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_members     ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories         ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_methods    ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_goals      ENABLE ROW LEVEL SECURITY;
ALTER TABLE category_budgets   ENABLE ROW LEVEL SECURITY;

-- Nada de acesso anônimo a dado financeiro.
REVOKE ALL ON families, family_members, accounts, categories,
              payment_methods, transactions, push_subscriptions,
              account_goals, category_budgets
  FROM anon;

-- ---------------------------------------------------------------------------
-- families — leitura da própria casa; ajustes de nome e regra pelos membros.
-- A criação acontece por RPC (SECURITY DEFINER), nunca por INSERT direto.
-- ---------------------------------------------------------------------------
CREATE POLICY families_select ON families
  FOR SELECT TO authenticated
  USING (id = (SELECT get_user_family_id(auth.uid())));

CREATE POLICY families_update ON families
  FOR UPDATE TO authenticated
  USING      (id = (SELECT get_user_family_id(auth.uid())))
  WITH CHECK (id = (SELECT get_user_family_id(auth.uid())));

-- ---------------------------------------------------------------------------
-- family_members — todos da casa se veem; cada um edita só o próprio perfil.
-- Entrada na família é por RPC join_family.
-- ---------------------------------------------------------------------------
CREATE POLICY family_members_select ON family_members
  FOR SELECT TO authenticated
  USING (family_id = (SELECT get_user_family_id(auth.uid())));

CREATE POLICY family_members_update_self ON family_members
  FOR UPDATE TO authenticated
  USING      (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- accounts, categories, payment_methods — cadastros compartilhados da casa.
-- ---------------------------------------------------------------------------
CREATE POLICY accounts_select ON accounts
  FOR SELECT TO authenticated
  USING (family_id = (SELECT get_user_family_id(auth.uid())));

CREATE POLICY accounts_insert ON accounts
  FOR INSERT TO authenticated
  WITH CHECK (family_id = (SELECT get_user_family_id(auth.uid())));

CREATE POLICY accounts_update ON accounts
  FOR UPDATE TO authenticated
  USING      (family_id = (SELECT get_user_family_id(auth.uid())))
  WITH CHECK (family_id = (SELECT get_user_family_id(auth.uid())));

CREATE POLICY accounts_delete ON accounts
  FOR DELETE TO authenticated
  USING (family_id = (SELECT get_user_family_id(auth.uid())));

CREATE POLICY categories_select ON categories
  FOR SELECT TO authenticated
  USING (family_id = (SELECT get_user_family_id(auth.uid())));

CREATE POLICY categories_insert ON categories
  FOR INSERT TO authenticated
  WITH CHECK (family_id = (SELECT get_user_family_id(auth.uid())));

CREATE POLICY categories_update ON categories
  FOR UPDATE TO authenticated
  USING      (family_id = (SELECT get_user_family_id(auth.uid())))
  WITH CHECK (family_id = (SELECT get_user_family_id(auth.uid())));

CREATE POLICY categories_delete ON categories
  FOR DELETE TO authenticated
  USING (family_id = (SELECT get_user_family_id(auth.uid())));

CREATE POLICY payment_methods_select ON payment_methods
  FOR SELECT TO authenticated
  USING (family_id = (SELECT get_user_family_id(auth.uid())));

CREATE POLICY payment_methods_insert ON payment_methods
  FOR INSERT TO authenticated
  WITH CHECK (family_id = (SELECT get_user_family_id(auth.uid())));

CREATE POLICY payment_methods_update ON payment_methods
  FOR UPDATE TO authenticated
  USING      (family_id = (SELECT get_user_family_id(auth.uid())))
  WITH CHECK (family_id = (SELECT get_user_family_id(auth.uid())));

CREATE POLICY payment_methods_delete ON payment_methods
  FOR DELETE TO authenticated
  USING (family_id = (SELECT get_user_family_id(auth.uid())));

-- ---------------------------------------------------------------------------
-- transactions — os dois editam qualquer lançamento da casa (decisão de produto).
-- O INSERT direto exige que o autor seja o próprio usuário: ninguém lança
-- assinando o nome do outro. A gravação normal passa pela RPC.
-- ---------------------------------------------------------------------------
CREATE POLICY transactions_select ON transactions
  FOR SELECT TO authenticated
  USING (family_id = (SELECT get_user_family_id(auth.uid())));

CREATE POLICY transactions_insert ON transactions
  FOR INSERT TO authenticated
  WITH CHECK (
    family_id = (SELECT get_user_family_id(auth.uid()))
    AND created_by_member_id = (SELECT get_user_member_id(auth.uid()))
  );

CREATE POLICY transactions_update ON transactions
  FOR UPDATE TO authenticated
  USING      (family_id = (SELECT get_user_family_id(auth.uid())))
  WITH CHECK (family_id = (SELECT get_user_family_id(auth.uid())));

CREATE POLICY transactions_delete ON transactions
  FOR DELETE TO authenticated
  USING (family_id = (SELECT get_user_family_id(auth.uid())));

-- ---------------------------------------------------------------------------
-- push_subscriptions — o token do aparelho é privado de cada pessoa.
-- Nem o parceiro lê: quem precisa ler é a Edge Function (service role).
-- ---------------------------------------------------------------------------
CREATE POLICY push_select_own ON push_subscriptions
  FOR SELECT TO authenticated
  USING (member_id = (SELECT get_user_member_id(auth.uid())));

CREATE POLICY push_insert_own ON push_subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (
    member_id = (SELECT get_user_member_id(auth.uid()))
    AND family_id = (SELECT get_user_family_id(auth.uid()))
  );

CREATE POLICY push_delete_own ON push_subscriptions
  FOR DELETE TO authenticated
  USING (member_id = (SELECT get_user_member_id(auth.uid())));

-- ---------------------------------------------------------------------------
-- Metas e orçamentos
-- ---------------------------------------------------------------------------
CREATE POLICY account_goals_select ON account_goals
  FOR SELECT TO authenticated
  USING (family_id = (SELECT get_user_family_id(auth.uid())));

CREATE POLICY account_goals_insert ON account_goals
  FOR INSERT TO authenticated
  WITH CHECK (family_id = (SELECT get_user_family_id(auth.uid())));

CREATE POLICY account_goals_update ON account_goals
  FOR UPDATE TO authenticated
  USING      (family_id = (SELECT get_user_family_id(auth.uid())))
  WITH CHECK (family_id = (SELECT get_user_family_id(auth.uid())));

CREATE POLICY account_goals_delete ON account_goals
  FOR DELETE TO authenticated
  USING (family_id = (SELECT get_user_family_id(auth.uid())));

CREATE POLICY category_budgets_select ON category_budgets
  FOR SELECT TO authenticated
  USING (family_id = (SELECT get_user_family_id(auth.uid())));

CREATE POLICY category_budgets_insert ON category_budgets
  FOR INSERT TO authenticated
  WITH CHECK (family_id = (SELECT get_user_family_id(auth.uid())));

CREATE POLICY category_budgets_update ON category_budgets
  FOR UPDATE TO authenticated
  USING      (family_id = (SELECT get_user_family_id(auth.uid())))
  WITH CHECK (family_id = (SELECT get_user_family_id(auth.uid())));

CREATE POLICY category_budgets_delete ON category_budgets
  FOR DELETE TO authenticated
  USING (family_id = (SELECT get_user_family_id(auth.uid())));
