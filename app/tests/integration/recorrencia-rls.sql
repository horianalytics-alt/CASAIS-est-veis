-- Teste da recorrência (migration 00019): isolamento entre famílias, trava das
-- colunas novas, geração idempotente, pop-up (fila e resposta), alterar valor e
-- encerrar. Plano: docs/planos/estrutura-recorrencia.md, §9.
--
-- Roda POR SQL contra o banco hospedado, trocando o papel com
-- SET LOCAL ROLE + request.jwt.claims (o mesmo caminho do PostgREST).
--
-- NUNCA GRAVA NADA: o bloco termina SEMPRE em RAISE EXCEPTION com o placar, e a
-- exceção desfaz a transação inteira. Não toca na família real: as duas famílias
-- são criadas aqui, com usuários de uuid novo.
--
-- O intruso B usa referências VÁLIDAS da vítima A (regra, lançamento e conta de
-- A), não ids chutados (L-018). Cada recusa diz qual checagem ela atinge (L-026).
--
-- Não rode este arquivo direto: use tests/integration/recorrencia-rls.mjs.
DO $teste$
DECLARE
  ua uuid := gen_random_uuid();
  ub uuid := gen_random_uuid();
  fa uuid; fb uuid; ma uuid; mb uuid;
  ca uuid; cb uuid; cart uuid; inv uuid; arq uuid; cat_a uuid;
  regra_a uuid; regra_p uuid; regra_paga uuid; regra_cart uuid; regra31 uuid; regra_cfut uuid;
  tx_velho uuid; tx_meio uuid; tx_atual uuid; tx_cart uuid; tx uuid;
  hoje date; mes date; y2 int; ca2 uuid;
  n int; n2 int; v_txt text; v_num numeric; v_d date; v_b boolean;
  v_d_num numeric; v_esp_in numeric; v_esp_out numeric;
  v_estado text;
  v_total int := 0; v_falhas int := 0; v_linhas text := '';
