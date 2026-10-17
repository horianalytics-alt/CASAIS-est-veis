-- Teste da carteira de investimento (migration 00016): isolamento entre
-- famílias, barreiras de saldo, trava da conta-carteira e confirmação manual
-- de rendimento. Plano: docs/planos/estrutura-carteira-investimento.md.
--
-- Roda POR SQL contra o banco hospedado, trocando o papel com
-- SET LOCAL ROLE + request.jwt.claims (o mesmo caminho do PostgREST).
--
-- NUNCA GRAVA NADA: o bloco termina SEMPRE em RAISE EXCEPTION com o placar, e
-- a exceção desfaz a transação inteira. Não toca na família real: as duas
-- famílias são criadas aqui, com usuários de uuid novo.
--
-- O intruso B usa referências VÁLIDAS da vítima A (conta corrente e caixinha
-- de A), não ids chutados (L-018).
--
-- Não rode este arquivo direto: use tests/integration/carteira-rls.mjs.
DO $teste$
DECLARE
  ua uuid := gen_random_uuid();
  ub uuid := gen_random_uuid();
  fa uuid; fb uuid; ma uuid; mb uuid;
  ca uuid; cb uuid; cart uuid; wa uuid;
  box_a uuid; box_r uuid;
  tx_aplic uuid; mov uuid; tx uuid;
  hoje date; m0 date; m1 date; m2 date; m3 date;
  n int; nb bigint; v bigint;
  v_estado text; v_texto text;
  v_total int := 0; v_falhas int := 0; v_linhas text := '';
