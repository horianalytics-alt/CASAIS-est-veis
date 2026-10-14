-- Teste de isolamento e de valores de v_orcamento_progresso e v_patrimonio_mensal
-- (migration 00012) + CHECK de category_budgets.month.
-- Plano: docs/planos/estrutura-metas-patrimonio-simulador.md, seção 6.1.
--
-- Roda POR SQL contra o banco hospedado, trocando o papel com
-- SET LOCAL ROLE + request.jwt.claims — o mesmo caminho que o PostgREST usa.
--
-- NUNCA GRAVA NADA: o bloco termina SEMPRE em RAISE EXCEPTION com o placar.
-- A exceção desfaz a transação inteira (usuários, famílias, contas,
-- categorias, orçamentos e lançamentos de teste). Não existe limpeza para
-- esquecer, nem quando uma asserção quebra no meio. Não toca na família real:
-- as duas famílias são criadas aqui, com usuários de uuid novo.
--
-- Os valores esperados foram calculados à mão a partir dos fixtures abaixo
-- (a conta está ao lado de cada asserção), não com as views.
--
-- Não rode este arquivo direto: use tests/integration/onda2-rls.mjs, que
-- interpreta o placar e devolve código de saída.
DO $teste$
DECLARE
  ua uuid := gen_random_uuid();
  ub uuid := gen_random_uuid();
  fa uuid; fb uuid;
  ma uuid; mb uuid;
  a1 uuid; a2 uuid; b1 uuid;
  ca uuid; cl uuid; cr uuid; cb uuid;
  ba_mar uuid; ba_abr uuid; bb uuid;
  n  int;
  n2 int;
  n_a int;
  v_mes_sp text;
  v_estado text;
  v_ok     boolean;
  v_num    numeric;
  v_total  int := 0;
  v_falhas int := 0;
  v_linhas text := '';