BEGIN
  hoje := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  mes  := date_trunc('month', hoje)::date;
  -- Janeiro de y2 está sempre além do horizonte (mês atual + 11) e dentro do
  -- teto de início (mês atual + 24): as datas "futuras" dos casos andam com o
  -- relógio (code-review high do rascunho).
  y2   := EXTRACT(YEAR FROM mes)::int + 2;

  -- ------------------------------------------------------------ fixtures (postgres)
  INSERT INTO auth.users (id, email, aud, role)
  VALUES (ua, 'rls-recorr-a-' || ua || '@example.com', 'authenticated', 'authenticated'),
         (ub, 'rls-recorr-b-' || ub || '@example.com', 'authenticated', 'authenticated');
  INSERT INTO public.families (name, join_code) VALUES ('RLS Recorr A', 'QR2345') RETURNING id INTO fa;
  INSERT INTO public.families (name, join_code) VALUES ('RLS Recorr B', 'QR2346') RETURNING id INTO fb;
  INSERT INTO public.family_members (family_id, user_id, display_name) VALUES (fa, ua, 'Membro A') RETURNING id INTO ma;
  INSERT INTO public.family_members (family_id, user_id, display_name) VALUES (fb, ub, 'Membro B') RETURNING id INTO mb;
  INSERT INTO public.accounts (family_id, owner_member_id, name, type) VALUES (fa, ma, 'Corrente A', 'corrente') RETURNING id INTO ca;
  INSERT INTO public.accounts (family_id, owner_member_id, name, type) VALUES (fb, mb, 'Corrente B', 'corrente') RETURNING id INTO cb;
  INSERT INTO public.accounts (family_id, name, type, closing_day, due_day) VALUES (fa, 'Cartão A', 'cartao', 10, 20) RETURNING id INTO cart;
  INSERT INTO public.accounts (family_id, name, type) VALUES (fa, 'Carteira A', 'investimento') RETURNING id INTO inv;
  INSERT INTO public.investment_wallets (family_id, account_id) VALUES (fa, inv);
  INSERT INTO public.accounts (family_id, name, type, archived_at) VALUES (fa, 'Arquivada A', 'corrente', now()) RETURNING id INTO arq;
  INSERT INTO public.categories (family_id, name, type) VALUES (fa, 'Assinaturas A', 'despesa') RETURNING id INTO cat_a;
  INSERT INTO public.accounts (family_id, owner_member_id, name, type) VALUES (fa, ma, 'Corrente A2', 'corrente') RETURNING id INTO ca2;

  -- ============================================================ como A
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  -- R01 controle positivo: cria e gera mês atual + 11 = 12 linhas pendentes.
  v_estado := 'ok';
  BEGIN
    SELECT r.regra_id, r.lancamentos INTO regra_a, n FROM public.recorrencia_criar(jsonb_build_object(
      'type', 'despesa', 'description', 'Netflix', 'amount', 55.90, 'date', hoje,
      'account_id', ca, 'category_id', cat_a)) r;
  EXCEPTION WHEN OTHERS THEN v_estado := SQLSTATE || ' ' || SQLERRM;
  END;
  SELECT count(*), count(*) FILTER (WHERE NOT is_paid) INTO n2, v_num
  FROM public.transactions WHERE recurring_rule_id = regra_a;
  v_total := v_total + 1;
  IF v_estado = 'ok' AND n = 12 AND n2 = 12 AND v_num = 12 THEN v_linhas := v_linhas || E'\n  PASS  R01 A cria assinatura: 12 lançamentos pendentes (mês atual + 11)';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA R01 criar — ' || v_estado || ' gerados=' || coalesce(n, -1) || ' linhas=' || n2; END IF;

  -- Fixtures pelas RPCs: salário iniciado 2 meses atrás (passado = pendente e
  -- entra na fila), assinatura que nasce paga, assinatura no cartão no passado.
  BEGIN
  SELECT r.regra_id INTO regra_p FROM public.recorrencia_criar(jsonb_build_object(
    'type', 'receita', 'description', 'Salário', 'amount', 3000, 'date', (hoje - interval '2 months')::date,
    'account_id', ca)) r;
  SELECT r.regra_id INTO regra_paga FROM public.recorrencia_criar(jsonb_build_object(
    'type', 'despesa', 'description', 'Faculdade', 'amount', 800, 'date', hoje,
    'account_id', ca, 'is_paid', true, 'paid_date', hoje)) r;
  SELECT r.regra_id INTO regra_cart FROM public.recorrencia_criar(jsonb_build_object(
    'type', 'despesa', 'description', 'Spotify', 'amount', 21.90, 'date', (hoje - interval '1 month')::date,
    'account_id', cart)) r;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'PLACAR recorrencia-rls: % de % passaram, % falha(s)%', v_total - v_falhas, v_total + 1, v_falhas + 1,
      v_linhas || E'\n  FALHA F00 fixtures pelas RPCs — ' || SQLSTATE || ' ' || SQLERRM;
  END;

  -- R01b: salário passado gerou 14 meses (−2 .. +11), todos pendentes.
  SELECT count(*), count(*) FILTER (WHERE is_paid) INTO n, n2 FROM public.transactions WHERE recurring_rule_id = regra_p;
  v_total := v_total + 1;
  IF n = 14 AND n2 = 0 THEN v_linhas := v_linhas || E'\n  PASS  R01b início no passado gera os meses passados pendentes (14)';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA R01b linhas=' || n || ' pagas=' || n2; END IF;

  -- R01c: nasce paga só no 1º mês, com o paid_date enviado.
  SELECT count(*) FILTER (WHERE is_paid), bool_and((recurring_period = mes) = is_paid)
    INTO n, v_b FROM public.transactions WHERE recurring_rule_id = regra_paga;
  SELECT paid_date INTO v_d FROM public.transactions WHERE recurring_rule_id = regra_paga AND recurring_period = mes;
  v_total := v_total + 1;
  IF n = 1 AND v_b AND v_d = hoje THEN v_linhas := v_linhas || E'\n  PASS  R01c "já pago" na criação marca só o 1º mês';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA R01c pagas=' || n || ' ok=' || coalesce(v_b::text, 'null') || ' paid_date=' || coalesce(v_d::text, 'null'); END IF;

  -- K01: cartão + já pago = recusa (1ª recusa: checagem de cartão em recorrencia_criar).
  v_estado := 'ok';
  BEGIN
    PERFORM public.recorrencia_criar(jsonb_build_object('type', 'despesa', 'description', 'X', 'amount', 10,
      'date', hoje, 'account_id', cart, 'is_paid', true, 'paid_date', hoje));
  EXCEPTION WHEN OTHERS THEN v_estado := SQLERRM;
  END;
  v_total := v_total + 1;
  IF v_estado = 'Assinatura no cartão é paga junto com a fatura' THEN v_linhas := v_linhas || E'\n  PASS  K01 cartão não nasce pago';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA K01 — ' || v_estado; END IF;

  -- K02: "já pago" na criação com data futura (1ª recusa: janela da data, antes de gravar).
  v_estado := 'ok';
  BEGIN
    PERFORM public.recorrencia_criar(jsonb_build_object('type', 'despesa', 'description', 'X', 'amount', 10,
      'date', hoje, 'account_id', ca, 'is_paid', true, 'paid_date', hoje + 1));
  EXCEPTION WHEN OTHERS THEN v_estado := SQLERRM;
  END;
  v_total := v_total + 1;
  IF v_estado = 'A data do pagamento não pode ser no futuro' THEN v_linhas := v_linhas || E'\n  PASS  K02 "já pago" na criação não aceita data de pagamento futura';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA K02 — ' || v_estado; END IF;

  -- K03: receita no cartão nunca seria paga (1ª recusa: tipo x cartão).
  v_estado := 'ok';
  BEGIN
    PERFORM public.recorrencia_criar(jsonb_build_object('type', 'receita', 'description', 'Cashback', 'amount', 10,
      'date', hoje, 'account_id', cart));
  EXCEPTION WHEN OTHERS THEN v_estado := SQLERRM;
  END;
  v_total := v_total + 1;
  IF v_estado = 'Receita recorrente não pode ser no cartão' THEN v_linhas := v_linhas || E'\n  PASS  K03 receita recorrente no cartão recusada';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA K03 — ' || v_estado; END IF;

  -- C01: conta-carteira recusada ANTES do trigger da carteira (1ª recusa: investment_wallets).
  v_estado := 'ok';
  BEGIN
    PERFORM public.recorrencia_criar(jsonb_build_object('type', 'despesa', 'description', 'X', 'amount', 10,
      'date', hoje, 'account_id', inv));
  EXCEPTION WHEN OTHERS THEN v_estado := SQLERRM;
  END;
  v_total := v_total + 1;
  IF v_estado = 'A carteira de investimento não aceita recorrência' THEN v_linhas := v_linhas || E'\n  PASS  C01 conta-carteira recusada';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA C01 — ' || v_estado; END IF;

  -- V01..V04: validações da criação.
  v_estado := 'ok';
  BEGIN
    PERFORM public.recorrencia_criar(jsonb_build_object('type', 'transferencia', 'description', 'X', 'amount', 10, 'date', hoje, 'account_id', ca));
  EXCEPTION WHEN OTHERS THEN v_estado := SQLERRM;
  END;
  v_total := v_total + 1;
  IF v_estado = 'Recorrência só para entrada ou saída' THEN v_linhas := v_linhas || E'\n  PASS  V01 transferência recusada';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA V01 — ' || v_estado; END IF;

  v_estado := 'ok';
  BEGIN
    PERFORM public.recorrencia_criar(jsonb_build_object('type', 'despesa', 'description', 'X', 'amount', 10.005, 'date', hoje, 'account_id', ca));
  EXCEPTION WHEN OTHERS THEN v_estado := SQLERRM;
  END;
  v_total := v_total + 1;
  IF v_estado = 'Valor inválido' THEN v_linhas := v_linhas || E'\n  PASS  V02 valor com 3 casas recusado';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA V02 — ' || v_estado; END IF;

  v_estado := 'ok';
  BEGIN
    PERFORM public.recorrencia_criar(jsonb_build_object('type', 'despesa', 'description', 'X', 'amount', 10, 'date', hoje, 'account_id', arq));
  EXCEPTION WHEN OTHERS THEN v_estado := SQLERRM;
  END;
  v_total := v_total + 1;
  IF v_estado = 'Esta conta está arquivada' THEN v_linhas := v_linhas || E'\n  PASS  V03 conta arquivada recusada';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA V03 — ' || v_estado; END IF;

  v_estado := 'ok';
  BEGIN
    PERFORM public.recorrencia_criar(jsonb_build_object('type', 'despesa', 'description', 'X', 'amount', 10,
      'date', (mes - interval '109 months')::date, 'account_id', ca));
  EXCEPTION WHEN OTHERS THEN v_estado := SQLERRM;
  END;
  v_total := v_total + 1;
  IF v_estado = 'A data de início pode ser no máximo 9 anos atrás' THEN v_linhas := v_linhas || E'\n  PASS  V04 início antes de 108 meses recusado';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA V04 — ' || v_estado; END IF;

  v_estado := 'ok';
  BEGIN
    PERFORM public.recorrencia_criar(jsonb_build_object('type', 'despesa', 'description', 'X', 'amount', 10,
      'date', (mes + interval '25 months')::date, 'account_id', ca));
  EXCEPTION WHEN OTHERS THEN v_estado := SQLERRM;
  END;
  v_total := v_total + 1;
  IF v_estado = 'A data de início pode ser no máximo 2 anos à frente' THEN v_linhas := v_linhas || E'\n  PASS  V05 início além de 24 meses recusado';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA V05 — ' || v_estado; END IF;

  -- D03 + D01: início além do horizonte gera só o 1º mês; dia 31 vira o último dia.
  SELECT r.regra_id, r.lancamentos INTO regra31, n FROM public.recorrencia_criar(jsonb_build_object(
    'type', 'despesa', 'description', 'Dia 31', 'amount', 10, 'date', make_date(y2, 1, 31), 'account_id', ca)) r;
  v_total := v_total + 1;
  IF n = 1 THEN v_linhas := v_linhas || E'\n  PASS  D03 início além do horizonte gera exatamente 1 lançamento';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA D03 gerados=' || n; END IF;

  -- D02: cartão fecha dia 10; compra no dia 10 cai na fatura do mês seguinte.
  SELECT r.regra_id INTO regra_cfut FROM public.recorrencia_criar(jsonb_build_object(
    'type', 'despesa', 'description', 'Cartão dia 10', 'amount', 10, 'date', make_date(y2, 1, 10), 'account_id', cart)) r;
  SELECT invoice_year * 100 + invoice_month INTO n FROM public.transactions WHERE recurring_rule_id = regra_cfut;
  v_total := v_total + 1;
  IF n = y2 * 100 + 2 THEN v_linhas := v_linhas || E'\n  PASS  D02 dia do fechamento cai na fatura seguinte (' || y2 || '/02)';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA D02 fatura=' || coalesce(n, -1); END IF;

  -- ------------------------------------------------------------ pop-up
  SELECT count(*) INTO n FROM public.recorrencia_fila_de_cobranca() q;
  SELECT q.id INTO tx_velho FROM public.recorrencia_fila_de_cobranca() q ORDER BY q.date, q.id LIMIT 1;
  SELECT q.id INTO tx_meio FROM public.recorrencia_fila_de_cobranca() q ORDER BY q.date, q.id OFFSET 1 LIMIT 1;
  SELECT t.id INTO tx_atual FROM public.transactions t WHERE t.recurring_rule_id = regra_a AND t.recurring_period = mes;
  SELECT t.id INTO tx_cart FROM public.transactions t WHERE t.recurring_rule_id = regra_cart AND t.recurring_period = (mes - interval '1 month')::date;
  SELECT count(*) INTO n2 FROM public.recorrencia_fila_de_cobranca() q WHERE q.recurring_rule_id IN (regra_cart, regra_paga);
  -- Esperado: salário −2, −1, atual (3) + Netflix atual (1) = 4. Fora: a paga e o cartão.
  v_total := v_total + 1;
  IF n = 4 AND n2 = 0 AND tx_velho IS NOT NULL THEN v_linhas := v_linhas || E'\n  PASS  P00 fila: 4 vencidas, sem a paga e sem a do cartão';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA P00 fila=' || n || ' paga/cartão na fila=' || n2; END IF;

  -- P06: 'pago' sem data. P04: data futura. P05: antes de 2000. P08: resposta inválida.
  v_estado := 'ok';
  BEGIN PERFORM public.recorrencia_responder(tx_meio, 'pago', NULL);
  EXCEPTION WHEN OTHERS THEN v_estado := SQLERRM; END;
  v_total := v_total + 1;
  IF v_estado = 'Informe a data do pagamento' THEN v_linhas := v_linhas || E'\n  PASS  P06 "pago" exige data';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA P06 — ' || v_estado; END IF;

  v_estado := 'ok';
  BEGIN PERFORM public.recorrencia_responder(tx_meio, 'pago', hoje + 1);
  EXCEPTION WHEN OTHERS THEN v_estado := SQLERRM; END;
  SELECT is_paid INTO v_b FROM public.transactions WHERE id = tx_meio;
  v_total := v_total + 1;
  IF v_estado = 'A data do pagamento não pode ser no futuro' AND NOT v_b THEN v_linhas := v_linhas || E'\n  PASS  P04 data de pagamento futura recusada, linha continua pendente';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA P04 — ' || v_estado || ' pago=' || v_b; END IF;

  v_estado := 'ok';
  BEGIN PERFORM public.recorrencia_responder(tx_meio, 'pago', DATE '1999-12-31');
  EXCEPTION WHEN OTHERS THEN v_estado := SQLERRM; END;
  v_total := v_total + 1;
  IF v_estado = 'Data do pagamento inválida' THEN v_linhas := v_linhas || E'\n  PASS  P05 data antes de 2000 recusada';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA P05 — ' || v_estado; END IF;

  v_estado := 'ok';
  BEGIN PERFORM public.recorrencia_responder(tx_meio, 'talvez', hoje);
  EXCEPTION WHEN OTHERS THEN v_estado := SQLERRM; END;
  v_total := v_total + 1;
  IF v_estado = 'Resposta inválida' THEN v_linhas := v_linhas || E'\n  PASS  P08 resposta inválida recusada';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA P08 — ' || v_estado; END IF;

  -- P01: 'pago' com data PASSADA (o vencimento da mais velha) grava paid_date = data enviada.
  SELECT date INTO v_d FROM public.transactions WHERE id = tx_velho;
  BEGIN v_txt := public.recorrencia_responder(tx_velho, 'pago', v_d);
  EXCEPTION WHEN OTHERS THEN v_txt := SQLERRM; END;
  SELECT is_paid INTO v_b FROM public.transactions WHERE id = tx_velho;
  v_total := v_total + 1;
  IF v_txt = 'pago' AND v_b AND v_d < hoje AND (SELECT paid_date FROM public.transactions WHERE id = tx_velho) = v_d THEN
    v_linhas := v_linhas || E'\n  PASS  P01 "pago" com data passada grava paid_date = data enviada';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA P01 — ' || coalesce(v_txt, 'null') || ' pago=' || coalesce(v_b::text, 'null'); END IF;

  v_txt := public.recorrencia_responder(tx_velho, 'pago', hoje);
  v_total := v_total + 1;
  IF v_txt = 'ja_respondida' AND (SELECT paid_date FROM public.transactions WHERE id = tx_velho) = v_d THEN
    v_linhas := v_linhas || E'\n  PASS  P01b 2ª resposta = ja_respondida, sem regravar a data';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA P01b — ' || coalesce(v_txt, 'null'); END IF;

  -- P02: 'ainda_nao' adia até amanhã e some da fila; 2ª vez no mesmo dia = ja_respondida.
  BEGIN v_txt := public.recorrencia_responder(tx_meio, 'ainda_nao');
  EXCEPTION WHEN OTHERS THEN v_txt := SQLERRM; END;
  SELECT prompt_snoozed_until INTO v_d FROM public.transactions WHERE id = tx_meio;
  SELECT count(*) INTO n FROM public.recorrencia_fila_de_cobranca() q WHERE q.id = tx_meio;
  v_total := v_total + 1;
  IF v_txt = 'adiado' AND v_d = hoje + 1 AND n = 0 AND public.recorrencia_responder(tx_meio, 'ainda_nao') = 'ja_respondida' THEN
    v_linhas := v_linhas || E'\n  PASS  P02 "ainda não" adia até amanhã e tira da fila';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA P02 — ' || coalesce(v_txt, 'null') || ' snooze=' || coalesce(v_d::text, 'null') || ' na fila=' || n; END IF;

  -- P03: cartão não é respondível (1ª recusa: EXISTS accounts type <> cartao).
  v_txt := public.recorrencia_responder(tx_cart, 'pago', hoje);
  SELECT is_paid INTO v_b FROM public.transactions WHERE id = tx_cart;
  v_total := v_total + 1;
  IF v_txt = 'ja_respondida' AND NOT v_b THEN v_linhas := v_linhas || E'\n  PASS  P03 assinatura no cartão não é marcada paga pelo pop-up';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA P03 — ' || coalesce(v_txt, 'null') || ' pago=' || v_b; END IF;

  -- B01 (migration 00020): "a receber"/"a pagar" da conta só até o fim do mês
  -- atual. O salário recorrente tem 11 meses futuros pendentes na conta ca: sem
  -- a 00020 eles entram e o caso fica vermelho.
  SELECT pending_inflow, pending_outflow INTO v_num, v_d_num
  FROM public.v_account_balances WHERE account_id = ca;
  SELECT COALESCE(sum(amount) FILTER (WHERE type = 'receita'), 0),
         COALESCE(sum(amount) FILTER (WHERE type IN ('despesa', 'investimento')), 0)
    INTO v_esp_in, v_esp_out
  FROM public.transactions
  WHERE account_id = ca AND NOT is_paid
    AND date <= (mes + interval '1 month - 1 day')::date;
  v_total := v_total + 1;
  IF v_num = v_esp_in AND v_d_num = v_esp_out AND v_esp_in > 0 THEN
    v_linhas := v_linhas || E'\n  PASS  B01 v_account_balances: pendente só até o fim do mês (a receber ' || v_num || ', a pagar ' || v_d_num || ')';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA B01 view a receber/a pagar=' || v_num || '/' || v_d_num || ' esperado=' || v_esp_in || '/' || v_esp_out; END IF;

  -- ------------------------------------------------------------ trava das colunas (como A, REST)
  v_estado := 'ok';
  BEGIN UPDATE public.transactions SET recurring_rule_id = NULL WHERE id = tx_atual;
  EXCEPTION WHEN OTHERS THEN v_estado := SQLSTATE; END;
  v_total := v_total + 1;
  IF v_estado = '42501' THEN v_linhas := v_linhas || E'\n  PASS  T01 cliente não desfaz o vínculo com a regra (42501 do trigger)';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA T01 — ' || v_estado; END IF;

  v_estado := 'ok';
  BEGIN UPDATE public.transactions SET prompt_snoozed_until = hoje + 30 WHERE id = tx_atual;
  EXCEPTION WHEN OTHERS THEN v_estado := SQLSTATE; END;
  v_total := v_total + 1;
  IF v_estado = '42501' THEN v_linhas := v_linhas || E'\n  PASS  T03 cliente não adia o pop-up por REST';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA T03 — ' || v_estado; END IF;

  v_estado := 'ok';
  BEGIN
    INSERT INTO public.transactions (family_id, type, description, amount, date, account_id,
      created_by_member_id, paid_by_member_id, recurring_rule_id, recurring_period)
    VALUES (fa, 'despesa', 'forjada', 1, hoje, ca, ma, ma, regra_a, (mes + interval '30 months')::date);
  EXCEPTION WHEN OTHERS THEN v_estado := SQLSTATE; END;
  v_total := v_total + 1;
  IF v_estado = '42501' THEN v_linhas := v_linhas || E'\n  PASS  T02 cliente não insere linha recorrente por REST';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA T02 — ' || v_estado; END IF;

  -- T04 controle: editar "só este mês" (valor e descrição) continua permitido.
  v_estado := 'ok';
  BEGIN UPDATE public.transactions SET amount = 60.00, description = 'Netflix (só este mês)' WHERE id = tx_atual;
  EXCEPTION WHEN OTHERS THEN v_estado := SQLSTATE || ' ' || SQLERRM; END;
  v_total := v_total + 1;
  IF v_estado = 'ok' AND (SELECT amount FROM public.transactions WHERE id = tx_atual) = 60.00 THEN
    v_linhas := v_linhas || E'\n  PASS  T04 edição comum de uma linha recorrente continua livre';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA T04 — ' || v_estado; END IF;

  -- ------------------------------------------------------------ alterar valor / encerrar (como A)
  RESET ROLE;
  -- Pré-pago no mês +8 (simula pagar adiantado): tem de sobreviver a tudo.
  UPDATE public.transactions SET is_paid = true, paid_date = hoje
   WHERE recurring_rule_id = regra_a AND recurring_period = (mes + interval '8 months')::date;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  v_estado := 'ok';
  BEGIN n := public.recorrencia_alterar_valor(regra_a, 59.90, (mes + interval '3 months')::date);
  EXCEPTION WHEN OTHERS THEN v_estado := SQLERRM; END;
  v_total := v_total + 1;
  IF v_estado = 'ok' AND n = 8
     AND (SELECT amount FROM public.transactions WHERE recurring_rule_id = regra_a AND recurring_period = (mes + interval '2 months')::date) = 55.90
     AND (SELECT amount FROM public.transactions WHERE recurring_rule_id = regra_a AND recurring_period = (mes + interval '3 months')::date) = 59.90
     AND (SELECT amount FROM public.transactions WHERE recurring_rule_id = regra_a AND recurring_period = (mes + interval '8 months')::date) = 55.90
     AND (SELECT amount FROM public.recurring_rules WHERE id = regra_a) = 59.90 THEN
    v_linhas := v_linhas || E'\n  PASS  E01 "deste mês em diante": 8 pendentes mudam; anterior e pago ficam';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA E01 — ' || v_estado || ' alterados=' || coalesce(n, -1); END IF;

  v_estado := 'ok';
  BEGIN PERFORM public.recorrencia_alterar_valor(regra_a, 1, (mes - interval '1 month')::date);
  EXCEPTION WHEN OTHERS THEN v_estado := SQLERRM; END;
  v_txt := v_estado;
  v_estado := 'ok';
  BEGIN PERFORM public.recorrencia_alterar_valor(regra_a, 1, mes + 3);
  EXCEPTION WHEN OTHERS THEN v_estado := SQLERRM; END;
  v_total := v_total + 1;
  IF v_txt = 'Mês inválido' AND v_estado = 'Mês inválido' THEN v_linhas := v_linhas || E'\n  PASS  E03 mês antes do início ou fora do dia 1 recusado';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA E03 — ' || v_txt || ' / ' || v_estado; END IF;

  v_estado := 'ok';
  BEGIN n := public.recorrencia_encerrar(regra_a, (mes + interval '6 months')::date);
  EXCEPTION WHEN OTHERS THEN v_estado := SQLERRM; END;
  PERFORM public.recorrencia_fila_de_cobranca();   -- renovar não recria nada
  SELECT count(*) INTO n2 FROM public.transactions WHERE recurring_rule_id = regra_a;
  v_total := v_total + 1;
  -- Apagados: +7, +9, +10, +11 (4). Ficam: 0..+6 (7) + o pago +8 = 8.
  IF v_estado = 'ok' AND n = 4 AND n2 = 8
     AND EXISTS (SELECT 1 FROM public.transactions WHERE recurring_rule_id = regra_a AND recurring_period = (mes + interval '8 months')::date AND is_paid) THEN
    v_linhas := v_linhas || E'\n  PASS  E02 encerrar apaga 4 pendentes futuros; pago e passado ficam; renovar não recria';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA E02 — ' || v_estado || ' apagados=' || coalesce(n, -1) || ' restantes=' || n2; END IF;

  v_estado := 'ok';
  BEGIN PERFORM public.recorrencia_encerrar(regra_a, (mes + interval '9 months')::date);
  EXCEPTION WHEN OTHERS THEN v_estado := SQLERRM; END;
  v_txt := v_estado;
  v_estado := 'ok';
  BEGIN PERFORM public.recorrencia_encerrar(regra_p, (mes - interval '3 months')::date);
  EXCEPTION WHEN OTHERS THEN v_estado := SQLERRM; END;
  v_total := v_total + 1;
  IF v_txt = 'Para estender, crie uma assinatura nova' AND v_estado = 'Mês inválido' THEN
    v_linhas := v_linhas || E'\n  PASS  E04 encerrar não estende nem vai antes do início';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA E04 — ' || v_txt || ' / ' || v_estado; END IF;

  -- E05: "deste mês em diante" não reescreve mês passado, mesmo depois do início.
  v_estado := 'ok';
  BEGIN PERFORM public.recorrencia_alterar_valor(regra_p, 1, (mes - interval '1 month')::date);
  EXCEPTION WHEN OTHERS THEN v_estado := SQLERRM; END;
  v_total := v_total + 1;
  IF v_estado = 'Mês inválido' AND NOT EXISTS (SELECT 1 FROM public.transactions WHERE recurring_rule_id = regra_p AND amount <> 3000) THEN
    v_linhas := v_linhas || E'\n  PASS  E05 alterar valor recusa mês passado (pendente atrasado fica com o valor antigo)';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA E05 — ' || v_estado; END IF;

  -- I01: a fila chamada de novo não duplica.
  SELECT count(*) INTO n FROM public.transactions WHERE recurring_rule_id = regra_p;
  PERFORM public.recorrencia_fila_de_cobranca();
  PERFORM public.recorrencia_fila_de_cobranca();
  SELECT count(*) INTO n2 FROM public.transactions WHERE recurring_rule_id = regra_p;
  v_total := v_total + 1;
  IF n = 14 AND n2 = 14 THEN v_linhas := v_linhas || E'\n  PASS  I01 renovar várias vezes não duplica (14 = 14)';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA I01 antes=' || n || ' depois=' || n2; END IF;

  -- I03 (parte 1): A exclui só o mês +4 do salário.
  SELECT id INTO tx FROM public.transactions WHERE recurring_rule_id = regra_p AND recurring_period = (mes + interval '4 months')::date;
  PERFORM public.delete_transactions(tx, 'single');

  -- ============================================================ como B (intruso)
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  -- R02: B não lê a regra de A (1ª barreira: policy SELECT por família).
  SELECT count(*) INTO n FROM public.recurring_rules WHERE id IN (regra_a, regra_p);
  v_total := v_total + 1;
  IF n = 0 THEN v_linhas := v_linhas || E'\n  PASS  R02 B não lê regras de A (0 de 2)';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA R02 B leu ' || n || ' regra(s) de A'; END IF;

  -- R03: B insere regra na família de A com referências válidas de A (1ª barreira: sem grant).
  v_estado := 'ok';
  BEGIN
    INSERT INTO public.recurring_rules (family_id, type, description, amount, account_id, paid_by_member_id,
      created_by_member_id, day_of_month, start_period, generated_through)
    VALUES (fa, 'despesa', 'forjada por B', 1, ca, ma, ma, 1, mes, (mes - interval '1 month')::date);
  EXCEPTION WHEN OTHERS THEN v_estado := SQLSTATE;
  END;
  RESET ROLE;
  SELECT count(*) INTO n FROM public.recurring_rules WHERE family_id = fa AND description = 'forjada por B';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  v_total := v_total + 1;
  IF v_estado = '42501' AND n = 0 THEN v_linhas := v_linhas || E'\n  PASS  R03 B não insere regra em A (42501)';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA R03 — ' || v_estado || ' gravadas em A=' || n; END IF;

  -- R04: B altera a regra de A direto (1ª barreira: sem grant de UPDATE).
  v_estado := 'ok';
  BEGIN UPDATE public.recurring_rules SET amount = 1 WHERE id = regra_p;
  EXCEPTION WHEN OTHERS THEN v_estado := SQLSTATE;
  END;
  RESET ROLE;
  SELECT amount INTO v_num FROM public.recurring_rules WHERE id = regra_p;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  v_total := v_total + 1;
  IF v_num = 3000 THEN v_linhas := v_linhas || E'\n  PASS  R04 B não altera regra de A (' || v_estado || ')';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA R04 regra de A virou ' || v_num || ' (' || v_estado || ')'; END IF;

  -- R05: B muda o valor da regra de A pela RPC (1ª recusa: lookup id AND family_id).
  v_estado := 'ok';
  BEGIN PERFORM public.recorrencia_alterar_valor(regra_p, 1, mes);
  EXCEPTION WHEN OTHERS THEN v_estado := SQLERRM; END;
  RESET ROLE;
  SELECT count(*) INTO n FROM public.transactions WHERE recurring_rule_id = regra_p AND amount <> 3000;
  SELECT amount INTO v_num FROM public.recurring_rules WHERE id = regra_p;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  v_total := v_total + 1;
  IF v_estado = 'Assinatura não encontrada' AND n = 0 AND v_num = 3000 THEN v_linhas := v_linhas || E'\n  PASS  R05 B não altera valor de A pela RPC';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA R05 — ' || v_estado || ' linhas de A alteradas=' || n || ' regra=' || v_num; END IF;

  -- R06: B encerra a regra de A (1ª recusa: lookup id AND family_id).
  RESET ROLE;
  SELECT count(*) INTO n2 FROM public.transactions WHERE recurring_rule_id = regra_p;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  v_estado := 'ok';
  BEGIN PERFORM public.recorrencia_encerrar(regra_p, mes);
  EXCEPTION WHEN OTHERS THEN v_estado := SQLERRM; END;
  RESET ROLE;
  SELECT count(*) INTO n FROM public.transactions WHERE recurring_rule_id = regra_p;
  SELECT end_period INTO v_d FROM public.recurring_rules WHERE id = regra_p;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  v_total := v_total + 1;
  IF v_estado = 'Assinatura não encontrada' AND n = n2 AND v_d IS NULL THEN v_linhas := v_linhas || E'\n  PASS  R06 B não encerra assinatura de A';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA R06 — ' || v_estado || ' linhas antes/depois=' || n2 || '/' || n || ' fim=' || coalesce(v_d::text, 'null'); END IF;

  -- R07: B responde a cobrança de A (1ª recusa: t.family_id = v_family no UPDATE).
  BEGIN v_txt := public.recorrencia_responder(tx_atual, 'pago', hoje);
  EXCEPTION WHEN OTHERS THEN v_txt := SQLERRM; END;
  RESET ROLE;
  SELECT is_paid INTO v_b FROM public.transactions WHERE id = tx_atual;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  v_total := v_total + 1;
  IF v_txt = 'ja_respondida' AND NOT v_b THEN v_linhas := v_linhas || E'\n  PASS  R07 B não marca como paga a cobrança de A';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA R07 — ' || coalesce(v_txt, 'null') || ' linha de A paga=' || v_b; END IF;

  v_txt := public.recorrencia_responder(tx_atual, 'ainda_nao');
  RESET ROLE;
  SELECT prompt_snoozed_until INTO v_d FROM public.transactions WHERE id = tx_atual;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  v_total := v_total + 1;
  IF v_txt = 'ja_respondida' AND v_d IS NULL THEN v_linhas := v_linhas || E'\n  PASS  R07b B não adia a cobrança de A';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA R07b — ' || coalesce(v_txt, 'null') || ' snooze de A=' || coalesce(v_d::text, 'null'); END IF;

  -- R08: a fila de B não mostra nada de A.
  SELECT count(*) INTO n FROM public.recorrencia_fila_de_cobranca() q
  WHERE q.recurring_rule_id IN (regra_a, regra_p, regra_paga, regra_cart);
  v_total := v_total + 1;
  IF n = 0 THEN v_linhas := v_linhas || E'\n  PASS  R08 fila de B sem cobranças de A';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA R08 fila de B mostrou ' || n || ' de A'; END IF;

  -- R09: B cria regra apontando para a conta de A (1ª recusa: lookup da conta na família).
  v_estado := 'ok';
  BEGIN
    PERFORM public.recorrencia_criar(jsonb_build_object('type', 'despesa', 'description', 'X', 'amount', 10, 'date', hoje, 'account_id', ca));
  EXCEPTION WHEN OTHERS THEN v_estado := SQLERRM; END;
  v_total := v_total + 1;
  IF v_estado = 'Conta não encontrada nesta família' THEN v_linhas := v_linhas || E'\n  PASS  R09 B não cria regra na conta de A';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA R09 — ' || v_estado; END IF;

  -- R10: B não chama o gerador interno (sem EXECUTE).
  v_estado := 'ok';
  BEGIN PERFORM public.recorrencia_gerar(fa, (mes + interval '30 months')::date);
  EXCEPTION WHEN OTHERS THEN v_estado := SQLSTATE; END;
  v_total := v_total + 1;
  IF v_estado = '42501' THEN v_linhas := v_linhas || E'\n  PASS  R10 cliente não executa recorrencia_gerar';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA R10 — ' || v_estado; END IF;

  -- A01: anon não lê recurring_rules.
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  SET LOCAL ROLE anon;
  v_estado := 'ok';
  BEGIN SELECT count(*) INTO n FROM public.recurring_rules;
  EXCEPTION WHEN OTHERS THEN v_estado := SQLSTATE; END;
  v_total := v_total + 1;
  IF v_estado = '42501' THEN v_linhas := v_linhas || E'\n  PASS  A01 anon sem acesso a recurring_rules';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA A01 — ' || v_estado; END IF;

  -- ============================================================ postgres: tempo e índice
  RESET ROLE;

  -- D01: dia 31 de janeiro de y2 (regra31) em fevereiro, março e abril.
  PERFORM public.recorrencia_gerar(fa, make_date(y2, 4, 1));
  SELECT string_agg(date::text, ' ' ORDER BY date) INTO v_txt FROM public.transactions WHERE recurring_rule_id = regra31;
  v_total := v_total + 1;
  IF v_txt = make_date(y2, 1, 31)::text || ' ' || (make_date(y2, 3, 1) - 1)::text || ' '
             || make_date(y2, 3, 31)::text || ' ' || make_date(y2, 4, 30)::text THEN v_linhas := v_linhas || E'\n  PASS  D01 dia 31: ' || v_txt;
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA D01 datas=' || coalesce(v_txt, 'null'); END IF;

  -- I02: gerar 2 vezes o mesmo alvo: a 2ª insere 0. Alvo depois de todas as
  -- marcas d'água deste teste (a mais alta é a da regra31, abril de y2).
  n  := public.recorrencia_gerar(fa, make_date(y2 + 1, 12, 1));
  n2 := public.recorrencia_gerar(fa, make_date(y2 + 1, 12, 1));
  v_total := v_total + 1;
  IF n > 0 AND n2 = 0 THEN v_linhas := v_linhas || E'\n  PASS  I02 gerar o mesmo alvo 2 vezes: ' || n || ' e depois 0';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA I02 1ª=' || n || ' 2ª=' || n2; END IF;

  -- I03 (parte 2): o mês +4 excluído por A não renasceu, e a regra encerrada não cresceu.
  SELECT count(*) INTO n FROM public.transactions WHERE recurring_rule_id = regra_p AND recurring_period = (mes + interval '4 months')::date;
  SELECT count(*) INTO n2 FROM public.transactions WHERE recurring_rule_id = regra_a;
  v_total := v_total + 1;
  IF n = 0 AND n2 = 8 THEN v_linhas := v_linhas || E'\n  PASS  I03 mês excluído não renasce; regra encerrada não cresce';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA I03 mês excluído=' || n || ' linhas da encerrada=' || n2; END IF;

  -- T05: ser postgres NÃO basta para gravar as colunas novas (só a chave das RPCs).
  v_estado := 'ok';
  BEGIN
    INSERT INTO public.transactions (family_id, type, description, amount, date, account_id,
      created_by_member_id, paid_by_member_id, recurring_rule_id, recurring_period)
    VALUES (fa, 'receita', 'sem chave', 1, hoje, ca, ma, ma, regra_p, (mes + interval '200 months')::date);
  EXCEPTION WHEN OTHERS THEN v_estado := SQLSTATE; END;
  v_total := v_total + 1;
  IF v_estado = '42501' THEN v_linhas := v_linhas || E'\n  PASS  T05 postgres sem a chave app.recorrencia_rpc também é recusado';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA T05 — ' || v_estado; END IF;

  -- X02: conta arquivada pausa a assinatura: o mês avança sem gerar.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT r.regra_id INTO tx FROM public.recorrencia_criar(jsonb_build_object(
    'type', 'despesa', 'description', 'Na A2', 'amount', 10, 'date', hoje, 'account_id', ca2)) r;
  RESET ROLE;
  UPDATE public.accounts SET archived_at = now() WHERE id = ca2;
  SELECT count(*) INTO n FROM public.transactions WHERE recurring_rule_id = tx;
  PERFORM public.recorrencia_gerar(fa, (mes + interval '30 months')::date, tx);
  SELECT count(*) INTO n2 FROM public.transactions WHERE recurring_rule_id = tx;
  SELECT generated_through INTO v_d FROM public.recurring_rules WHERE id = tx;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n2 FROM public.transactions WHERE recurring_rule_id = tx;
  SELECT count(*) INTO v_num FROM public.recorrencia_fila_de_cobranca() q WHERE q.recurring_rule_id = tx;
  RESET ROLE;
  v_total := v_total + 1;
  IF n = 12 AND n2 = 12 AND v_d = (mes + interval '11 months')::date AND v_num = 0 THEN
    v_linhas := v_linhas || E'\n  PASS  X02 conta arquivada: nenhum mês novo, marca d''água não pula o futuro, fora da fila';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA X02 antes=' || n || ' depois=' || n2 || ' marca=' || coalesce(v_d::text, 'null') || ' na fila=' || v_num; END IF;

  -- I04: o índice único barra um segundo lançamento no mesmo mês da mesma regra
  -- (com a chave das RPCs ligada, para passar pelo trigger e chegar ao índice).
  PERFORM set_config('app.recorrencia_rpc', 'on', true);
  v_estado := 'ok';
  BEGIN
    INSERT INTO public.transactions (family_id, type, description, amount, date, account_id,
      created_by_member_id, paid_by_member_id, recurring_rule_id, recurring_period)
    VALUES (fa, 'receita', 'dup', 1, hoje, ca, ma, ma, regra_p, mes);
  EXCEPTION WHEN OTHERS THEN v_estado := SQLSTATE; END;
  v_total := v_total + 1;
  PERFORM set_config('app.recorrencia_rpc', 'off', true);
  IF v_estado = '23505' THEN v_linhas := v_linhas || E'\n  PASS  I04 índice único (regra, mês) barra duplicata';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA I04 — ' || v_estado; END IF;

  -- F01: a limpeza dos scripts (service_role: lançamentos -> família) apaga as
  -- regras em cascata, sem RESTRICT no meio.
  v_estado := 'ok';
  BEGIN
    SET LOCAL ROLE service_role;
    DELETE FROM public.transactions WHERE family_id = fa;
    DELETE FROM public.families WHERE id = fa;
    RESET ROLE;
  EXCEPTION WHEN OTHERS THEN v_estado := SQLSTATE || ' ' || SQLERRM;
  END;
  RESET ROLE;
  SELECT count(*) INTO n FROM public.recurring_rules WHERE family_id = fa;
  v_total := v_total + 1;
  IF v_estado = 'ok' AND n = 0 THEN v_linhas := v_linhas || E'\n  PASS  F01 limpeza como service_role apaga regras em cascata';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA F01 — ' || v_estado || ' sobras=' || n; END IF;

  RAISE EXCEPTION 'PLACAR recorrencia-rls: % de % passaram, % falha(s)%',
    v_total - v_falhas, v_total, v_falhas, v_linhas;
END $teste$;