BEGIN
  hoje := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  m0 := date_trunc('month', hoje - interval '3 months')::date;
  m1 := (m0 + interval '1 month')::date;
  m2 := (m0 + interval '2 months')::date;
  m3 := (m0 + interval '3 months')::date;

  -- ------------------------------------------------------------ fixtures (postgres)
  INSERT INTO auth.users (id, email, aud, role)
  VALUES (ua, 'rls-carteira-a-' || ua || '@example.com', 'authenticated', 'authenticated'),
         (ub, 'rls-carteira-b-' || ub || '@example.com', 'authenticated', 'authenticated');
  INSERT INTO public.families (name, join_code) VALUES ('RLS Carteira A', 'QK2345') RETURNING id INTO fa;
  INSERT INTO public.families (name, join_code) VALUES ('RLS Carteira B', 'QK2346') RETURNING id INTO fb;
  INSERT INTO public.family_members (family_id, user_id, display_name) VALUES (fa, ua, 'Membro A') RETURNING id INTO ma;
  INSERT INTO public.family_members (family_id, user_id, display_name) VALUES (fb, ub, 'Membro B') RETURNING id INTO mb;
  INSERT INTO public.accounts (family_id, owner_member_id, name, type) VALUES (fa, ma, 'Corrente A', 'corrente') RETURNING id INTO ca;
  INSERT INTO public.accounts (family_id, owner_member_id, name, type) VALUES (fb, mb, 'Corrente B', 'corrente') RETURNING id INTO cb;
  INSERT INTO public.accounts (family_id, name, type, closing_day, due_day) VALUES (fa, 'Cartão A', 'cartao', 10, 20) RETURNING id INTO cart;
  INSERT INTO public.transactions (family_id, type, description, amount, date, account_id, created_by_member_id, paid_by_member_id, is_paid, paid_date)
  VALUES (fa, 'receita', 'Salário A', 5000.00, hoje, ca, ma, ma, true, hoje),
         (fb, 'receita', 'Salário B', 1000.00, hoje, cb, mb, mb, true, hoje);
  -- Fatura EM ABERTO no cartão: sem ela pay_invoice recusaria antes da trava
  -- ('Esta fatura não tem valor em aberto') e C15 passaria pelo motivo errado.
  INSERT INTO public.transactions (family_id, type, description, amount, date, account_id, created_by_member_id, paid_by_member_id, is_paid, invoice_year, invoice_month)
  VALUES (fa, 'despesa', 'Compra no cartão', 100.00, '2029-12-15', cart, ma, ma, false, 2030, 1);

  -- ------------------------------------------------------------ como A
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  -- C01/C02/C03: controles positivos (sem eles, todo "0 linhas" passaria à toa).
  v_estado := 'ok';
  BEGIN
    box_a := public.carteira_criar_caixinha('Reserva A', 'liquidez_diaria', 100, true, NULL);
  EXCEPTION WHEN OTHERS THEN v_estado := SQLSTATE || ' ' || SQLERRM;
  END;
  v_total := v_total + 1;
  IF v_estado = 'ok' AND box_a IS NOT NULL THEN v_linhas := v_linhas || E'\n  PASS  C01 A cria a própria caixinha';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA C01 A cria caixinha — ' || v_estado; END IF;

  v_estado := 'ok';
  BEGIN
    SELECT r.lancamento_id, r.movimento_id INTO tx_aplic, mov FROM public.carteira_aplicar(ca, 50000, box_a) r;
  EXCEPTION WHEN OTHERS THEN v_estado := SQLSTATE || ' ' || SQLERRM;
  END;
  v_total := v_total + 1;
  IF v_estado = 'ok' AND tx_aplic IS NOT NULL AND mov IS NOT NULL THEN v_linhas := v_linhas || E'\n  PASS  C02 A aplica R$500 da corrente direto na caixinha';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA C02 A aplica na caixinha — ' || v_estado; END IF;

  v_estado := 'ok';
  BEGIN
    SELECT r.lancamento_id, r.movimento_id INTO tx, mov FROM public.carteira_aplicar(ca, 10000, NULL) r;
  EXCEPTION WHEN OTHERS THEN v_estado := SQLSTATE || ' ' || SQLERRM;
  END;
  v_total := v_total + 1;
  IF v_estado = 'ok' AND tx IS NOT NULL AND mov IS NULL THEN v_linhas := v_linhas || E'\n  PASS  C03 A aplica R$100 no não alocado (sem movimento de caixinha)';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA C03 A aplica no não alocado — ' || v_estado; END IF;

  SELECT count(*) INTO n FROM public.investment_boxes WHERE id = box_a;
  v_total := v_total + 1;
  IF n = 1 THEN v_linhas := v_linhas || E'\n  PASS  C04 A lê a própria caixinha';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA C04 A lê a própria caixinha — ' || n; END IF;

  SELECT r.account_id INTO wa FROM public.v_carteira_resumo r WHERE r.family_id = fa;
  SELECT r.total_cents::text || '/' || r.alocado_cents || '/' || r.nao_alocado_cents INTO v_texto
    FROM public.v_carteira_resumo r WHERE r.family_id = fa;
  v_total := v_total + 1;
  IF v_texto = '60000/50000/10000' THEN v_linhas := v_linhas || E'\n  PASS  C05 resumo de A: total/alocado/não alocado = 60000/50000/10000';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA C05 resumo de A — ' || coalesce(v_texto, '<nulo>'); END IF;

  v_estado := 'ok';
  BEGIN
    UPDATE public.investment_boxes SET balance_cents = 99999999 WHERE id = box_a;
  EXCEPTION WHEN OTHERS THEN v_estado := SQLSTATE;
  END;
  v_total := v_total + 1;
  IF v_estado = '42501' THEN v_linhas := v_linhas || E'\n  PASS  C06 A não altera o saldo da PRÓPRIA caixinha direto (42501)';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA C06 UPDATE direto do próprio saldo — ' || v_estado; END IF;

  v_estado := 'ok';
  BEGIN
    INSERT INTO public.investment_box_movements (family_id, box_id, kind, counterpart, amount_cents, occurred_on, created_by_member_id)
    VALUES (fa, box_a, 'entrada', 'nao_alocado', 1, hoje, ma);
  EXCEPTION WHEN OTHERS THEN v_estado := SQLSTATE;
  END;
  v_total := v_total + 1;
  IF v_estado = '42501' THEN v_linhas := v_linhas || E'\n  PASS  C07 A não insere movimento direto (42501)';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA C07 INSERT direto de movimento — ' || v_estado; END IF;

  v_texto := 'ok';
  BEGIN
    PERFORM public.carteira_resgatar(box_a, 50001, NULL);
  EXCEPTION WHEN OTHERS THEN v_texto := SQLERRM;
  END;
  SELECT count(*) INTO n FROM public.investment_box_movements WHERE box_id = box_a;
  SELECT balance_cents INTO nb FROM public.investment_boxes WHERE id = box_a;
  v_total := v_total + 1;
  IF v_texto = 'Saldo insuficiente na caixinha' AND n = 1 AND nb = 50000 THEN v_linhas := v_linhas || E'\n  PASS  C08 resgatar acima do saldo: recusado, saldo e movimentos iguais';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA C08 resgate acima do saldo — ' || v_texto || ', mov=' || n || ', saldo=' || nb; END IF;

  v_texto := 'ok';
  BEGIN
    PERFORM public.carteira_alocar(box_a, 10001);
  EXCEPTION WHEN OTHERS THEN v_texto := SQLERRM;
  END;
  v_total := v_total + 1;
  IF v_texto = 'Saldo não alocado insuficiente' THEN v_linhas := v_linhas || E'\n  PASS  C09 alocar acima do não alocado: recusado';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA C09 alocar acima do não alocado — ' || v_texto; END IF;

  -- Corrente A: 5000,00 - 500,00 - 100,00 = 4400,00 = 440000 centavos.
  v_texto := 'ok';
  BEGIN
    PERFORM public.carteira_aplicar(ca, 440001, NULL);
  EXCEPTION WHEN OTHERS THEN v_texto := SQLERRM;
  END;
  v_total := v_total + 1;
  IF v_texto = 'Saldo insuficiente na conta de origem' THEN v_linhas := v_linhas || E'\n  PASS  C10 aplicar 1 centavo acima do saldo da origem: recusado';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA C10 aplicar acima do saldo — ' || v_texto; END IF;

  v_texto := 'ok';
  BEGIN
    PERFORM public.carteira_aplicar(cart, 100, NULL);
  EXCEPTION WHEN OTHERS THEN v_texto := SQLERRM;
  END;
  v_estado := 'ok';
  BEGIN
    PERFORM public.carteira_aplicar(wa, 100, NULL);
  EXCEPTION WHEN OTHERS THEN v_estado := SQLERRM;
  END;
  v_total := v_total + 1;
  IF v_texto = 'Conta de origem inválida' AND v_estado = 'Conta de origem inválida' THEN v_linhas := v_linhas || E'\n  PASS  C11 cartão e a própria carteira não servem de origem';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA C11 origem inválida — cartão: ' || v_texto || ' / carteira: ' || v_estado; END IF;

  -- Trava da conta-carteira (Q1 = A): todo caminho fora das RPCs da carteira.
  v_estado := 'ok';
  BEGIN
    INSERT INTO public.transactions (family_id, type, description, amount, date, account_id, to_account_id, created_by_member_id, paid_by_member_id, is_paid, paid_date)
    VALUES (fa, 'transferencia', 'Por fora', 1.00, hoje, ca, wa, ma, ma, true, hoje);
  EXCEPTION WHEN OTHERS THEN v_estado := SQLSTATE;
  END;
  v_total := v_total + 1;
  IF v_estado = '42501' THEN v_linhas := v_linhas || E'\n  PASS  C12 INSERT direto de transferência para a carteira recusado (42501)';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA C12 INSERT direto na carteira — ' || v_estado; END IF;

  v_estado := 'ok';
  BEGIN
    PERFORM public.save_transactions(json_build_array(json_build_object(
      'type', 'despesa', 'description', 'Despesa da carteira', 'amount', 10, 'date', hoje,
      'account_id', wa, 'is_paid', true))::jsonb);
  EXCEPTION WHEN OTHERS THEN v_estado := SQLSTATE;
  END;
  v_total := v_total + 1;
  IF v_estado = '42501' THEN v_linhas := v_linhas || E'\n  PASS  C13 save_transactions (/lancar) com a carteira recusado (42501)';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA C13 save_transactions na carteira — ' || v_estado; END IF;

  v_estado := 'ok';
  BEGIN
    PERFORM public.delete_transactions(tx_aplic, 'single');
  EXCEPTION WHEN OTHERS THEN v_estado := SQLSTATE;
  END;
  v_total := v_total + 1;
  IF v_estado = '42501' THEN v_linhas := v_linhas || E'\n  PASS  C14 excluir a transferência da aplicação recusado (42501)';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA C14 delete_transactions na carteira — ' || v_estado; END IF;

  v_estado := 'ok';
  BEGIN
    PERFORM public.pay_invoice(cart, wa, 2030, 1, hoje);
  EXCEPTION WHEN OTHERS THEN v_estado := SQLSTATE;
  END;
  v_total := v_total + 1;
  IF v_estado = '42501' THEN v_linhas := v_linhas || E'\n  PASS  C15 pagar fatura com a carteira como origem recusado (42501, fatura em aberto)';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA C15 pay_invoice pela carteira — ' || v_estado; END IF;

  UPDATE public.transactions SET description = 'Aplicação (renomeada)' WHERE id = tx_aplic;
  GET DIAGNOSTICS n = ROW_COUNT;
  v_total := v_total + 1;
  IF n = 1 THEN v_linhas := v_linhas || E'\n  PASS  C16 editar só a descrição da transferência da carteira continua livre';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA C16 editar descrição — ' || n || ' linha(s)'; END IF;

  v_estado := 'ok';
  BEGIN
    UPDATE public.transactions SET amount = 1.00 WHERE id = tx_aplic;
  EXCEPTION WHEN OTHERS THEN v_estado := SQLSTATE;
  END;
  v_total := v_total + 1;
  IF v_estado = '42501' THEN v_linhas := v_linhas || E'\n  PASS  C17 mudar o valor da transferência da carteira recusado (42501)';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA C17 mudar valor — ' || v_estado; END IF;

  v_estado := 'ok';
  BEGIN
    UPDATE public.accounts SET initial_balance = 999 WHERE id = wa;
  EXCEPTION WHEN OTHERS THEN v_estado := SQLSTATE;
  END;
  UPDATE public.accounts SET name = 'Investimentos da casa' WHERE id = wa;
  GET DIAGNOSTICS n = ROW_COUNT;
  v_total := v_total + 1;
  IF v_estado = '42501' AND n = 1 THEN v_linhas := v_linhas || E'\n  PASS  C18 saldo inicial da conta-carteira congelado (42501); renomear continua livre';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA C18 conta-carteira — saldo inicial: ' || v_estado || ', renomear: ' || n; END IF;

  -- ------------------------------------------------------------ como B (intruso)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  SELECT (SELECT count(*) FROM public.investment_boxes WHERE id = box_a)
       + (SELECT count(*) FROM public.investment_wallets WHERE family_id = fa)
       + (SELECT count(*) FROM public.investment_box_movements WHERE box_id = box_a)
       + (SELECT count(*) FROM public.v_carteira_resumo WHERE family_id = fa)
    INTO n;
  IF to_regclass('public.investment_box_rates') IS NOT NULL THEN
    EXECUTE 'SELECT $1 + (SELECT count(*) FROM public.investment_box_rates WHERE family_id = $2)' INTO n USING n, fa;
  END IF;
  v_total := v_total + 1;
  IF n = 0 THEN v_linhas := v_linhas || E'\n  PASS  I01 B não lê carteira, caixinha, movimentos, histórico de taxa nem resumo de A';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA I01 B leu ' || n || ' linha(s) de A'; END IF;

  -- I02 muda o NOME (não o saldo): no mutante, um saldo alterado aqui faria
  -- I05/I06 baterem no CHECK em vez de gravar, e o vermelho viria do motivo
  -- errado.
  v_estado := 'ok';
  BEGIN
    UPDATE public.investment_boxes SET name = 'Invadida por B' WHERE id = box_a;
  EXCEPTION WHEN OTHERS THEN v_estado := SQLSTATE;
  END;
  v_total := v_total + 1;
  IF v_estado = '42501' THEN v_linhas := v_linhas || E'\n  PASS  I02 B não altera caixinha de A (42501)';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA I02 B UPDATE na caixinha de A — ' || v_estado; END IF;

  v_estado := 'ok';
  BEGIN
    INSERT INTO public.investment_boxes (family_id, account_id, name, rate_type, rate_bps, rate_defined_at, resgate_imediato, balance_cents)
    VALUES (fa, wa, 'Plantada por B', 'pre_fixado', 100, hoje, true, 999);
  EXCEPTION WHEN OTHERS THEN v_estado := SQLSTATE;
  END;
  v_total := v_total + 1;
  IF v_estado = '42501' THEN v_linhas := v_linhas || E'\n  PASS  I04 B não cria caixinha na carteira de A (42501)';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA I04 B INSERT na carteira de A — ' || v_estado; END IF;

  v_texto := 'ok';
  BEGIN
    PERFORM public.carteira_resgatar(box_a, 100, ca);
  EXCEPTION WHEN OTHERS THEN v_texto := SQLERRM;
  END;
  v_total := v_total + 1;
  IF v_texto = 'Caixinha não encontrada' THEN v_linhas := v_linhas || E'\n  PASS  I05 B resgata caixinha de A para a corrente de A: recusado';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA I05 B resgatar para conta de A — ' || v_texto; END IF;

  v_texto := 'ok';
  BEGIN
    PERFORM public.carteira_resgatar(box_a, 100, NULL);
  EXCEPTION WHEN OTHERS THEN v_texto := SQLERRM;
  END;
  v_total := v_total + 1;
  IF v_texto = 'Caixinha não encontrada' THEN v_linhas := v_linhas || E'\n  PASS  I06 B resgata caixinha de A para o não alocado: recusado';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA I06 B resgatar para não alocado — ' || v_texto; END IF;

  v_texto := 'ok';
  BEGIN
    PERFORM public.carteira_aplicar(ca, 100, box_a);
  EXCEPTION WHEN OTHERS THEN v_texto := SQLERRM;
  END;
  v_total := v_total + 1;
  IF v_texto = 'Conta de origem inválida' THEN v_linhas := v_linhas || E'\n  PASS  I07 B aplica da corrente de A: recusado';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA I07 B aplicar da corrente de A — ' || v_texto; END IF;

  v_texto := 'ok';
  BEGIN
    PERFORM public.carteira_aplicar(cb, 100, box_a);
  EXCEPTION WHEN OTHERS THEN v_texto := SQLERRM;
  END;
  v_total := v_total + 1;
  IF v_texto = 'Caixinha não encontrada' THEN v_linhas := v_linhas || E'\n  PASS  I08 B aplica da própria corrente na caixinha de A: recusado';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA I08 B aplicar na caixinha de A — ' || v_texto; END IF;

  v_texto := 'ok';
  BEGIN
    PERFORM public.carteira_alocar(box_a, 1);
  EXCEPTION WHEN OTHERS THEN v_texto := SQLERRM;
  END;
  v_total := v_total + 1;
  IF v_texto = 'Caixinha não encontrada' THEN v_linhas := v_linhas || E'\n  PASS  I09 B aloca na caixinha de A: recusado';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA I09 B alocar na caixinha de A — ' || v_texto; END IF;

  v_texto := 'ok';
  BEGIN
    PERFORM public.carteira_atualizar_taxa(box_a, 9999);
  EXCEPTION WHEN OTHERS THEN v_texto := SQLERRM;
  END;
  v_total := v_total + 1;
  IF v_texto = 'Caixinha não encontrada' THEN v_linhas := v_linhas || E'\n  PASS  I10 B muda a taxa da caixinha de A: recusado';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA I10 B atualizar taxa de A — ' || v_texto; END IF;

  -- Por último entre os ataques de B: no mutante, apagar antes impediria os
  -- resgates de gravar.
  v_estado := 'ok';
  BEGIN
    DELETE FROM public.investment_boxes WHERE id = box_a;
  EXCEPTION WHEN OTHERS THEN v_estado := SQLSTATE;
  END;
  v_total := v_total + 1;
  IF v_estado = '42501' THEN v_linhas := v_linhas || E'\n  PASS  I03 B não apaga caixinha de A (42501)';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA I03 B DELETE na caixinha de A — ' || v_estado; END IF;

  -- ------------------------------------------------------------ como anon
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  SET LOCAL ROLE anon;
  v_estado := 'ok';
  BEGIN
    SELECT count(*) INTO n FROM public.investment_boxes;
  EXCEPTION WHEN OTHERS THEN v_estado := SQLSTATE;
  END;
  v_texto := 'ok';
  BEGIN
    SELECT count(*) INTO n FROM public.v_carteira_resumo;
  EXCEPTION WHEN OTHERS THEN v_texto := SQLSTATE;
  END;
  v_total := v_total + 1;
  IF v_estado = '42501' AND v_texto = '42501' THEN v_linhas := v_linhas || E'\n  PASS  N01 anon sem acesso a caixinhas nem ao resumo (42501)';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA N01 anon — caixinhas: ' || v_estado || ', resumo: ' || v_texto; END IF;

  v_estado := 'ok';
  BEGIN
    PERFORM public.carteira_aplicar(ca, 100, NULL);
  EXCEPTION WHEN OTHERS THEN v_estado := SQLSTATE;
  END;
  v_total := v_total + 1;
  IF v_estado = '42501' THEN v_linhas := v_linhas || E'\n  PASS  N02 anon não executa carteira_aplicar (42501)';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA N02 anon executou carteira_aplicar — ' || v_estado; END IF;

  -- ------------------------------------------------------------ rendimento (fixture retroativa, postgres)
  -- Caixinha criada há 3 meses, com R$1.000 entrando no mês m0. O dinheiro
  -- entra na conta-carteira pela mesma chave que as RPCs usam.
  RESET ROLE;
  INSERT INTO public.investment_boxes (family_id, account_id, name, rate_type, rate_bps, rate_defined_at, resgate_imediato, balance_cents, created_at)
  VALUES (fa, wa, 'Retroativa', 'pre_fixado', 100, hoje, true, 100000, (hoje - interval '3 months')::timestamp AT TIME ZONE 'America/Sao_Paulo')
  RETURNING id INTO box_r;
  PERFORM set_config('app.carteira_rpc', 'on', true);
  INSERT INTO public.transactions (family_id, type, description, amount, date, account_id, to_account_id, created_by_member_id, paid_by_member_id, is_paid, paid_date)
  VALUES (fa, 'transferencia', 'Aplicação antiga', 1000.00, hoje, ca, wa, ma, ma, true, hoje) RETURNING id INTO tx;
  PERFORM set_config('app.carteira_rpc', 'off', true);
  INSERT INTO public.investment_box_movements (family_id, box_id, kind, counterpart, amount_cents, transaction_id, occurred_on, created_by_member_id)
  VALUES (fa, box_r, 'entrada', 'conta', 100000, tx, (hoje - interval '3 months')::date, ma);
  -- Histórico de taxa (00017): 1% desde a criação. Condicional para o teste
  -- rodar também contra um schema sem a tabela e falhar pelas REGRAS, não por
  -- "relation does not exist".
  IF to_regclass('public.investment_box_rates') IS NOT NULL THEN
    EXECUTE 'INSERT INTO public.investment_box_rates (family_id, box_id, rate_bps, valid_from) VALUES ($1, $2, 100, $3)'
      USING fa, box_r, (hoje - interval '3 months')::date;
  END IF;

  -- como B: nem a lista de pendentes nem o cálculo revelam a caixinha de A.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.carteira_rendimentos_pendentes();
  v := public.carteira_rendimento_calculado(box_r, m1);
  v_texto := 'ok';
  BEGIN
    PERFORM public.carteira_confirmar_rendimento(box_r, m1);
  EXCEPTION WHEN OTHERS THEN v_texto := SQLERRM;
  END;
  v_total := v_total + 1;
  IF n = 0 AND v = 0 AND v_texto = 'Caixinha não encontrada' THEN v_linhas := v_linhas || E'\n  PASS  I11 B: 0 pendentes, cálculo 0 e confirmação recusada na caixinha de A';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA I11 B rendimento de A — pendentes=' || n || ', calc=' || v || ', confirmar=' || v_texto; END IF;

  -- como A
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  SELECT string_agg(to_char(p.competencia, 'YYYY-MM') || '=' || p.rendimento_cents, ',' ORDER BY p.competencia) INTO v_texto
    FROM public.carteira_rendimentos_pendentes() p WHERE p.caixinha_id = box_r;
  v_total := v_total + 1;
  -- m3 é o mês CORRENTE: ainda não rendeu, não aparece e não confirma
  -- (code-review high, achado 1 — 00017).
  IF v_texto = to_char(m1, 'YYYY-MM') || '=1000,' || to_char(m2, 'YYYY-MM') || '=1000'
  THEN v_linhas := v_linhas || E'\n  PASS  R01 pendentes de A: só os 2 meses ENCERRADOS, 1000 cada; mês da entrada e mês corrente de fora';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA R01 pendentes — ' || coalesce(v_texto, '<nenhum>'); END IF;

  v_texto := 'ok';
  BEGIN
    PERFORM public.carteira_confirmar_rendimento(box_r, m0);
  EXCEPTION WHEN OTHERS THEN v_texto := SQLERRM;
  END;
  v_total := v_total + 1;
  IF v_texto = 'Não há rendimento a confirmar neste mês' THEN v_linhas := v_linhas || E'\n  PASS  R07 mês da entrada (base zero): nada a confirmar';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA R07 mês da entrada — ' || v_texto; END IF;

  v_texto := 'ok';
  BEGIN
    PERFORM public.carteira_confirmar_rendimento(box_r, m2);
  EXCEPTION WHEN OTHERS THEN v_texto := SQLERRM;
  END;
  v_total := v_total + 1;
  IF v_texto = 'Confirme antes o rendimento de ' || to_char(m1, 'MM/YYYY') THEN v_linhas := v_linhas || E'\n  PASS  R02 confirmar fora de ordem: recusado, aponta o mês mais antigo';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA R02 fora de ordem — ' || v_texto; END IF;

  v_texto := 'ok'; v := NULL;
  BEGIN
    SELECT r.valor_cents, r.lancamento_id INTO v, tx FROM public.carteira_confirmar_rendimento(box_r, m1) r;
  EXCEPTION WHEN OTHERS THEN v_texto := SQLERRM;
  END;
  SELECT balance_cents INTO nb FROM public.investment_boxes WHERE id = box_r;
  v_total := v_total + 1;
  IF v_texto = 'ok' AND v = 1000 AND nb = 101000 THEN v_linhas := v_linhas || E'\n  PASS  R03 confirmar m1: 1000 vira saldo (101000)';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA R03 confirmar m1 — ' || v_texto || ', valor=' || coalesce(v, -1) || ', saldo=' || nb; END IF;

  -- A receita do rendimento E o movimento são datados no ÚLTIMO dia do mês de
  -- competência, não no dia da confirmação: patrimônio, resumo mensal e
  -- histórico da caixinha mostram o rendimento no mês em que ele aconteceu
  -- (code-review high, achados 3 e 5 — 00017).
  SELECT t.date::text || '/' || t.paid_date::text || '/' || t.type || '/' || m.occurred_on::text INTO v_texto
    FROM public.transactions t
    JOIN public.investment_box_movements m ON m.transaction_id = t.id
   WHERE t.id = tx;
  v_total := v_total + 1;
  IF v_texto = ((m1 + interval '1 month')::date - 1)::text || '/' || ((m1 + interval '1 month')::date - 1)::text
              || '/receita/' || ((m1 + interval '1 month')::date - 1)::text
  THEN v_linhas := v_linhas || E'\n  PASS  R09 receita e movimento do rendimento datados no último dia da competência';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA R09 datas do rendimento — ' || coalesce(v_texto, '<nenhuma>'); END IF;

  -- Taxa mudada DEPOIS que m2 fechou não muda o valor de m2: vale a taxa que
  -- estava definida no fim do mês (code-review high, achado 2 — 00017). Sem o
  -- histórico, m2 sairia a 2% sobre 101000 = 2020.
  PERFORM public.carteira_atualizar_taxa(box_r, 200);

  v_texto := 'ok';
  BEGIN
    PERFORM public.carteira_confirmar_rendimento(box_r, m1);
  EXCEPTION WHEN OTHERS THEN v_texto := SQLERRM;
  END;
  SELECT balance_cents INTO nb FROM public.investment_boxes WHERE id = box_r;
  v_total := v_total + 1;
  IF v_texto = 'O rendimento deste mês já foi confirmado' AND nb = 101000 THEN v_linhas := v_linhas || E'\n  PASS  R04 confirmar m1 de novo: recusado, saldo não duplica';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA R04 confirmação repetida — ' || v_texto || ', saldo=' || nb; END IF;

  v := NULL;
  SELECT r.valor_cents INTO v FROM public.carteira_confirmar_rendimento(box_r, m2) r;
  v_total := v_total + 1;
  IF v = 1010 THEN v_linhas := v_linhas || E'\n  PASS  R05 m2 = 1010 (1% sobre 101000, mesmo com a taxa mudada para 2% depois): juro composto só do confirmado, taxa do fim do mês';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA R05 m2=' || coalesce(v, -1); END IF;

  -- Mês corrente e mês futuro: recusados com a mesma frase. Data fora do dia 1: inválida.
  v_texto := 'ok';
  BEGIN
    PERFORM public.carteira_confirmar_rendimento(box_r, m3);
  EXCEPTION WHEN OTHERS THEN v_texto := SQLERRM;
  END;
  v_estado := 'ok';
  BEGIN
    PERFORM public.carteira_confirmar_rendimento(box_r, (m3 + interval '1 month')::date);
  EXCEPTION WHEN OTHERS THEN v_estado := SQLERRM;
  END;
  v_total := v_total + 1;
  IF v_texto = 'Ainda não é possível confirmar o rendimento deste mês' AND v_estado = v_texto
  THEN v_linhas := v_linhas || E'\n  PASS  R06 mês corrente e mês futuro: recusados (o mês ainda não rendeu)';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA R06 corrente: ' || v_texto || ' / futuro: ' || v_estado; END IF;

  v_texto := 'ok';
  BEGIN
    PERFORM public.carteira_confirmar_rendimento(box_r, m1 + 14);
  EXCEPTION WHEN OTHERS THEN v_texto := SQLERRM;
  END;
  v_total := v_total + 1;
  IF v_texto = 'Mês de competência inválido' THEN v_linhas := v_linhas || E'\n  PASS  R10 data fora do dia 1: recusada';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA R10 dia 15 — ' || v_texto; END IF;

  -- Mês anterior ao último confirmado nunca mais confirma, mesmo que a taxa
  -- mude e ele passe a render (code-review high, achado 4 — 00017). m0 tem
  -- rendimento zero: sem a regra nova, a frase seria a de "nada a confirmar".
  v_texto := 'ok';
  BEGIN
    PERFORM public.carteira_confirmar_rendimento(box_r, m0);
  EXCEPTION WHEN OTHERS THEN v_texto := SQLERRM;
  END;
  v_total := v_total + 1;
  IF v_texto = 'Este mês já ficou para trás: há rendimento confirmado de um mês posterior'
  THEN v_linhas := v_linhas || E'\n  PASS  R11 mês anterior ao último confirmado: recusado';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA R11 mês anterior ao último confirmado — ' || v_texto; END IF;

  SELECT count(*) INTO n FROM public.carteira_rendimentos_pendentes() p WHERE p.caixinha_id = box_r;
  SELECT r.nao_alocado_cents INTO nb FROM public.v_carteira_resumo r WHERE r.family_id = fa;
  v_total := v_total + 1;
  IF n = 0 AND nb = 10000 THEN v_linhas := v_linhas || E'\n  PASS  R08 sem pendentes depois de confirmar; não alocado continua 10000';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA R08 pendentes=' || n || ', não alocado=' || coalesce(nb, -1); END IF;

  -- ------------------------------------------------------------ conferência (postgres)
  RESET ROLE;
  SELECT name || '/' || balance_cents || '/' || rate_bps INTO v_texto FROM public.investment_boxes WHERE id = box_a;
  v_total := v_total + 1;
  IF v_texto = 'Reserva A/50000/100' THEN v_linhas := v_linhas || E'\n  PASS  F01 caixinha de A intacta depois dos ataques de B (nome, saldo 50000, taxa 100)';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA F01 caixinha de A agora: ' || coalesce(v_texto, '<apagada>'); END IF;

  v_estado := 'ok';
  BEGIN
    UPDATE public.investment_boxes SET balance_cents = -1 WHERE id = box_a;
  EXCEPTION WHEN OTHERS THEN v_estado := SQLSTATE;
  END;
  v_total := v_total + 1;
  IF v_estado = '23514' THEN v_linhas := v_linhas || E'\n  PASS  F02 CHECK balance_cents >= 0 morde até para o dono da tabela (23514)';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA F02 saldo negativo — ' || v_estado; END IF;

  -- F04: postgres (dono das RPCs DEFINER) também não muda o saldo inicial da
  -- conta-carteira sem a chave da carteira (code-review high, achado 6 — 00017).
  v_estado := 'ok';
  BEGIN
    UPDATE public.accounts SET initial_balance = 1 WHERE id = wa;
  EXCEPTION WHEN OTHERS THEN v_estado := SQLSTATE;
  END;
  v_total := v_total + 1;
  IF v_estado = '42501' THEN v_linhas := v_linhas || E'\n  PASS  F04 nem postgres muda o saldo inicial da conta-carteira sem a chave (42501)';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA F04 postgres mudou a conta-carteira — ' || v_estado; END IF;

  -- F05: escrita ANINHADA (disparada por outro gatilho) que muda dinheiro de
  -- lançamento da carteira é recusada; só DELETE aninhado (cascata) passa
  -- (code-review high, 1ª rodada achado 6 e 2ª rodada achado 4 — 00017).
  -- Gatilho temporário, desfeito com o resto do teste.
  PERFORM set_config('teste.tx_aplic', tx_aplic::text, true);
  CREATE TEMP TABLE gatilho_aninhado (x int);
  EXECUTE $q$
    CREATE FUNCTION pg_temp.f_aninhado() RETURNS trigger LANGUAGE plpgsql AS $f$
    BEGIN
      UPDATE public.transactions SET amount = amount + 1
       WHERE id = current_setting('teste.tx_aplic')::uuid;
      RETURN NEW;
    END $f$
  $q$;
  EXECUTE 'CREATE TRIGGER trg_aninhado AFTER INSERT ON pg_temp.gatilho_aninhado FOR EACH ROW EXECUTE FUNCTION pg_temp.f_aninhado()';
  v_estado := 'ok';
  BEGIN
    INSERT INTO pg_temp.gatilho_aninhado VALUES (1);
  EXCEPTION WHEN OTHERS THEN v_estado := SQLSTATE;
  END;
  SELECT amount::text INTO v_texto FROM public.transactions WHERE id = tx_aplic;
  v_total := v_total + 1;
  IF v_estado = '42501' AND v_texto = '500.00' THEN v_linhas := v_linhas || E'\n  PASS  F05 UPDATE aninhado no valor de lançamento da carteira recusado (42501), valor intacto';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA F05 UPDATE aninhado — ' || v_estado || ', valor=' || coalesce(v_texto, '<nulo>'); END IF;

  -- F03: a limpeza dos testes (service_role: lançamentos -> família) continua
  -- funcionando com as tabelas novas e a trava.
  v_estado := 'ok';
  BEGIN
    SET LOCAL ROLE service_role;
    DELETE FROM public.transactions WHERE family_id = fa;
    DELETE FROM public.families WHERE id = fa;
    RESET ROLE;
  EXCEPTION WHEN OTHERS THEN v_estado := SQLSTATE || ' ' || SQLERRM;
  END;
  RESET ROLE;
  SELECT (SELECT count(*) FROM public.investment_wallets WHERE family_id = fa)
       + (SELECT count(*) FROM public.investment_boxes WHERE family_id = fa)
       + (SELECT count(*) FROM public.investment_box_movements WHERE family_id = fa)
    INTO n;
  v_total := v_total + 1;
  IF v_estado = 'ok' AND n = 0 THEN v_linhas := v_linhas || E'\n  PASS  F03 limpeza como service_role apaga lançamentos e família, sem sobras';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA F03 limpeza — ' || v_estado || ', sobras=' || n; END IF;

  RAISE EXCEPTION 'PLACAR carteira-rls: % de % passaram, % falha(s)%',
    v_total - v_falhas, v_total, v_falhas, v_linhas;
END $teste$;
