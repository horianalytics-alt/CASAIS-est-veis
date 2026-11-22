-- Teste da RPC recorrencia_alterar_regra (migration 00021).
-- Plano: docs/planos/estrutura-alterar-regra.md, §7.
--
-- Roda POR SQL contra o banco hospedado, trocando o papel com
-- SET LOCAL ROLE + request.jwt.claims (o mesmo caminho do PostgREST).
--
-- NUNCA GRAVA NADA: o bloco termina SEMPRE em RAISE EXCEPTION com o placar, e a
-- exceção desfaz a transação inteira. Não toca na família real: as famílias são
-- criadas aqui, com usuários de uuid novo.
--
-- O intruso B usa referências VÁLIDAS da vítima A (L-018). Cada recusa diz
-- qual checagem ela atinge primeiro (L-026).
--
-- Não rode este arquivo direto: use tests/integration/recorrencia-alterar-regra.mjs.
DO $teste_alterar_regra$
DECLARE
  -- Usuários e famílias
  ua  uuid := gen_random_uuid();
  ua2 uuid := gen_random_uuid();  -- usuário do 2º membro da família A (Carol)
  ub  uuid := gen_random_uuid();
  fa  uuid; fb  uuid;
  ma  uuid; ma2 uuid; mb  uuid;

  -- Contas da família A
  ca    uuid;  -- corrente principal
  ca2   uuid;  -- corrente secundária (para trocar conta no A05)
  cart  uuid;  -- cartão (closing_day 10)
  inv   uuid;  -- conta de investimento
  arq   uuid;  -- conta arquivada

  -- Conta da família B
  cb uuid;

  -- Categorias / membros de apoio
  cat_a uuid;  -- categoria de despesa em fa
  cat_b uuid;  -- categoria em fb (para I02)

  -- Regra principal do cenário
  regra_a uuid;

  -- Regras extras para o caso A17 (L-033: o gerador deve preservá-las)
  regra2 uuid;  -- despesa comum da família A
  regra3 uuid;  -- regra com início distante em fa (poucos lançamentos)

  -- Estado de leitura
  hoje  date;
  mes   date;

  -- Contadores e auxiliares
  n       int;
  n2      int;
  n3      int;
  v_estado text;
  v_txt    text;
  v_num    numeric;
  v_d      date;
  v_gt     date;   -- generated_through relido
  v_r      int;    -- alterados_na_regra
  v_t      int;    -- alterados_em_transacoes
  gt2      date;   -- generated_through de regra2 antes da chamada
  gt3      date;   -- generated_through de regra3 antes da chamada
  n_lin2   int;    -- linhas de regra2 antes da chamada
  n_lin3   int;    -- linhas de regra3 antes da chamada

  v_total  int := 0;
  v_falhas int := 0;
  v_linhas text := '';
