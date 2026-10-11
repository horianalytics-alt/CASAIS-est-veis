-- Funções transacionais. Toda gravação de lançamento passa por aqui: grava
-- tudo ou nada, e o autor vem sempre de auth.uid(), nunca do cliente.

-- ---------------------------------------------------------------------------
-- Código de convite sem caracteres ambíguos (sem 0/O/1/I)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION generate_join_code()
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  charset  text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code     text := '';
BEGIN
  FOR _ IN 1..6 LOOP
    code := code || substr(charset, 1 + floor(random() * length(charset))::int, 1);
  END LOOP;
  RETURN code;
END;
$$;

REVOKE EXECUTE ON FUNCTION generate_join_code() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Cadastros padrão de uma família nova
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION seed_family_defaults(p_family_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  INSERT INTO categories (family_id, name, type, icon, sort_order) VALUES
    (p_family_id, 'Moradia',       'despesa',      'home',       1),
    (p_family_id, 'Alimentação',   'despesa',      'utensils',   2),
    (p_family_id, 'Mercado',       'despesa',      'shopping',   3),
    (p_family_id, 'Transporte',    'despesa',      'car',        4),
    (p_family_id, 'Saúde',         'despesa',      'heart',      5),
    (p_family_id, 'Educação',      'despesa',      'book',       6),
    (p_family_id, 'Lazer',         'despesa',      'smile',      7),
    (p_family_id, 'Assinaturas',   'despesa',      'repeat',     8),
    (p_family_id, 'Roupas',        'despesa',      'shirt',      9),
    (p_family_id, 'Bobeiras',      'despesa',      'cookie',    10),
    (p_family_id, 'Salário',       'receita',      'wallet',     1),
    (p_family_id, 'Freelance',     'receita',      'briefcase',  2),
    (p_family_id, 'Reserva',       'investimento', 'shield',     1),
    (p_family_id, 'Renda fixa',    'investimento', 'landmark',   2),
    (p_family_id, 'Outros',        'todos',        'circle',    99);

  INSERT INTO payment_methods (family_id, name, sort_order) VALUES
    (p_family_id, 'Pix',       1),
    (p_family_id, 'Débito',    2),
    (p_family_id, 'Crédito',   3),
    (p_family_id, 'Dinheiro',  4),
    (p_family_id, 'Boleto',    5),
    (p_family_id, 'Benefício', 6);
END;
$$;

REVOKE EXECUTE ON FUNCTION seed_family_defaults(uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- create_family — cria a casa, o primeiro membro, os cadastros e a conta dele
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_family(
  p_family_name    text,
  p_split_rule     text,
  p_member_name    text,
  p_monthly_income numeric DEFAULT NULL
)
RETURNS TABLE (family_id uuid, member_id uuid, join_code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_family_id uuid;
  v_member_id uuid;
  v_code      text;
  v_attempts  int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Você precisa estar logado para criar uma família';
  END IF;

  IF EXISTS (SELECT 1 FROM family_members WHERE user_id = v_uid) THEN
    RAISE EXCEPTION 'Você já faz parte de uma família';
  END IF;

  IF p_split_rule NOT IN ('equal', 'proportional') THEN
    RAISE EXCEPTION 'Regra de divisão inválida';
  END IF;

  LOOP
    v_code := generate_join_code();
    EXIT WHEN NOT EXISTS (SELECT 1 FROM families WHERE families.join_code = v_code);
    v_attempts := v_attempts + 1;
    IF v_attempts > 50 THEN
      RAISE EXCEPTION 'Não foi possível gerar um código de convite';
    END IF;
  END LOOP;

  INSERT INTO families (name, join_code, split_rule)
  VALUES (btrim(p_family_name), v_code, p_split_rule)
  RETURNING id INTO v_family_id;

  INSERT INTO family_members (family_id, user_id, display_name, monthly_income)
  VALUES (v_family_id, v_uid, btrim(p_member_name), p_monthly_income)
  RETURNING id INTO v_member_id;

  PERFORM seed_family_defaults(v_family_id);

  INSERT INTO accounts (family_id, owner_member_id, name, type, initial_balance, sort_order)
  VALUES (v_family_id, v_member_id, 'Conta de ' || btrim(p_member_name), 'corrente', 0, 1);

  RETURN QUERY SELECT v_family_id, v_member_id, v_code;
END;
$$;

REVOKE EXECUTE ON FUNCTION create_family(text, text, text, numeric) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION create_family(text, text, text, numeric) TO authenticated;

-- ---------------------------------------------------------------------------
-- join_family — entra pelo código, respeitando o limite de membros
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION join_family(
  p_join_code      text,
  p_member_name    text,
  p_monthly_income numeric DEFAULT NULL
)
RETURNS TABLE (family_id uuid, member_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_family_id uuid;
  v_limit     int;
  v_count     int;
  v_member_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Você precisa estar logado para entrar em uma família';
  END IF;

  IF EXISTS (SELECT 1 FROM family_members WHERE user_id = v_uid) THEN
    RAISE EXCEPTION 'Você já faz parte de uma família';
  END IF;

  -- FOR UPDATE serializa duas entradas simultâneas: o limite não é furado
  -- por dois convites aceitos no mesmo instante.
  SELECT f.id, f.member_limit INTO v_family_id, v_limit
  FROM families f
  WHERE f.join_code = upper(btrim(p_join_code))
  FOR UPDATE;

  IF v_family_id IS NULL THEN
    RAISE EXCEPTION 'Código de convite não encontrado';
  END IF;

  SELECT count(*) INTO v_count FROM family_members WHERE family_members.family_id = v_family_id;

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'Esta família já está completa';
  END IF;

  INSERT INTO family_members (family_id, user_id, display_name, monthly_income)
  VALUES (v_family_id, v_uid, btrim(p_member_name), p_monthly_income)
  RETURNING id INTO v_member_id;

  INSERT INTO accounts (family_id, owner_member_id, name, type, initial_balance, sort_order)
  VALUES (v_family_id, v_member_id, 'Conta de ' || btrim(p_member_name), 'corrente', 0, 2);

  RETURN QUERY SELECT v_family_id, v_member_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION join_family(text, text, numeric) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION join_family(text, text, numeric) TO authenticated;

-- ---------------------------------------------------------------------------
-- family_preview — mostra o nome da casa antes de entrar, sem vazar dado
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION family_preview(p_join_code text)
RETURNS TABLE (name text, member_count int, member_limit int, has_room boolean)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    f.name,
    (SELECT count(*)::int FROM family_members m WHERE m.family_id = f.id),
    f.member_limit,
    (SELECT count(*) FROM family_members m WHERE m.family_id = f.id) < f.member_limit
  FROM families f
  WHERE f.join_code = upper(btrim(p_join_code));
$$;

REVOKE EXECUTE ON FUNCTION family_preview(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION family_preview(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- save_transactions — grava lote e parcelas numa transação só
--
-- Cada item do array é um lançamento. Quando recurrence_months > 1, a função
-- gera as parcelas aqui dentro: a 1ª vira a mãe da série e as demais
-- apontam para ela, para que "excluir série" funcione depois.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION save_transactions(p_items jsonb)
RETURNS SETOF transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_family_id  uuid;
  v_member_id  uuid;
  v_item       jsonb;
  v_months     int;
  v_index      int;
  v_parent     uuid;
  v_date       date;
  v_paid_by    uuid;
  v_owner      uuid;
  v_account    uuid;
  v_closing    int;
  v_invoice_y  int;
  v_invoice_m  int;
  v_is_paid    boolean;
  v_row        transactions;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Você precisa estar logado';
  END IF;

  SELECT m.family_id, m.id INTO v_family_id, v_member_id
  FROM family_members m WHERE m.user_id = v_uid;

  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'Você não faz parte de nenhuma família';
  END IF;

  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Nenhum lançamento recebido';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_months  := COALESCE((v_item->>'recurrence_months')::int, 1);
    v_account := (v_item->>'account_id')::uuid;
    v_is_paid := COALESCE((v_item->>'is_paid')::boolean, false);

    IF v_months < 1 OR v_months > 120 THEN
      RAISE EXCEPTION 'Número de parcelas inválido: %', v_months;
    END IF;

    -- Quem pagou: o informado, ou quem está lançando.
    v_paid_by := COALESCE((v_item->>'paid_by_member_id')::uuid, v_member_id);
    v_owner   := (v_item->>'owner_member_id')::uuid;

    -- A conta precisa ser da família de quem lança. A FK composta também
    -- garantiria, mas aqui a mensagem de erro é compreensível.
    SELECT a.closing_day INTO v_closing
    FROM accounts a
    WHERE a.id = v_account AND a.family_id = v_family_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Conta não encontrada nesta família';
    END IF;

    v_parent := NULL;

    FOR v_index IN 1..v_months LOOP
      -- Parcela N cai N-1 meses depois, sem transbordar o fim do mês.
      v_date := (
        date_trunc('month', (v_item->>'date')::date)
        + make_interval(months => v_index - 1)
      )::date
      + LEAST(
          EXTRACT(DAY FROM (v_item->>'date')::date)::int,
          EXTRACT(DAY FROM (
            date_trunc('month', (v_item->>'date')::date)
            + make_interval(months => v_index - 1)
            + interval '1 month - 1 day'
          ))::int
        ) - 1;

      -- Fatura: a compra no dia do fechamento já é do ciclo seguinte.
      IF v_closing IS NOT NULL THEN
        IF EXTRACT(DAY FROM v_date)::int < v_closing THEN
          v_invoice_y := EXTRACT(YEAR  FROM v_date)::int;
          v_invoice_m := EXTRACT(MONTH FROM v_date)::int;
        ELSE
          v_invoice_y := EXTRACT(YEAR  FROM (v_date + interval '1 month'))::int;
          v_invoice_m := EXTRACT(MONTH FROM (v_date + interval '1 month'))::int;
        END IF;
      ELSE
        v_invoice_y := NULL;
        v_invoice_m := NULL;
      END IF;

      INSERT INTO transactions (
        family_id, type, description, amount, date,
        account_id, to_account_id,
        owner_member_id, owner_share,
        created_by_member_id, paid_by_member_id,
        category_id, payment_method_id,
        is_paid, paid_date, notes,
        is_benefit, is_futile, futile_label,
        recurrence_months, recurrence_index, recurrence_parent_id,
        invoice_year, invoice_month
      ) VALUES (
        v_family_id,
        v_item->>'type',
        btrim(v_item->>'description'),
        (v_item->>'amount')::numeric,
        v_date,
        v_account,
        (v_item->>'to_account_id')::uuid,
        v_owner,
        (v_item->>'owner_share')::numeric,
        v_member_id,
        v_paid_by,
        (v_item->>'category_id')::uuid,
        (v_item->>'payment_method_id')::uuid,
        -- Só a 1ª parcela pode nascer paga; as futuras não foram pagas ainda.
        (v_is_paid AND v_index = 1),
        CASE WHEN (v_is_paid AND v_index = 1)
             THEN COALESCE((v_item->>'paid_date')::date, v_date)
             ELSE NULL END,
        v_item->>'notes',
        COALESCE((v_item->>'is_benefit')::boolean, false),
        COALESCE((v_item->>'is_futile')::boolean,  false),
        CASE WHEN COALESCE((v_item->>'is_futile')::boolean, false)
             THEN v_item->>'futile_label' ELSE NULL END,
        CASE WHEN v_months > 1 THEN v_months ELSE NULL END,
        CASE WHEN v_months > 1 THEN v_index  ELSE NULL END,
        v_parent,
        v_invoice_y,
        v_invoice_m
      )
      RETURNING * INTO v_row;

      IF v_index = 1 AND v_months > 1 THEN
        v_parent := v_row.id;
      END IF;

      RETURN NEXT v_row;
    END LOOP;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION save_transactions(jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION save_transactions(jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- delete_transactions — apaga um lançamento ou a série inteira
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION delete_transactions(p_id uuid, p_scope text DEFAULT 'single')
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_family_id uuid := get_user_family_id(auth.uid());
  v_parent    uuid;
  v_deleted   int;
BEGIN
  IF v_family_id IS NULL THEN
    RAISE EXCEPTION 'Você não faz parte de nenhuma família';
  END IF;

  IF p_scope NOT IN ('single', 'series') THEN
    RAISE EXCEPTION 'Escopo inválido';
  END IF;

  IF p_scope = 'series' THEN
    SELECT COALESCE(t.recurrence_parent_id, t.id) INTO v_parent
    FROM transactions t
    WHERE t.id = p_id AND t.family_id = v_family_id;

    IF v_parent IS NULL THEN
      RAISE EXCEPTION 'Lançamento não encontrado';
    END IF;

    DELETE FROM transactions t
    WHERE t.family_id = v_family_id
      AND (t.id = v_parent OR t.recurrence_parent_id = v_parent);
  ELSE
    DELETE FROM transactions t
    WHERE t.id = p_id AND t.family_id = v_family_id;
  END IF;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted = 0 THEN
    RAISE EXCEPTION 'Lançamento não encontrado';
  END IF;

  RETURN v_deleted;
END;
$$;

REVOKE EXECUTE ON FUNCTION delete_transactions(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION delete_transactions(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- pay_invoice — paga a fatura: debita a conta corrente e quita os lançamentos
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pay_invoice(
  p_card_account_id uuid,
  p_from_account_id uuid,
  p_invoice_year    int,
  p_invoice_month   int,
  p_date            date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_family_id uuid;
  v_member_id uuid;
  v_total     numeric(14,2);
  v_date      date;
  v_tx_id     uuid;
BEGIN
  SELECT m.family_id, m.id INTO v_family_id, v_member_id
  FROM family_members m WHERE m.user_id = v_uid;

  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'Você não faz parte de nenhuma família';
  END IF;

  v_date := COALESCE(p_date, CURRENT_DATE);

  IF NOT EXISTS (
    SELECT 1 FROM accounts a
    WHERE a.id = p_card_account_id AND a.family_id = v_family_id AND a.type = 'cartao'
  ) THEN
    RAISE EXCEPTION 'Cartão não encontrado nesta família';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM accounts a
    WHERE a.id = p_from_account_id AND a.family_id = v_family_id AND a.type <> 'cartao'
  ) THEN
    RAISE EXCEPTION 'Conta de origem inválida';
  END IF;

  SELECT COALESCE(sum(t.amount), 0) INTO v_total
  FROM transactions t
  WHERE t.family_id     = v_family_id
    AND t.account_id    = p_card_account_id
    AND t.invoice_year  = p_invoice_year
    AND t.invoice_month = p_invoice_month
    AND t.is_paid       = false
    AND t.type IN ('despesa', 'investimento');

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Esta fatura não tem valor em aberto';
  END IF;

  INSERT INTO transactions (
    family_id, type, description, amount, date,
    account_id, to_account_id,
    created_by_member_id, paid_by_member_id,
    is_paid, paid_date
  ) VALUES (
    v_family_id, 'transferencia',
    'Pagamento de fatura', v_total, v_date,
    p_from_account_id, p_card_account_id,
    v_member_id, v_member_id,
    true, v_date
  )
  RETURNING id INTO v_tx_id;

  UPDATE transactions t
  SET is_paid = true, paid_date = v_date
  WHERE t.family_id     = v_family_id
    AND t.account_id    = p_card_account_id
    AND t.invoice_year  = p_invoice_year
    AND t.invoice_month = p_invoice_month
    AND t.is_paid       = false
    AND t.type IN ('despesa', 'investimento');

  RETURN v_tx_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION pay_invoice(uuid, uuid, int, int, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION pay_invoice(uuid, uuid, int, int, date) TO authenticated;

-- ---------------------------------------------------------------------------
-- settle_up — registra o acerto como transferência entre as contas dos dois
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION settle_up(
  p_from_member_id uuid,
  p_to_member_id   uuid,
  p_amount         numeric,
  p_date           date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_family_id    uuid;
  v_member_id    uuid;
  v_from_account uuid;
  v_to_account   uuid;
  v_date         date;
  v_tx_id        uuid;
BEGIN
  SELECT m.family_id, m.id INTO v_family_id, v_member_id
  FROM family_members m WHERE m.user_id = v_uid;

  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'Você não faz parte de nenhuma família';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Valor do acerto precisa ser maior que zero';
  END IF;

  IF p_from_member_id = p_to_member_id THEN
    RAISE EXCEPTION 'O acerto precisa ser entre duas pessoas diferentes';
  END IF;

  v_date := COALESCE(p_date, CURRENT_DATE);

  SELECT a.id INTO v_from_account
  FROM accounts a
  WHERE a.family_id = v_family_id
    AND a.owner_member_id = p_from_member_id
    AND a.type = 'corrente'
    AND a.archived_at IS NULL
  ORDER BY a.sort_order, a.created_at
  LIMIT 1;

  SELECT a.id INTO v_to_account
  FROM accounts a
  WHERE a.family_id = v_family_id
    AND a.owner_member_id = p_to_member_id
    AND a.type = 'corrente'
    AND a.archived_at IS NULL
  ORDER BY a.sort_order, a.created_at
  LIMIT 1;

  IF v_from_account IS NULL OR v_to_account IS NULL THEN
    RAISE EXCEPTION 'Cada pessoa precisa de uma conta corrente para acertar';
  END IF;

  INSERT INTO transactions (
    family_id, type, description, amount, date,
    account_id, to_account_id,
    created_by_member_id, paid_by_member_id,
    is_paid, paid_date
  ) VALUES (
    v_family_id, 'transferencia',
    'Acerto de contas', p_amount, v_date,
    v_from_account, v_to_account,
    v_member_id, p_from_member_id,
    true, v_date
  )
  RETURNING id INTO v_tx_id;

  RETURN v_tx_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION settle_up(uuid, uuid, numeric, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION settle_up(uuid, uuid, numeric, date) TO authenticated;