BEGIN
  -- Mês corrente no fuso do casal e quantos meses vão de 2025-01 até ele
  -- (fórmula independente da view: ano*12 + mês).
  v_mes_sp := to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM');
  n_a := (split_part(v_mes_sp, '-', 1)::int * 12 + split_part(v_mes_sp, '-', 2)::int)
         - (2025 * 12 + 1) + 1;

  -- ------------------------------------------------------------ fixtures (postgres)
  INSERT INTO auth.users (id, email, aud, role)
  VALUES (ua, 'rls-onda2-a-' || ua || '@example.com', 'authenticated', 'authenticated'),
         (ub, 'rls-onda2-b-' || ub || '@example.com', 'authenticated', 'authenticated');

  INSERT INTO public.families (name, join_code) VALUES ('RLS Onda2 A', 'QW2347') RETURNING id INTO fa;
  INSERT INTO public.families (name, join_code) VALUES ('RLS Onda2 B', 'QW2348') RETURNING id INTO fb;
  INSERT INTO public.family_members (family_id, user_id, display_name) VALUES (fa, ua, 'Membro A') RETURNING id INTO ma;
  INSERT INTO public.family_members (family_id, user_id, display_name) VALUES (fb, ub, 'Membro B') RETURNING id INTO mb;

  -- Saldo inicial somado de A = 1000,00 + 0 = 1000,00 ; de B = 500,00.
  INSERT INTO public.accounts (family_id, owner_member_id, name, type, initial_balance)
    VALUES (fa, ma, 'Conta A', 'corrente', 1000.00) RETURNING id INTO a1;
  INSERT INTO public.accounts (family_id, owner_member_id, name, type, initial_balance, closing_day, due_day)
    VALUES (fa, ma, 'Cartao A', 'cartao', 0, 25, 5) RETURNING id INTO a2;
  INSERT INTO public.accounts (family_id, owner_member_id, name, type, initial_balance)
    VALUES (fb, mb, 'Conta B', 'corrente', 500.00) RETURNING id INTO b1;

  INSERT INTO public.categories (family_id, name, type) VALUES (fa, 'Mercado A', 'despesa') RETURNING id INTO ca;
  INSERT INTO public.categories (family_id, name, type) VALUES (fa, 'Lazer A',   'despesa') RETURNING id INTO cl;
  INSERT INTO public.categories (family_id, name, type) VALUES (fa, 'Salario A', 'receita') RETURNING id INTO cr;
  INSERT INTO public.categories (family_id, name, type) VALUES (fb, 'Mercado B', 'despesa') RETURNING id INTO cb;

  INSERT INTO public.category_budgets (family_id, category_id, month, amount)
    VALUES (fa, ca, '2025-03', 300.00) RETURNING id INTO ba_mar;
  INSERT INTO public.category_budgets (family_id, category_id, month, amount)
    VALUES (fa, ca, '2025-04', 100.00) RETURNING id INTO ba_abr;
  INSERT INTO public.category_budgets (family_id, category_id, month, amount)
    VALUES (fb, cb, '2025-03', 200.00) RETURNING id INTO bb;

  -- Lançamentos de A (criado e pago por ma). Coluna "orç" = entra no orçamento
  -- de Mercado A de qual mês; "patr" = mês em que mexe no patrimônio.
  --   t1  receita  2000,00  10/01 pago 10/01  Salario   orç: -    patr: jan +2000
  --   t7  despesa    25,00  28/02 pago 28/02  Mercado   orç: fev  patr: fev -25
  --   t2  despesa   150,00  05/03 pago 05/03  Mercado   orç: MAR  patr: mar -150
  --   t10 despesa    70,00  10/03 pago 10/03  Lazer     orç: -    patr: mar -70
  --   t5  receita   999,00  15/03 pago 15/03  Mercado   orç: -    patr: mar +999
  --   t3  despesa    80,50  20/03 NÃO pago    Mercado   orç: MAR  patr: -
  --   t4  despesa    40,00  28/03 cartão, fatura 2025/04, paga 05/04
  --                                           Mercado   orç: MAR  patr: abr -40
  --   t12 despesa    11,00  31/03 NÃO pago    Mercado   orç: MAR  patr: -
  --   t6  despesa    60,00  01/04 pago 01/04  Mercado   orç: ABR  patr: abr -60
  --   t8  transf.   300,00  05/04 A1->A2 pago Mercado   orç: -    patr: 0
  --   t9  investim. 100,00  10/05 pago 10/05  -         orç: -    patr: mai -100
  --   t11 receita  5000,00  01/06 NÃO pago    -         orç: -    patr: -
  INSERT INTO public.transactions
    (family_id, type, description, amount, date, account_id, to_account_id, category_id,
     created_by_member_id, paid_by_member_id, is_paid, paid_date, invoice_year, invoice_month)
  VALUES
    (fa, 'receita',       't1',  2000.00, '2025-01-10', a1, NULL, cr, ma, ma, true,  '2025-01-10', NULL, NULL),
    (fa, 'despesa',       't7',    25.00, '2025-02-28', a1, NULL, ca, ma, ma, true,  '2025-02-28', NULL, NULL),
    (fa, 'despesa',       't2',   150.00, '2025-03-05', a1, NULL, ca, ma, ma, true,  '2025-03-05', NULL, NULL),
    (fa, 'despesa',       't10',   70.00, '2025-03-10', a1, NULL, cl, ma, ma, true,  '2025-03-10', NULL, NULL),
    (fa, 'receita',       't5',   999.00, '2025-03-15', a1, NULL, ca, ma, ma, true,  '2025-03-15', NULL, NULL),
    (fa, 'despesa',       't3',    80.50, '2025-03-20', a1, NULL, ca, ma, ma, false, NULL,         NULL, NULL),
    (fa, 'despesa',       't4',    40.00, '2025-03-28', a2, NULL, ca, ma, ma, true,  '2025-04-05', 2025, 4),
    (fa, 'despesa',       't12',   11.00, '2025-03-31', a1, NULL, ca, ma, ma, false, NULL,         NULL, NULL),
    (fa, 'despesa',       't6',    60.00, '2025-04-01', a1, NULL, ca, ma, ma, true,  '2025-04-01', NULL, NULL),
    (fa, 'transferencia', 't8',   300.00, '2025-04-05', a1, a2,   ca, ma, ma, true,  '2025-04-05', NULL, NULL),
    (fa, 'investimento',  't9',   100.00, '2025-05-10', a1, NULL, NULL, ma, ma, true, '2025-05-10', NULL, NULL),
    (fa, 'receita',       't11', 5000.00, '2025-06-01', a1, NULL, NULL, ma, ma, false, NULL,        NULL, NULL);

  -- Lançamentos de B.
  --   u2 receita  50,00  01/02 pago   patr: fev +50   -> fev = 550,00
  --   u1 despesa 120,00  07/03 pago   Mercado B (orç MAR)  patr: mar -120 -> 430,00
  INSERT INTO public.transactions
    (family_id, type, description, amount, date, account_id, category_id,
     created_by_member_id, paid_by_member_id, is_paid, paid_date)
  VALUES
    (fb, 'receita', 'u2',  50.00, '2025-02-01', b1, NULL, mb, mb, true, '2025-02-01'),
    (fb, 'despesa', 'u1', 120.00, '2025-03-07', b1, cb,   mb, mb, true, '2025-03-07');

  -- ============================================================ como o usuário A
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  -- ---------------------------------------------------------- orçamento
  -- O01 controle positivo: sem ele, um teste que nunca enxerga linha nenhuma
  -- passaria em todas as asserções de "0 linhas".
  SELECT count(*) INTO n FROM public.v_orcamento_progresso WHERE family_id = fa;
  v_total := v_total + 1;
  IF n = 2 THEN v_linhas := v_linhas || E'\n  PASS  O01 A lê os 2 próprios orçamentos';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA O01 A lê os próprios orçamentos — obtido ' || n; END IF;

  SELECT count(*) INTO n FROM public.v_orcamento_progresso WHERE family_id = fb;
  v_total := v_total + 1;
  IF n = 0 THEN v_linhas := v_linhas || E'\n  PASS  O02 A filtrando pela família B: 0 linhas';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA O02 A lê orçamento da família B — ' || n || ' linha(s)'; END IF;

  SELECT count(*), count(*) FILTER (WHERE family_id <> fa) INTO n, n2 FROM public.v_orcamento_progresso;
  v_total := v_total + 1;
  IF n = 2 AND n2 = 0 THEN v_linhas := v_linhas || E'\n  PASS  O03 A sem filtro: só as 2 linhas de A';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA O03 A sem filtro: ' || n || ' linha(s), ' || n2 || ' de outra família'; END IF;

  SELECT count(*) INTO n FROM public.v_orcamento_progresso WHERE budget_id = bb;
  v_total := v_total + 1;
  IF n = 0 THEN v_linhas := v_linhas || E'\n  PASS  O04 A pelo budget_id de B: 0 linhas';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA O04 A lê o orçamento de B pelo id — ' || n; END IF;

  -- O05 março: t2 150,00 + t3 80,50 + t4 40,00 + t12 11,00 = 281,50 (4 lançamentos)
  --     restante 300,00 - 281,50 = 18,50 ; razão 281,50 / 300 = 0,93833... -> 0,9383
  --     fora: t5 (receita), t10 (outra categoria), t7 (fevereiro), t6 (abril)
  SELECT count(*) INTO n FROM public.v_orcamento_progresso
  WHERE budget_id = ba_mar AND month = '2025-03' AND category_id = ca
    AND category_name = 'Mercado A' AND category_type = 'despesa'
    AND budget_amount = 300.00 AND spent_amount = 281.50 AND remaining_amount = 18.50
    AND used_ratio = 0.9383 AND tx_count = 4;
  v_total := v_total + 1;
  IF n = 1 THEN v_linhas := v_linhas || E'\n  PASS  O05 março: gasto 281,50 de 300,00 (pago + não pago + cartão pela data da compra + dia 31), razão 0,9383';
  ELSE
    v_falhas := v_falhas + 1;
    SELECT 'gasto=' || coalesce(spent_amount::text, 'null') || ' restante=' || coalesce(remaining_amount::text, 'null')
           || ' razao=' || coalesce(used_ratio::text, 'null') || ' n=' || coalesce(tx_count::text, 'null')
      INTO v_estado FROM public.v_orcamento_progresso WHERE budget_id = ba_mar;
    v_linhas := v_linhas || E'\n  FALHA O05 março — ' || coalesce(v_estado, '<sem linha>');
  END IF;

  -- O06 abril: só t6 60,00 (dia 1º entra); t8 é transferência com categoria e fica fora.
  --     restante 100,00 - 60,00 = 40,00 ; razão 0,6000
  SELECT count(*) INTO n FROM public.v_orcamento_progresso
  WHERE budget_id = ba_abr AND month = '2025-04' AND budget_amount = 100.00
    AND spent_amount = 60.00 AND remaining_amount = 40.00 AND used_ratio = 0.6000 AND tx_count = 1;
  v_total := v_total + 1;
  IF n = 1 THEN v_linhas := v_linhas || E'\n  PASS  O06 abril: gasto 60,00 de 100,00 (transferência fora), razão 0,6000';
  ELSE
    v_falhas := v_falhas + 1;
    SELECT 'gasto=' || coalesce(spent_amount::text, 'null') || ' n=' || coalesce(tx_count::text, 'null')
      INTO v_estado FROM public.v_orcamento_progresso WHERE budget_id = ba_abr;
    v_linhas := v_linhas || E'\n  FALHA O06 abril — ' || coalesce(v_estado, '<sem linha>');
  END IF;

  -- ---------------------------------------------------------- patrimônio
  SELECT count(*), count(*) FILTER (WHERE family_id <> fa) INTO n, n2 FROM public.v_patrimonio_mensal;
  v_total := v_total + 1;
  IF n = n_a AND n2 = 0 THEN v_linhas := v_linhas || E'\n  PASS  P01 A sem filtro: só as ' || n_a || ' linhas de A (2025-01 até ' || v_mes_sp || ')';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA P01 A sem filtro: ' || n || ' linha(s) (esperado ' || n_a || '), ' || n2 || ' de outra família'; END IF;

  SELECT count(*) INTO n FROM public.v_patrimonio_mensal WHERE family_id = fb;
  v_total := v_total + 1;
  IF n = 0 THEN v_linhas := v_linhas || E'\n  PASS  P02 A filtrando pela família B: 0 linhas';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA P02 A lê patrimônio da família B — ' || n || ' linha(s)'; END IF;

  -- P03 sem buraco: um mês por linha, do primeiro pagamento (2025-01) ao mês corrente em SP.
  SELECT count(DISTINCT month) = n_a AND min(month) = '2025-01' AND max(month) = v_mes_sp
    INTO v_ok FROM public.v_patrimonio_mensal WHERE family_id = fa;
  v_total := v_total + 1;
  IF v_ok THEN v_linhas := v_linhas || E'\n  PASS  P03 série contínua de 2025-01 a ' || v_mes_sp || ', sem mês repetido';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA P03 série com buraco ou fora do intervalo'; END IF;

  -- P04 valores mês a mês (saldo inicial 1000,00):
  --   jan +2000 -> 3000 | fev -25 -> 2975 (mês com movimento só de saída)
  --   mar -150 -70 +999 = +779 -> 3754 (t3/t12 não pagos fora)
  --   abr -40 (cartão pela paid_date) -60 +0 (transferência) = -100 -> 3654
  --   mai -100 (investimento) -> 3554 | jun..corrente 0 -> 3554 (t11 não paga fora)
  SELECT count(*) INTO n FROM public.v_patrimonio_mensal
  WHERE family_id = fa AND (month, net_change, total_balance) IN (
    ('2025-01', 2000.00, 3000.00), ('2025-02', -25.00, 2975.00), ('2025-03', 779.00, 3754.00),
    ('2025-04', -100.00, 3654.00), ('2025-05', -100.00, 3554.00), ('2025-06', 0, 3554.00),
    (v_mes_sp, 0, 3554.00));
  v_total := v_total + 1;
  IF n = 7 THEN v_linhas := v_linhas || E'\n  PASS  P04 valores de jan..jun/2025 e do mês corrente batem com a conta à mão';
  ELSE
    v_falhas := v_falhas + 1;
    SELECT string_agg(month || '=' || net_change || '/' || total_balance, ' ' ORDER BY month)
      INTO v_estado FROM public.v_patrimonio_mensal WHERE family_id = fa AND month <= '2025-06';
    v_linhas := v_linhas || E'\n  FALHA P04 valores (7 esperados, ' || n || ' bateram): ' || coalesce(v_estado, '<vazio>');
  END IF;

  -- P05 reconciliação: o último ponto é a soma do saldo atual de todas as contas
  --     (A1 3294,00 + cartão 260,00 = 3554,00, por v_account_balances).
  SELECT sum(current_balance) INTO v_num FROM public.v_account_balances WHERE family_id = fa;
  SELECT count(*) INTO n FROM public.v_patrimonio_mensal
  WHERE family_id = fa AND month = v_mes_sp AND total_balance = v_num AND v_num = 3554.00;
  v_total := v_total + 1;
  IF n = 1 THEN v_linhas := v_linhas || E'\n  PASS  P05 último ponto = soma de current_balance de v_account_balances (3554,00)';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA P05 reconciliação — soma das contas ' || coalesce(v_num::text, 'null'); END IF;

  -- ---------------------------------------------------------- CHECK de month (como A)
  v_estado := 'ok';
  BEGIN
    INSERT INTO public.category_budgets (family_id, category_id, month, amount) VALUES (fa, cl, '2025-13', 10);
  EXCEPTION WHEN OTHERS THEN v_estado := SQLSTATE;
  END;
  v_total := v_total + 1;
  IF v_estado = '23514' THEN v_linhas := v_linhas || E'\n  PASS  C01 mês 2025-13 recusado (23514)';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA C01 mês 2025-13 — resultado ' || v_estado; END IF;

  v_estado := 'ok';
  BEGIN
    INSERT INTO public.category_budgets (family_id, category_id, month, amount) VALUES (fa, cl, '2025-00', 10);
  EXCEPTION WHEN OTHERS THEN v_estado := SQLSTATE;
  END;
  v_total := v_total + 1;
  IF v_estado = '23514' THEN v_linhas := v_linhas || E'\n  PASS  C02 mês 2025-00 recusado (23514)';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA C02 mês 2025-00 — resultado ' || v_estado; END IF;

  v_estado := 'ok';
  BEGIN
    INSERT INTO public.category_budgets (family_id, category_id, month, amount) VALUES (fa, cl, '1999-12', 10);
  EXCEPTION WHEN OTHERS THEN v_estado := SQLSTATE;
  END;
  v_total := v_total + 1;
  IF v_estado = '23514' THEN v_linhas := v_linhas || E'\n  PASS  C03 ano 1999 recusado (23514)';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA C03 ano 1999 — resultado ' || v_estado; END IF;

  v_estado := 'ok';
  BEGIN
    INSERT INTO public.category_budgets (family_id, category_id, month, amount) VALUES (fa, cl, '2025-12', 10);
  EXCEPTION WHEN OTHERS THEN v_estado := SQLSTATE;
  END;
  v_total := v_total + 1;
  IF v_estado = 'ok' THEN v_linhas := v_linhas || E'\n  PASS  C04 mês 2025-12 aceito (controle positivo do CHECK)';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA C04 mês 2025-12 recusado — ' || v_estado; END IF;

  -- ============================================================ como o usuário B
  RESET ROLE;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  -- B01: o orçamento de B (u1 120,00 de 200,00 ; razão 0,6000), e só ele.
  SELECT count(*), count(*) FILTER (WHERE budget_id = bb AND spent_amount = 120.00
                                      AND remaining_amount = 80.00 AND used_ratio = 0.6000)
    INTO n, n2 FROM public.v_orcamento_progresso;
  v_total := v_total + 1;
  IF n = 1 AND n2 = 1 THEN v_linhas := v_linhas || E'\n  PASS  B01 B lê só o próprio orçamento (120,00 de 200,00)';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA B01 B: ' || n || ' linha(s), ' || n2 || ' com o valor esperado'; END IF;

  SELECT count(*) INTO n FROM public.v_orcamento_progresso WHERE family_id = fa OR budget_id IN (ba_mar, ba_abr);
  v_total := v_total + 1;
  IF n = 0 THEN v_linhas := v_linhas || E'\n  PASS  B02 B não lê orçamento de A (por família e por id)';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA B02 B lê orçamento de A — ' || n; END IF;

  -- B03: patrimônio de B de 2025-02 (1º pagamento) ao mês corrente = n_a - 1 linhas.
  --      fev 500 + 50 = 550,00 ; mar 550 - 120 = 430,00 ; corrente 430,00
  SELECT count(*),
         count(*) FILTER (WHERE (month = '2025-02' AND total_balance = 550.00)
                             OR (month = '2025-03' AND total_balance = 430.00)
                             OR (month = v_mes_sp  AND total_balance = 430.00))
    INTO n, n2 FROM public.v_patrimonio_mensal;
  v_total := v_total + 1;
  IF n = n_a - 1 AND n2 = 3 THEN v_linhas := v_linhas || E'\n  PASS  B03 B lê só o próprio patrimônio (' || (n_a - 1) || ' meses; 550,00 -> 430,00)';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA B03 B: ' || n || ' linha(s) (esperado ' || (n_a - 1) || '), ' || n2 || ' de 3 valores'; END IF;

  SELECT count(*) INTO n FROM public.v_patrimonio_mensal WHERE family_id = fa;
  v_total := v_total + 1;
  IF n = 0 THEN v_linhas := v_linhas || E'\n  PASS  B04 B filtrando pela família A: 0 linhas';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA B04 B lê patrimônio de A — ' || n; END IF;

  -- ============================================================ como anon
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  SET LOCAL ROLE anon;

  v_estado := 'ok';
  BEGIN
    SELECT count(*) INTO n FROM public.v_orcamento_progresso;
  EXCEPTION WHEN OTHERS THEN v_estado := SQLSTATE;
  END;
  v_total := v_total + 1;
  IF v_estado = '42501' THEN v_linhas := v_linhas || E'\n  PASS  N01 anon sem acesso a v_orcamento_progresso (42501)';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA N01 anon em v_orcamento_progresso — ' || v_estado; END IF;

  v_estado := 'ok';
  BEGIN
    SELECT count(*) INTO n FROM public.v_patrimonio_mensal;
  EXCEPTION WHEN OTHERS THEN v_estado := SQLSTATE;
  END;
  v_total := v_total + 1;
  IF v_estado = '42501' THEN v_linhas := v_linhas || E'\n  PASS  N02 anon sem acesso a v_patrimonio_mensal (42501)';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA N02 anon em v_patrimonio_mensal — ' || v_estado; END IF;

  -- ============================================================ catálogo (postgres)
  RESET ROLE;

  SELECT NOT has_table_privilege('anon', 'public.v_orcamento_progresso', 'SELECT')
     AND NOT has_table_privilege('anon', 'public.v_patrimonio_mensal', 'SELECT')
     AND has_table_privilege('authenticated', 'public.v_orcamento_progresso', 'SELECT')
     AND has_table_privilege('authenticated', 'public.v_patrimonio_mensal', 'SELECT')
     AND NOT has_table_privilege('authenticated', 'public.v_orcamento_progresso', 'INSERT')
    INTO v_ok;
  v_total := v_total + 1;
  IF v_ok THEN v_linhas := v_linhas || E'\n  PASS  G01 privilégios: anon nada; authenticated só SELECT';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA G01 privilégios das views fora do esperado'; END IF;

  SELECT count(*) INTO n FROM pg_class
  WHERE oid IN ('public.v_orcamento_progresso'::regclass, 'public.v_patrimonio_mensal'::regclass)
    AND 'security_invoker=true' = ANY (reloptions);
  v_total := v_total + 1;
  IF n = 2 THEN v_linhas := v_linhas || E'\n  PASS  G02 as 2 views com security_invoker=true';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA G02 views com security_invoker: ' || n || ' de 2'; END IF;

  -- Sempre aborta: o placar sai na mensagem e a transação é desfeita.
  RAISE EXCEPTION 'PLACAR onda2-rls: % de % passaram, % falha(s)%',
    v_total - v_falhas, v_total, v_falhas, v_linhas;
END $teste$;