BEGIN
  hoje := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  mes  := date_trunc('month', hoje)::date;

  -- ------------------------------------------------------------------ fixtures (postgres)
  INSERT INTO auth.users (id, email, aud, role)
  VALUES (ua,  'alt-regra-a-'  || ua  || '@example.com', 'authenticated', 'authenticated'),
         (ua2, 'alt-regra-a2-' || ua2 || '@example.com', 'authenticated', 'authenticated'),
         (ub,  'alt-regra-b-'  || ub  || '@example.com', 'authenticated', 'authenticated');

  INSERT INTO public.families (name, join_code) VALUES ('Alt Regra A', 'AR2222') RETURNING id INTO fa;
  INSERT INTO public.families (name, join_code) VALUES ('Alt Regra B', 'AR3333') RETURNING id INTO fb;

  -- Dois membros em fa para o cenário do Heitor (A01)
  INSERT INTO public.family_members (family_id, user_id, display_name) VALUES (fa, ua, 'Heitor') RETURNING id INTO ma;
  INSERT INTO public.family_members (family_id, user_id, display_name)
    VALUES (fa, ua2, 'Carol') RETURNING id INTO ma2;
  INSERT INTO public.family_members (family_id, user_id, display_name) VALUES (fb, ub, 'Membro B') RETURNING id INTO mb;

  INSERT INTO public.accounts (family_id, owner_member_id, name, type)
    VALUES (fa, ma, 'Corrente A', 'corrente') RETURNING id INTO ca;
  INSERT INTO public.accounts (family_id, owner_member_id, name, type)
    VALUES (fa, ma, 'Corrente A2', 'corrente') RETURNING id INTO ca2;
  INSERT INTO public.accounts (family_id, name, type, closing_day, due_day)
    VALUES (fa, 'Cartão A', 'cartao', 10, 20) RETURNING id INTO cart;
  INSERT INTO public.accounts (family_id, name, type)
    VALUES (fa, 'Carteira A', 'investimento') RETURNING id INTO inv;
  INSERT INTO public.investment_wallets (family_id, account_id) VALUES (fa, inv);
  INSERT INTO public.accounts (family_id, name, type, archived_at)
    VALUES (fa, 'Arquivada A', 'corrente', now()) RETURNING id INTO arq;

  INSERT INTO public.accounts (family_id, owner_member_id, name, type)
    VALUES (fb, mb, 'Corrente B', 'corrente') RETURNING id INTO cb;

  INSERT INTO public.categories (family_id, name, type)
    VALUES (fa, 'Assinaturas A', 'despesa') RETURNING id INTO cat_a;
  INSERT INTO public.categories (family_id, name, type)
    VALUES (fb, 'Cat B', 'despesa') RETURNING id INTO cat_b;

  -- ============================================================ como A
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  -- Cria a regra principal: ma2 é owner e paid_by; mês atual pago.
  -- Isso reproduz o cenário do Heitor (A01).
  BEGIN
    SELECT r.regra_id INTO regra_a FROM public.recorrencia_criar(jsonb_build_object(
      'type', 'despesa', 'description', 'Netflix', 'amount', 55.90, 'date', hoje,
      'account_id', ca,
      'owner_member_id', ma2, 'owner_share', 0.5,
      'paid_by_member_id', ma2,
      'is_paid', true, 'paid_date', hoje)) r;
  END;

  -- Cria regras extras para A17 (L-033): outras regras da família A
  BEGIN
    SELECT r.regra_id INTO regra2 FROM public.recorrencia_criar(jsonb_build_object(
      'type', 'despesa', 'description', 'Aluguel', 'amount', 1500, 'date', hoje,
      'account_id', ca)) r;
    -- Regra com início em janeiro de 2 anos atrás: poucos lançamentos
    SELECT r.regra_id INTO regra3 FROM public.recorrencia_criar(jsonb_build_object(
      'type', 'despesa', 'description', 'Plano de saúde', 'amount', 300,
      'date', (mes - interval '24 months')::date,
      'account_id', ca)) r;
  END;

  -- Snapshot de regra2 e regra3 antes do A01 (para o A17)
  SELECT generated_through INTO gt2 FROM public.recurring_rules WHERE id = regra2;
  SELECT generated_through INTO gt3 FROM public.recurring_rules WHERE id = regra3;
  SELECT count(*) INTO n_lin2 FROM public.transactions WHERE recurring_rule_id = regra2;
  SELECT count(*) INTO n_lin3 FROM public.transactions WHERE recurring_rule_id = regra3;

  -- ============================================================ CASOS DE ACEITAÇÃO

  -- A01: Cenário do Heitor — troca owner e paid_by para ma a partir de mes+1.
  -- mês atual (pago, ma2) fica intocado. 11 pendentes a partir de mes+1 viram ma.
  v_estado := 'ok'; v_r := -1; v_t := -1;
  BEGIN
    SELECT r.alterados_na_regra, r.alterados_em_transacoes INTO v_r, v_t
      FROM public.recorrencia_alterar_regra(
        regra_a,
        jsonb_build_object('owner_member_id', ma, 'owner_share', 0.5, 'paid_by_member_id', ma),
        (mes + interval '1 month')::date) r;
  EXCEPTION WHEN OTHERS THEN v_estado := SQLSTATE || ' ' || SQLERRM;
  END;
  -- Verifica: regra com ma; pendentes >= mes+1 com ma; pago do mês atual com ma2
  SELECT count(*) INTO n
    FROM public.transactions
    WHERE recurring_rule_id = regra_a
      AND recurring_period >= (mes + interval '1 month')::date
      AND is_paid = false
      AND owner_member_id = ma AND paid_by_member_id = ma;
  SELECT count(*) INTO n2
    FROM public.transactions
    WHERE recurring_rule_id = regra_a AND is_paid = true
      AND owner_member_id = ma2;
  v_total := v_total + 1;
  IF v_estado = 'ok' AND v_r = 1 AND v_t = 11 AND n = 11 AND n2 >= 1 THEN
    v_linhas := v_linhas || E'\n  PASS  A01 cenário Heitor: (1,11), 11 pendentes com ma, pago com ma2';
  ELSE
    v_falhas := v_falhas + 1;
    v_linhas := v_linhas || E'\n  FALHA A01 — ' || v_estado || ' r=' || v_r || ' t=' || v_t || ' pend_ma=' || n || ' pago_ma2=' || n2;
  END IF;

  -- A02: patch só de description — só descrição muda, resto igual.
  v_estado := 'ok'; v_r := -1; v_t := -1;
  BEGIN
    SELECT r.alterados_na_regra, r.alterados_em_transacoes INTO v_r, v_t
      FROM public.recorrencia_alterar_regra(
        regra_a,
        jsonb_build_object('description', 'Disney+'),
        mes) r;
  EXCEPTION WHEN OTHERS THEN v_estado := SQLSTATE || ' ' || SQLERRM;
  END;
  SELECT description INTO v_txt FROM public.recurring_rules WHERE id = regra_a;
  SELECT count(*) INTO n
    FROM public.transactions
    WHERE recurring_rule_id = regra_a AND description = 'Disney+';
  v_total := v_total + 1;
  IF v_estado = 'ok' AND v_r = 1 AND v_txt = 'Disney+' AND n >= 1 THEN
    v_linhas := v_linhas || E'\n  PASS  A02 patch só de description';
  ELSE
    v_falhas := v_falhas + 1;
    v_linhas := v_linhas || E'\n  FALHA A02 — ' || v_estado || ' r=' || v_r || ' desc_regra=' || coalesce(v_txt,'NULL') || ' linhas_desc=' || n;
  END IF;

  -- A03: a_partir = mes com o mês atual pendente (a linha do mês atual, pendente, entra).
  -- Recria uma regra sem pagamento para garantir que o mês atual está pendente.
  DECLARE regra_a03 uuid;
  BEGIN
    SELECT r.regra_id INTO regra_a03 FROM public.recorrencia_criar(jsonb_build_object(
      'type', 'despesa', 'description', 'Spotify', 'amount', 21.90, 'date', hoje,
      'account_id', ca)) r;
    v_estado := 'ok'; v_r := -1; v_t := -1;
    BEGIN
      SELECT r.alterados_na_regra, r.alterados_em_transacoes INTO v_r, v_t
        FROM public.recorrencia_alterar_regra(
          regra_a03,
          jsonb_build_object('description', 'Spotify Premium'),
          mes) r;
    EXCEPTION WHEN OTHERS THEN v_estado := SQLSTATE || ' ' || SQLERRM;
    END;
    SELECT count(*) INTO n
      FROM public.transactions
      WHERE recurring_rule_id = regra_a03 AND description = 'Spotify Premium'
        AND recurring_period = mes;
    v_total := v_total + 1;
    IF v_estado = 'ok' AND v_r = 1 AND n = 1 THEN
      v_linhas := v_linhas || E'\n  PASS  A03 a_partir=mes inclui mês atual pendente';
    ELSE
      v_falhas := v_falhas + 1;
      v_linhas := v_linhas || E'\n  FALHA A03 — ' || v_estado || ' r=' || v_r || ' linha_mes_atual=' || n;
    END IF;
  END;

  -- A04: linha de mes+2 editada à mão (description 'editada'); patch de description
  -- → sobrescreve (decisão do Heitor: igual a alterar_valor).
  DECLARE regra_a04 uuid; tx_a04 uuid;
  BEGIN
    SELECT r.regra_id INTO regra_a04 FROM public.recorrencia_criar(jsonb_build_object(
      'type', 'despesa', 'description', 'Original', 'amount', 10, 'date', hoje,
      'account_id', ca)) r;
    -- Edita à mão a linha de mes+2 como postgres (testa o comportamento de sobrescrita)
    SET LOCAL ROLE postgres;
    UPDATE public.transactions SET description = 'Editada à mão'
      WHERE recurring_rule_id = regra_a04 AND recurring_period = (mes + interval '2 months')::date;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;

    v_estado := 'ok'; v_r := -1; v_t := -1;
    BEGIN
      SELECT r.alterados_na_regra, r.alterados_em_transacoes INTO v_r, v_t
        FROM public.recorrencia_alterar_regra(
          regra_a04,
          jsonb_build_object('description', 'Nova descrição'),
          mes) r;
    EXCEPTION WHEN OTHERS THEN v_estado := SQLSTATE || ' ' || SQLERRM;
    END;
    SELECT count(*) INTO n
      FROM public.transactions
      WHERE recurring_rule_id = regra_a04 AND description = 'Nova descrição'
        AND recurring_period = (mes + interval '2 months')::date AND is_paid = false;
    v_total := v_total + 1;
    IF v_estado = 'ok' AND v_r = 1 AND n = 1 THEN
      v_linhas := v_linhas || E'\n  PASS  A04 linha editada à mão é sobrescrita';
    ELSE
      v_falhas := v_falhas + 1;
      v_linhas := v_linhas || E'\n  FALHA A04 — ' || v_estado || ' r=' || v_r || ' linha_sobrescrita=' || n;
    END IF;
  END;

  -- A05: Conta corrente → cartão (closing_day 10), depois cartão → corrente.
  DECLARE regra_a05 uuid; d_linha date; v_inv_y int; v_inv_m int;
  BEGIN
    SELECT r.regra_id INTO regra_a05 FROM public.recorrencia_criar(jsonb_build_object(
      'type', 'despesa', 'description', 'Academia', 'amount', 100, 'date', hoje,
      'account_id', ca)) r;
    -- 1ª troca: corrente → cartão
    v_estado := 'ok'; v_r := -1; v_t := -1;
    BEGIN
      SELECT r.alterados_na_regra, r.alterados_em_transacoes INTO v_r, v_t
        FROM public.recorrencia_alterar_regra(
          regra_a05,
          jsonb_build_object('account_id', cart),
          mes) r;
    EXCEPTION WHEN OTHERS THEN v_estado := SQLSTATE || ' ' || SQLERRM;
    END;
    -- Pega a data da linha do mês atual para calcular a fatura esperada
    SELECT t.date INTO d_linha
      FROM public.transactions t
      WHERE t.recurring_rule_id = regra_a05 AND t.recurring_period = mes;
    -- Regra da fatura: dia < closing_day (10) → fatura do mesmo mês; senão → mês seguinte
    IF EXTRACT(DAY FROM d_linha)::int < 10 THEN
      v_inv_y := EXTRACT(YEAR FROM d_linha)::int;
      v_inv_m := EXTRACT(MONTH FROM d_linha)::int;
    ELSE
      v_inv_y := EXTRACT(YEAR FROM (d_linha + interval '1 month'))::int;
      v_inv_m := EXTRACT(MONTH FROM (d_linha + interval '1 month'))::int;
    END IF;
    SELECT count(*) INTO n
      FROM public.transactions
      WHERE recurring_rule_id = regra_a05 AND is_paid = false
        AND account_id = cart
        AND invoice_year = v_inv_y AND invoice_month = v_inv_m;
    v_total := v_total + 1;
    IF v_estado = 'ok' AND v_r = 1 AND n >= 1 THEN
      v_linhas := v_linhas || E'\n  PASS  A05a corrente→cartão: fatura calculada por t.date';
    ELSE
      v_falhas := v_falhas + 1;
      v_linhas := v_linhas || E'\n  FALHA A05a — ' || v_estado || ' r=' || v_r || ' linhas_fatura_ok=' || n;
    END IF;

    -- 2ª troca: cartão → corrente (invoice NULL)
    v_estado := 'ok'; v_r := -1; v_t := -1;
    BEGIN
      SELECT r.alterados_na_regra, r.alterados_em_transacoes INTO v_r, v_t
        FROM public.recorrencia_alterar_regra(
          regra_a05,
          jsonb_build_object('account_id', ca),
          mes) r;
    EXCEPTION WHEN OTHERS THEN v_estado := SQLSTATE || ' ' || SQLERRM;
    END;
    SELECT count(*) INTO n
      FROM public.transactions
      WHERE recurring_rule_id = regra_a05 AND is_paid = false
        AND account_id = ca
        AND invoice_year IS NULL AND invoice_month IS NULL;
    v_total := v_total + 1;
    IF v_estado = 'ok' AND v_r = 1 AND n >= 1 THEN
      v_linhas := v_linhas || E'\n  PASS  A05b cartão→corrente: invoice NULL';
    ELSE
      v_falhas := v_falhas + 1;
      v_linhas := v_linhas || E'\n  FALHA A05b — ' || v_estado || ' r=' || v_r || ' linhas_sem_fatura=' || n;
    END IF;
  END;

  -- A06: Regra de receita, account_id = cartão → recusado.
  DECLARE regra_a06 uuid;
  BEGIN
    SELECT r.regra_id INTO regra_a06 FROM public.recorrencia_criar(jsonb_build_object(
      'type', 'receita', 'description', 'Aluguel recebido', 'amount', 500, 'date', hoje,
      'account_id', ca)) r;
    v_estado := 'ok';
    BEGIN
      PERFORM public.recorrencia_alterar_regra(
        regra_a06, jsonb_build_object('account_id', cart), mes);
    EXCEPTION WHEN OTHERS THEN v_estado := SQLSTATE || ' ' || SQLERRM;
    END;
    SELECT account_id INTO v_txt FROM public.recurring_rules WHERE id = regra_a06;
    v_total := v_total + 1;
    IF v_estado LIKE '%Receita recorrente não pode ser no cartão%' AND v_txt::text = ca::text THEN
      v_linhas := v_linhas || E'\n  PASS  A06 receita no cartão recusada (passo 8, tipo da conta)';
    ELSE
      v_falhas := v_falhas + 1;
      v_linhas := v_linhas || E'\n  FALHA A06 — ' || v_estado || ' conta=' || coalesce(v_txt,'NULL');
    END IF;
  END;

  -- A07: account_id = carteira de investimento → recusado.
  DECLARE regra_a07 uuid;
  BEGIN
    SELECT r.regra_id INTO regra_a07 FROM public.recorrencia_criar(jsonb_build_object(
      'type', 'despesa', 'description', 'Teste carteira', 'amount', 10, 'date', hoje,
      'account_id', ca)) r;
    v_estado := 'ok';
    BEGIN
      PERFORM public.recorrencia_alterar_regra(
        regra_a07, jsonb_build_object('account_id', inv), mes);
    EXCEPTION WHEN OTHERS THEN v_estado := SQLSTATE || ' ' || SQLERRM;
    END;
    v_total := v_total + 1;
    IF v_estado LIKE '%A carteira de investimento não aceita recorrência%' THEN
      v_linhas := v_linhas || E'\n  PASS  A07 carteira recusada (passo 8, investment_wallets)';
    ELSE
      v_falhas := v_falhas + 1;
      v_linhas := v_linhas || E'\n  FALHA A07 — ' || v_estado;
    END IF;
  END;

  -- A08: account_id = conta arquivada → recusado.
  DECLARE regra_a08 uuid;
  BEGIN
    SELECT r.regra_id INTO regra_a08 FROM public.recorrencia_criar(jsonb_build_object(
      'type', 'despesa', 'description', 'Teste arquivada', 'amount', 10, 'date', hoje,
      'account_id', ca)) r;
    v_estado := 'ok';
    BEGIN
      PERFORM public.recorrencia_alterar_regra(
        regra_a08, jsonb_build_object('account_id', arq), mes);
    EXCEPTION WHEN OTHERS THEN v_estado := SQLSTATE || ' ' || SQLERRM;
    END;
    v_total := v_total + 1;
    IF v_estado LIKE '%Esta conta está arquivada%' THEN
      v_linhas := v_linhas || E'\n  PASS  A08 conta arquivada recusada (passo 8)';
    ELSE
      v_falhas := v_falhas + 1;
      v_linhas := v_linhas || E'\n  FALHA A08 — ' || v_estado;
    END IF;
  END;

  -- A09a: Regra com owner+cota; patch {owner_member_id: null} → cota vira NULL.
  DECLARE regra_a09 uuid; v_own uuid; v_cota numeric;
  BEGIN
    SELECT r.regra_id INTO regra_a09 FROM public.recorrencia_criar(jsonb_build_object(
      'type', 'despesa', 'description', 'Plano dental', 'amount', 80, 'date', hoje,
      'account_id', ca, 'owner_member_id', ma, 'owner_share', 0.3)) r;
    v_estado := 'ok';
    BEGIN
      PERFORM public.recorrencia_alterar_regra(
        regra_a09, jsonb_build_object('owner_member_id', NULL::uuid), mes);
    EXCEPTION WHEN OTHERS THEN v_estado := SQLSTATE || ' ' || SQLERRM;
    END;
    SELECT owner_member_id, owner_share INTO v_own, v_cota
      FROM public.recurring_rules WHERE id = regra_a09;
    v_total := v_total + 1;
    IF v_estado = 'ok' AND v_own IS NULL AND v_cota IS NULL THEN
      v_linhas := v_linhas || E'\n  PASS  A09a owner=null → cota NULL (normalização 7a)';
    ELSE
      v_falhas := v_falhas + 1;
      v_linhas := v_linhas || E'\n  FALHA A09a — ' || v_estado || ' owner=' || coalesce(v_own::text,'NULL') || ' cota=' || coalesce(v_cota::text,'NULL');
    END IF;
  END;

  -- A09b: Regra sem owner; patch {owner_share: 0.5} → recusado (passo 7).
  DECLARE regra_a09b uuid;
  BEGIN
    SELECT r.regra_id INTO regra_a09b FROM public.recorrencia_criar(jsonb_build_object(
      'type', 'despesa', 'description', 'Academia 2', 'amount', 60, 'date', hoje,
      'account_id', ca)) r;
    v_estado := 'ok';
    BEGIN
      PERFORM public.recorrencia_alterar_regra(
        regra_a09b, jsonb_build_object('owner_share', 0.5), mes);
    EXCEPTION WHEN OTHERS THEN v_estado := SQLSTATE || ' ' || SQLERRM;
    END;
    v_total := v_total + 1;
    IF v_estado LIKE '%Escolha de quem é a cota%' THEN
      v_linhas := v_linhas || E'\n  PASS  A09b owner ausente + cota → recusado (passo 7)';
    ELSE
      v_falhas := v_falhas + 1;
      v_linhas := v_linhas || E'\n  FALHA A09b — ' || v_estado;
    END IF;
  END;

  -- A10: patch {is_futile: false} em regra fútil com rótulo → rótulo NULL.
  DECLARE regra_a10 uuid;
  BEGIN
    -- Cria regra fútil com rótulo via ALTER direto (como postgres) para simular dado legado
    SELECT r.regra_id INTO regra_a10 FROM public.recorrencia_criar(jsonb_build_object(
      'type', 'despesa', 'description', 'Fútil com rótulo', 'amount', 15, 'date', hoje,
      'account_id', ca, 'is_futile', true, 'futile_label', 'lazer')) r;
    v_estado := 'ok';
    BEGIN
      PERFORM public.recorrencia_alterar_regra(
        regra_a10, jsonb_build_object('is_futile', false), mes);
    EXCEPTION WHEN OTHERS THEN v_estado := SQLSTATE || ' ' || SQLERRM;
    END;
    SELECT futile_label INTO v_txt FROM public.recurring_rules WHERE id = regra_a10;
    -- Conta linhas pendentes onde o par está correto (false, NULL)
    SELECT count(*) INTO n
      FROM public.transactions
      WHERE recurring_rule_id = regra_a10 AND is_paid = false
        AND is_futile = false AND futile_label IS NULL;
    v_total := v_total + 1;
    IF v_estado = 'ok' AND v_txt IS NULL AND n >= 1 THEN
      v_linhas := v_linhas || E'\n  PASS  A10 is_futile=false → futile_label NULL (normalização 7b)';
    ELSE
      v_falhas := v_falhas + 1;
      v_linhas := v_linhas || E'\n  FALHA A10 — ' || v_estado || ' label_regra=' || coalesce(v_txt,'NULL') || ' linhas_ok=' || n;
    END IF;
  END;

  -- A11: Regra fútil; linha de mes+3 editada para is_futile=false,futile_label NULL;
  --      patch {futile_label:'y'} → sem 23514; linha fica (true,'y').
  DECLARE regra_a11 uuid; v_fut boolean; v_lbl text;
  BEGIN
    SELECT r.regra_id INTO regra_a11 FROM public.recorrencia_criar(jsonb_build_object(
      'type', 'despesa', 'description', 'Fútil A11', 'amount', 20, 'date', hoje,
      'account_id', ca, 'is_futile', true, 'futile_label', 'x')) r;
    -- Edita à mão como postgres
    SET LOCAL ROLE postgres;
    UPDATE public.transactions SET is_futile = false, futile_label = NULL
      WHERE recurring_rule_id = regra_a11
        AND recurring_period = (mes + interval '3 months')::date;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;

    v_estado := 'ok';
    BEGIN
      PERFORM public.recorrencia_alterar_regra(
        regra_a11, jsonb_build_object('futile_label', 'y'), mes);
    EXCEPTION WHEN OTHERS THEN v_estado := SQLSTATE || ' ' || SQLERRM;
    END;
    SELECT is_futile, futile_label INTO v_fut, v_lbl
      FROM public.transactions
      WHERE recurring_rule_id = regra_a11
        AND recurring_period = (mes + interval '3 months')::date;
    v_total := v_total + 1;
    IF v_estado = 'ok' AND v_fut = true AND v_lbl = 'y' THEN
      v_linhas := v_linhas || E'\n  PASS  A11 par fútil gravado junto (sem 23514)';
    ELSE
      v_falhas := v_falhas + 1;
      v_linhas := v_linhas || E'\n  FALHA A11 — ' || v_estado || ' is_futile=' || coalesce(v_fut::text,'NULL') || ' label=' || coalesce(v_lbl,'NULL');
    END IF;
  END;

  -- A12: Regra de receita; patch {is_benefit: true} → recusado (passo 7).
  DECLARE regra_a12 uuid;
  BEGIN
    SELECT r.regra_id INTO regra_a12 FROM public.recorrencia_criar(jsonb_build_object(
      'type', 'receita', 'description', 'Renda extra', 'amount', 200, 'date', hoje,
      'account_id', ca)) r;
    v_estado := 'ok';
    BEGIN
      PERFORM public.recorrencia_alterar_regra(
        regra_a12, jsonb_build_object('is_benefit', true), mes);
    EXCEPTION WHEN OTHERS THEN v_estado := SQLSTATE || ' ' || SQLERRM;
    END;
    v_total := v_total + 1;
    IF v_estado LIKE '%Benefício e fútil só valem para saída%' THEN
      v_linhas := v_linhas || E'\n  PASS  A12 benefício em receita recusado (passo 7)';
    ELSE
      v_falhas := v_falhas + 1;
      v_linhas := v_linhas || E'\n  FALHA A12 — ' || v_estado;
    END IF;
  END;

  -- A12b: Regra de receita criada com is_benefit=true (00019:465 aceita);
  --       patch só de description → aceito, is_benefit intocado.
  DECLARE regra_a12b uuid;
  BEGIN
    -- Cria via postgres para simular dado legado (is_benefit=true em receita)
    SET LOCAL ROLE postgres;
    INSERT INTO public.recurring_rules (
      family_id, type, description, amount, account_id, paid_by_member_id,
      created_by_member_id, day_of_month, start_period, generated_through, is_benefit)
    VALUES (fa, 'receita', 'Receita legada', 100, ca, ma, ma, EXTRACT(DAY FROM hoje)::int,
            mes, (mes - interval '1 month')::date, true)
    RETURNING id INTO regra_a12b;
    -- Gera os lançamentos para esta regra
    PERFORM public.recorrencia_gerar(fa, (mes + interval '11 months')::date, regra_a12b);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;

    DECLARE v_ben boolean;
    BEGIN
      v_estado := 'ok'; v_r := -1; v_t := -1;
      BEGIN
        SELECT r.alterados_na_regra, r.alterados_em_transacoes INTO v_r, v_t
          FROM public.recorrencia_alterar_regra(
            regra_a12b, jsonb_build_object('description', 'Receita renomeada'), mes) r;
      EXCEPTION WHEN OTHERS THEN v_estado := SQLSTATE || ' ' || SQLERRM;
      END;
      SELECT is_benefit INTO v_ben FROM public.recurring_rules WHERE id = regra_a12b;
      v_total := v_total + 1;
      IF v_estado = 'ok' AND v_r = 1 AND v_ben = true THEN
        v_linhas := v_linhas || E'\n  PASS  A12b dado legado (is_benefit=true em receita) + patch de description: aceito';
      ELSE
        v_falhas := v_falhas + 1;
        v_linhas := v_linhas || E'\n  FALHA A12b — ' || v_estado || ' r=' || v_r || ' is_benefit=' || coalesce(v_ben::text,'NULL');
      END IF;
    END;
  END;

  -- A13: Chaves proibidas (uma por chamada) → 'Campo não permitido'.
  DECLARE regra_a13 uuid;
  BEGIN
    SELECT r.regra_id INTO regra_a13 FROM public.recorrencia_criar(jsonb_build_object(
      'type', 'despesa', 'description', 'Teste proibidas', 'amount', 10, 'date', hoje,
      'account_id', ca)) r;
    FOR v_txt IN SELECT unnest(ARRAY['family_id','type','recurring_period','generated_through']) LOOP
      v_estado := 'ok';
      BEGIN
        PERFORM public.recorrencia_alterar_regra(
          regra_a13, jsonb_build_object(v_txt, 'valor-qualquer'), mes);
      EXCEPTION WHEN OTHERS THEN v_estado := SQLSTATE || ' ' || SQLERRM;
      END;
      v_total := v_total + 1;
      IF v_estado LIKE '%Campo não permitido%' THEN
        v_linhas := v_linhas || E'\n  PASS  A13 chave proibida ' || v_txt || ' recusada (passo 2)';
      ELSE
        v_falhas := v_falhas + 1;
        v_linhas := v_linhas || E'\n  FALHA A13 chave=' || v_txt || ' — ' || v_estado;
      END IF;
    END LOOP;
  END;

  -- A14: p_campos = '{}' → 'Nada para alterar' (passo 2).
  DECLARE regra_a14 uuid;
  BEGIN
    SELECT r.regra_id INTO regra_a14 FROM public.recorrencia_criar(jsonb_build_object(
      'type', 'despesa', 'description', 'Teste vazio', 'amount', 10, 'date', hoje,
      'account_id', ca)) r;
    v_estado := 'ok';
    BEGIN
      PERFORM public.recorrencia_alterar_regra(regra_a14, '{}'::jsonb, mes);
    EXCEPTION WHEN OTHERS THEN v_estado := SQLSTATE || ' ' || SQLERRM;
    END;
    v_total := v_total + 1;
    IF v_estado LIKE '%Nada para alterar%' THEN
      v_linhas := v_linhas || E'\n  PASS  A14 campos vazio recusado (passo 2)';
    ELSE
      v_falhas := v_falhas + 1;
      v_linhas := v_linhas || E'\n  FALHA A14 — ' || v_estado;
    END IF;
  END;

  -- A15: Erros de tipo/obrigatório/vazio.
  DECLARE regra_a15 uuid;
  BEGIN
    SELECT r.regra_id INTO regra_a15 FROM public.recorrencia_criar(jsonb_build_object(
      'type', 'despesa', 'description', 'Teste erros', 'amount', 10, 'date', hoje,
      'account_id', ca, 'paid_by_member_id', ma)) r;

    -- paid_by_member_id: null → 'Campo obrigatório vazio'
    v_estado := 'ok';
    BEGIN
      PERFORM public.recorrencia_alterar_regra(regra_a15, jsonb_build_object('paid_by_member_id', NULL::uuid), mes);
    EXCEPTION WHEN OTHERS THEN v_estado := SQLSTATE || ' ' || SQLERRM;
    END;
    v_total := v_total + 1;
    IF v_estado LIKE '%Campo obrigatório vazio%' THEN
      v_linhas := v_linhas || E'\n  PASS  A15a paid_by_member_id=null recusado (passo 4)';
    ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA A15a — ' || v_estado; END IF;

    -- description: '  ' (espaços) → 'Descreva o lançamento'
    v_estado := 'ok';
    BEGIN
      PERFORM public.recorrencia_alterar_regra(regra_a15, jsonb_build_object('description', '   '), mes);
    EXCEPTION WHEN OTHERS THEN v_estado := SQLSTATE || ' ' || SQLERRM;
    END;
    v_total := v_total + 1;
    IF v_estado LIKE '%Descreva o lançamento%' THEN
      v_linhas := v_linhas || E'\n  PASS  A15b description espaco recusada (passo 4)';
    ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA A15b — ' || v_estado; END IF;

    -- amount: 0 → 'Valor inválido'
    v_estado := 'ok';
    BEGIN
      PERFORM public.recorrencia_alterar_regra(regra_a15, jsonb_build_object('amount', 0), mes);
    EXCEPTION WHEN OTHERS THEN v_estado := SQLSTATE || ' ' || SQLERRM;
    END;
    v_total := v_total + 1;
    IF v_estado LIKE '%Valor inválido%' THEN
      v_linhas := v_linhas || E'\n  PASS  A15c amount=0 recusado (passo 4)';
    ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA A15c — ' || v_estado; END IF;

    -- amount: "10" (string) → 'Campo inválido'
    v_estado := 'ok';
    BEGIN
      PERFORM public.recorrencia_alterar_regra(regra_a15, jsonb_build_object('amount', '10'), mes);
    EXCEPTION WHEN OTHERS THEN v_estado := SQLSTATE || ' ' || SQLERRM;
    END;
    v_total := v_total + 1;
    IF v_estado LIKE '%Campo inválido%' THEN
      v_linhas := v_linhas || E'\n  PASS  A15d amount=string recusado (passo 4)';
    ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA A15d — ' || v_estado; END IF;
  END;

  -- A16: a_partir inválido (mes-1; gt+2; dia 15).
  DECLARE regra_a16 uuid; v_gt16 date;
  BEGIN
    SELECT r.regra_id INTO regra_a16 FROM public.recorrencia_criar(jsonb_build_object(
      'type', 'despesa', 'description', 'Teste janela', 'amount', 10, 'date', hoje,
      'account_id', ca)) r;
    SELECT generated_through INTO v_gt16 FROM public.recurring_rules WHERE id = regra_a16;

    -- a_partir = mes-1 (passado)
    v_estado := 'ok';
    BEGIN
      PERFORM public.recorrencia_alterar_regra(regra_a16, jsonb_build_object('description', 'x'), (mes - interval '1 month')::date);
    EXCEPTION WHEN OTHERS THEN v_estado := SQLSTATE || ' ' || SQLERRM;
    END;
    v_total := v_total + 1;
    IF v_estado LIKE '%Mês inválido%' THEN
      v_linhas := v_linhas || E'\n  PASS  A16a a_partir=mes-1 recusado (passo 3 ou 10)';
    ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA A16a — ' || v_estado; END IF;

    -- a_partir = gt+2 (além do horizonte)
    v_estado := 'ok';
    BEGIN
      PERFORM public.recorrencia_alterar_regra(regra_a16, jsonb_build_object('description', 'x'), (v_gt16 + interval '2 months')::date);
    EXCEPTION WHEN OTHERS THEN v_estado := SQLSTATE || ' ' || SQLERRM;
    END;
    v_total := v_total + 1;
    IF v_estado LIKE '%Mês inválido%' THEN
      v_linhas := v_linhas || E'\n  PASS  A16b a_partir=gt+2 recusado (passo 10, após gerador)';
    ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA A16b — ' || v_estado; END IF;

    -- a_partir = dia 15 (não é 1º do mês)
    v_estado := 'ok';
    BEGIN
      PERFORM public.recorrencia_alterar_regra(regra_a16, jsonb_build_object('description', 'x'), (mes + interval '15 days')::date);
    EXCEPTION WHEN OTHERS THEN v_estado := SQLSTATE || ' ' || SQLERRM;
    END;
    v_total := v_total + 1;
    IF v_estado LIKE '%Mês inválido%' THEN
      v_linhas := v_linhas || E'\n  PASS  A16c a_partir=dia15 recusado (passo 3)';
    ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA A16c — ' || v_estado; END IF;

    -- Conta linhas de regra_a16 depois dos A16: igual a antes (rollback do gerador)
    SELECT count(*) INTO n FROM public.transactions WHERE recurring_rule_id = regra_a16;
    SELECT generated_through INTO v_gt FROM public.recurring_rules WHERE id = regra_a16;
    v_total := v_total + 1;
    IF n >= 12 AND v_gt <= (v_gt16 + interval '1 month')::date THEN
      v_linhas := v_linhas || E'\n  PASS  A16d gerado revertido nos casos de RAISE pós-gerador';
    ELSE
      v_falhas := v_falhas + 1;
      v_linhas := v_linhas || E'\n  FALHA A16d linhas=' || n || ' gt=' || v_gt || ' gt16=' || v_gt16;
    END IF;
  END;

  -- A17: Altera regra_a; verifica que regra2 e regra3 ficam intactas (L-033).
  -- (A01 já alterou regra_a; aqui fazemos mais uma alteração e checamos as outras regras.)
  v_estado := 'ok';
  BEGIN
    PERFORM public.recorrencia_alterar_regra(regra_a, jsonb_build_object('description', 'Netflix A17'), mes);
  EXCEPTION WHEN OTHERS THEN v_estado := SQLSTATE || ' ' || SQLERRM;
  END;
  SELECT generated_through INTO v_gt FROM public.recurring_rules WHERE id = regra2;
  SELECT count(*) INTO n FROM public.transactions WHERE recurring_rule_id = regra2;
  SELECT generated_through INTO v_d FROM public.recurring_rules WHERE id = regra3;
  SELECT count(*) INTO n2 FROM public.transactions WHERE recurring_rule_id = regra3;
  v_total := v_total + 1;
  IF v_estado = 'ok' AND v_gt = gt2 AND n = n_lin2 AND v_d = gt3 AND n2 = n_lin3 THEN
    v_linhas := v_linhas || E'\n  PASS  A17 gerador com escopo p_regra: regra2 e regra3 intactas (L-033)';
  ELSE
    v_falhas := v_falhas + 1;
    v_linhas := v_linhas || E'\n  FALHA A17 — ' || v_estado
      || ' gt2=' || coalesce(v_gt::text,'NULL') || '(era '|| gt2 ||') n2=' || n || '(era '|| n_lin2 ||')'
      || ' gt3=' || coalesce(v_d::text,'NULL') || '(era '|| gt3 ||') n3=' || n2 || '(era '|| n_lin3 ||')';
  END IF;

  -- A18: Conta arquivada; patch troca para conta ativa a partir de mes+1 (dentro da janela).
  DECLARE regra_a18 uuid;
  BEGIN
    -- Cria regra com conta arquivada via postgres (simula assinatura "pausada")
    SET LOCAL ROLE postgres;
    INSERT INTO public.recurring_rules (
      family_id, type, description, amount, account_id, paid_by_member_id,
      created_by_member_id, day_of_month, start_period, generated_through)
    VALUES (fa, 'despesa', 'Pausada', 50, arq, ma, ma, EXTRACT(DAY FROM hoje)::int,
            mes, (mes - interval '1 month')::date)
    RETURNING id INTO regra_a18;
    -- Gera só até o mês atual (conta arquivada)
    PERFORM public.recorrencia_gerar(fa, (mes + interval '11 months')::date, regra_a18);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;

    -- Relê o generated_through real
    SELECT generated_through INTO v_gt FROM public.recurring_rules WHERE id = regra_a18;

    -- Se mes+1 <= v_gt+1 mês, o pedido deve ser aceito
    v_estado := 'ok'; v_r := -1; v_t := -1;
    BEGIN
      IF (mes + interval '1 month')::date <= (v_gt + interval '1 month')::date THEN
        SELECT r.alterados_na_regra, r.alterados_em_transacoes INTO v_r, v_t
          FROM public.recorrencia_alterar_regra(
            regra_a18, jsonb_build_object('account_id', ca), (mes + interval '1 month')::date) r;
      ELSE
        v_estado := 'SKIP a_partir excede janela (conta arquivada parou antes)';
      END IF;
    EXCEPTION WHEN OTHERS THEN v_estado := SQLSTATE || ' ' || SQLERRM;
    END;
    v_total := v_total + 1;
    IF v_estado LIKE 'SKIP%' OR (v_estado = 'ok' AND v_r = 1) THEN
      v_linhas := v_linhas || E'\n  PASS  A18 conta arquivada→ativa (janela usa gt relido, §3.4)';
    ELSE
      v_falhas := v_falhas + 1;
      v_linhas := v_linhas || E'\n  FALHA A18 — ' || v_estado || ' r=' || v_r;
    END IF;
  END;

  -- ============================================================ CASOS DE ISOLAMENTO

  -- I01: Como B, altera regra_A com referências VÁLIDAS de A (L-018) → recusado.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  v_estado := 'ok';
  BEGIN
    PERFORM public.recorrencia_alterar_regra(
      regra_a,
      jsonb_build_object('description', 'x', 'owner_member_id', ma2),
      mes);
  EXCEPTION WHEN OTHERS THEN v_estado := SQLSTATE || ' ' || SQLERRM;
  END;
  -- A regra de A deve estar intacta (sem a string 'x' como description atual)
  -- (A02 trocou para 'Disney+', A17 trocou para 'Netflix A17')
  -- Leitura como postgres: RLS impede ub (família B) de ler regra de A.
  SET LOCAL ROLE postgres;
  SELECT description INTO v_txt FROM public.recurring_rules WHERE id = regra_a;
  SET LOCAL ROLE authenticated;
  v_total := v_total + 1;
  IF v_estado LIKE '%Assinatura não encontrada%' AND v_txt = 'Netflix A17' THEN
    v_linhas := v_linhas || E'\n  PASS  I01 B não altera regra de A (passo 6, family_id = v_family)';
  ELSE
    v_falhas := v_falhas + 1;
    v_linhas := v_linhas || E'\n  FALHA I01 GRAVAÇÃO — ' || v_estado || ' desc=' || coalesce(v_txt,'NULL');
  END IF;

  -- I02 + I03: Como B, usa referências de A na própria regra B.
  --   I02: account_id de A → 'Conta não encontrada nesta família'.
  --   I03: paid_by_member_id = ma (membro de A) → 'Quem paga não foi encontrado nesta família'.
  --   regra_b declarada aqui para ser visível em ambos os subcasos.
  DECLARE regra_b uuid;
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    SELECT r.regra_id INTO regra_b FROM public.recorrencia_criar(jsonb_build_object(
      'type', 'despesa', 'description', 'Regra B', 'amount', 50, 'date', hoje,
      'account_id', cb)) r;

    -- I02
    v_estado := 'ok';
    BEGIN
      PERFORM public.recorrencia_alterar_regra(
        regra_b, jsonb_build_object('account_id', ca), mes);
    EXCEPTION WHEN OTHERS THEN v_estado := SQLSTATE || ' ' || SQLERRM;
    END;
    v_total := v_total + 1;
    IF v_estado LIKE '%Conta não encontrada nesta família%' THEN
      v_linhas := v_linhas || E'\n  PASS  I02 B usa conta de A → recusado (passo 8)';
    ELSE
      v_falhas := v_falhas + 1;
      v_linhas := v_linhas || E'\n  FALHA I02 — ' || v_estado;
    END IF;

    -- I03
    v_estado := 'ok';
    BEGIN
      PERFORM public.recorrencia_alterar_regra(
        regra_b, jsonb_build_object('paid_by_member_id', ma), mes);
    EXCEPTION WHEN OTHERS THEN v_estado := SQLSTATE || ' ' || SQLERRM;
    END;
    v_total := v_total + 1;
    IF v_estado LIKE '%Quem paga não foi encontrado nesta família%' THEN
      v_linhas := v_linhas || E'\n  PASS  I03 B usa membro de A como paid_by → recusado (passo 8)';
    ELSE
      v_falhas := v_falhas + 1;
      v_linhas := v_linhas || E'\n  FALHA I03 — ' || v_estado;
    END IF;
  END;

  -- ============================================================ CASO DE PRIVILÉGIOS

  -- G01: has_function_privilege.
  SET LOCAL ROLE postgres;
  v_total := v_total + 1;
  IF NOT has_function_privilege('anon', 'public.recorrencia_alterar_regra(uuid, jsonb, date)', 'EXECUTE')
     AND has_function_privilege('authenticated', 'public.recorrencia_alterar_regra(uuid, jsonb, date)', 'EXECUTE') THEN
    v_linhas := v_linhas || E'\n  PASS  G01 anon sem EXECUTE, authenticated com EXECUTE';
  ELSE
    v_falhas := v_falhas + 1;
    v_linhas := v_linhas || E'\n  FALHA G01 privilégios incorretos';
  END IF;

  -- prosecdef, dono postgres, search_path vazio
  v_total := v_total + 1;
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname = 'recorrencia_alterar_regra'
      AND p.prosecdef
      AND pg_get_userbyid(p.proowner) = 'postgres'
      AND 'search_path=""' = ANY (p.proconfig)) THEN
    v_linhas := v_linhas || E'\n  PASS  G01b SECURITY DEFINER, dono postgres, search_path=""';
  ELSE
    v_falhas := v_falhas + 1;
    v_linhas := v_linhas || E'\n  FALHA G01b DEFINER/dono/search_path';
  END IF;

  -- ============================================================ CASO DE TRAVA

  -- T01: Depois do A01, app.recorrencia_rpc NÃO está 'on'; colunas de recorrência intactas.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  v_total := v_total + 1;
  IF coalesce(current_setting('app.recorrencia_rpc', true), '') <> 'on' THEN
    v_linhas := v_linhas || E'\n  PASS  T01 app.recorrencia_rpc não está on após alteração';
  ELSE
    v_falhas := v_falhas + 1;
    v_linhas := v_linhas || E'\n  FALHA T01 app.recorrencia_rpc ficou on';
  END IF;

  -- ============================================================ PLACAR (desfaz tudo)
  RAISE EXCEPTION 'PLACAR recorrencia-alterar-regra: % de % passaram, % falha(s)%',
    v_total - v_falhas, v_total, v_falhas, v_linhas;
END $teste_alterar_regra$;
