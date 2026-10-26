-- Sentinela — testes hostis da carteira que o carteira-rls.sql NÃO cobre.
-- Mesmo arranjo do teste do Estrutura: famílias sintéticas criadas aqui, papel
-- trocado com SET LOCAL ROLE + request.jwt.claims, e o bloco termina SEMPRE em
-- RAISE EXCEPTION com o placar, o que desfaz a transação inteira. Não toca a
-- família real. Nada é gravado.
--
-- Cada linha começa com OBS (observado) e diz o que aconteceu, para que o
-- placar sirva de evidência literal e não de PASS/FALHA pré-julgado.
DO $s$
DECLARE
  ua uuid := gen_random_uuid();
  ub uuid := gen_random_uuid();
  fa uuid; fb uuid; ma uuid; mb uuid;
  ca uuid; cb uuid; wa uuid; wb uuid;
  box_b uuid; box_v uuid; box_w uuid; box_n uuid;
  tx uuid; tx_t uuid;
  hoje date; m0 date; m1 date; m2 date;
  n int; nb bigint; v bigint;
  r text; s text; e text;
  saida text := '';
BEGIN
  hoje := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  m0 := date_trunc('month', hoje - interval '3 months')::date;
  m1 := (m0 + interval '1 month')::date;
  m2 := (m0 + interval '2 months')::date;

  -- fixtures (postgres)
  INSERT INTO auth.users (id, email, aud, role)
  VALUES (ua, 'sentinela-a-' || ua || '@example.com', 'authenticated', 'authenticated'),
         (ub, 'sentinela-b-' || ub || '@example.com', 'authenticated', 'authenticated');
  INSERT INTO public.families (name, join_code) VALUES ('Sentinela A', 'QK2347') RETURNING id INTO fa;
  INSERT INTO public.families (name, join_code) VALUES ('Sentinela B', 'QK2348') RETURNING id INTO fb;
  INSERT INTO public.family_members (family_id, user_id, display_name) VALUES (fa, ua, 'Sentinela A') RETURNING id INTO ma;
  INSERT INTO public.family_members (family_id, user_id, display_name) VALUES (fb, ub, 'Sentinela B') RETURNING id INTO mb;
  INSERT INTO public.accounts (family_id, owner_member_id, name, type) VALUES (fa, ma, 'Corrente A', 'corrente') RETURNING id INTO ca;
  INSERT INTO public.accounts (family_id, owner_member_id, name, type) VALUES (fb, mb, 'Corrente B', 'corrente') RETURNING id INTO cb;
  INSERT INTO public.transactions (family_id, type, description, amount, date, account_id, created_by_member_id, paid_by_member_id, is_paid, paid_date)
  VALUES (fa, 'receita', 'Salario A', 5000.00, hoje, ca, ma, ma, true, hoje),
         (fb, 'receita', 'Salario B', 1000.00, hoje, cb, mb, mb, true, hoje);

  -- ================================================================ como B
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  -- S01: B usa a PRÓPRIA caixinha, mas manda o resgate para a corrente de A.
  box_b := public.carteira_criar_caixinha('Caixinha B', 'liquidez_diaria', 100, true, NULL);
  PERFORM public.carteira_aplicar(cb, 10000, box_b);
  r := 'ok';
  BEGIN
    PERFORM public.carteira_resgatar(box_b, 100, ca);
  EXCEPTION WHEN OTHERS THEN r := SQLERRM;
  END;
  SELECT balance_cents INTO nb FROM public.investment_boxes WHERE id = box_b;
  saida := saida || E'\n  OBS S01 B resgata a propria caixinha para a corrente de A -> ' || r || ' | saldo caixinha B=' || nb;

  -- ================================================================ como A
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  PERFORM public.carteira_aplicar(ca, 100000, NULL);   -- R$1000 no não alocado de A
  SELECT account_id INTO wa FROM public.investment_wallets WHERE family_id = fa;

  -- S02: trava de vencimento (não coberta pelo carteira-rls.sql).
  box_v := public.carteira_criar_caixinha('CDB 30 dias', 'pre_fixado', 100, false, hoje + 30);
  PERFORM public.carteira_alocar(box_v, 5000);
  r := 'ok';
  BEGIN
    PERFORM public.carteira_resgatar(box_v, 100, NULL);
  EXCEPTION WHEN OTHERS THEN r := SQLERRM;
  END;
  SELECT balance_cents INTO nb FROM public.investment_boxes WHERE id = box_v;
  saida := saida || E'\n  OBS S02a resgatar caixinha com vencimento em hoje+30 -> ' || r || ' | saldo=' || nb;
  box_n := public.carteira_criar_caixinha('CDB vence hoje', 'pre_fixado', 100, false, hoje);
  PERFORM public.carteira_alocar(box_n, 5000);
  r := 'ok';
  BEGIN
    PERFORM public.carteira_resgatar(box_n, 100, NULL);
  EXCEPTION WHEN OTHERS THEN r := SQLERRM;
  END;
  saida := saida || E'\n  OBS S02b resgatar caixinha que vence HOJE -> ' || r;

  -- S03: nome pela RPC direta (fora do Zod): só caractere invisível, controle e RTL override.
  r := 'ok';
  BEGIN
    PERFORM public.carteira_criar_caixinha(E'​', 'liquidez_diaria', 0, true, NULL);
  EXCEPTION WHEN OTHERS THEN r := SQLERRM;
  END;
  s := 'ok';
  BEGIN
    PERFORM public.carteira_criar_caixinha(E'Reserva‮etouq\n\u0007', 'liquidez_diaria', 0, true, NULL);
  EXCEPTION WHEN OTHERS THEN s := SQLERRM;
  END;
  e := 'ok';
  BEGIN
    PERFORM public.carteira_criar_caixinha(repeat('a', 61), 'liquidez_diaria', 0, true, NULL);
  EXCEPTION WHEN OTHERS THEN e := SQLERRM;
  END;
  saida := saida || E'\n  OBS S03 RPC direta: nome so U+200B -> ' || r || ' | nome com U+202E, \n e U+0007 -> ' || s || ' | 61 chars -> ' || e;

  -- S04: limites de valor e taxa pela RPC direta.
  r := 'ok';
  BEGIN PERFORM public.carteira_aplicar(ca, 10000000000, NULL); EXCEPTION WHEN OTHERS THEN r := SQLERRM; END;
  s := 'ok';
  BEGIN PERFORM public.carteira_aplicar(ca, -1, NULL); EXCEPTION WHEN OTHERS THEN s := SQLERRM; END;
  e := 'ok';
  BEGIN PERFORM public.carteira_atualizar_taxa(box_v, 10001); EXCEPTION WHEN OTHERS THEN e := SQLERRM; END;
  saida := saida || E'\n  OBS S04 RPC direta: valor 10000000000 -> ' || r || ' | valor -1 -> ' || s || ' | taxa 10001 -> ' || e;

  -- S05: trava em UPDATE que APONTA um lançamento comum para a carteira.
  INSERT INTO public.accounts (family_id, owner_member_id, name, type) VALUES (fa, ma, 'Poupanca A', 'corrente') RETURNING id INTO tx_t;
  INSERT INTO public.transactions (family_id, type, description, amount, date, account_id, to_account_id, created_by_member_id, paid_by_member_id, is_paid, paid_date)
  VALUES (fa, 'transferencia', 'Transf comum', 10.00, hoje, ca, tx_t, ma, ma, true, hoje) RETURNING id INTO tx;
  r := 'ok';
  BEGIN
    UPDATE public.transactions SET to_account_id = wa WHERE id = tx;
  EXCEPTION WHEN OTHERS THEN r := SQLSTATE || ' ' || SQLERRM;
  END;
  saida := saida || E'\n  OBS S05 UPDATE de transferencia comum apontando to_account_id para a conta-carteira -> ' || r;

  -- S06: conta-carteira: arquivar e excluir pelo cliente.
  r := 'ok';
  BEGIN
    UPDATE public.accounts SET archived_at = now() WHERE id = wa;
    GET DIAGNOSTICS n = ROW_COUNT;
    r := 'ok, ' || n || ' linha(s) arquivada(s)';
  EXCEPTION WHEN OTHERS THEN r := SQLSTATE || ' ' || SQLERRM;
  END;
  s := 'ok';
  BEGIN
    PERFORM public.carteira_aplicar(ca, 100, NULL);
  EXCEPTION WHEN OTHERS THEN s := SQLERRM;
  END;
  e := 'ok';
  BEGIN
    DELETE FROM public.accounts WHERE id = wa;
  EXCEPTION WHEN OTHERS THEN e := SQLSTATE || ' ' || SQLERRM;
  END;
  UPDATE public.accounts SET archived_at = NULL WHERE id = wa;
  saida := saida || E'\n  OBS S06 arquivar conta-carteira -> ' || r || ' | aplicar com carteira arquivada -> ' || s || ' | excluir conta-carteira -> ' || e;

  -- S07: no nível SQL, QUALQUER papel liga a chave app.carteira_rpc. A trava
  -- depende só de o cliente não ter caminho para SQL arbitrário (PostgREST não
  -- expõe set_config: ver tguc-postgrest-anon.txt).
  PERFORM set_config('app.carteira_rpc', 'on', true);
  r := 'ok';
  BEGIN
    INSERT INTO public.transactions (family_id, type, description, amount, date, account_id, created_by_member_id, paid_by_member_id, is_paid, paid_date)
    VALUES (fa, 'receita', 'Receita forjada na carteira', 1.00, hoje, wa, ma, ma, true, hoje);
    r := 'INSERT aceito';
  EXCEPTION WHEN OTHERS THEN r := SQLSTATE || ' ' || SQLERRM;
  END;
  PERFORM set_config('app.carteira_rpc', 'off', true);
  saida := saida || E'\n  OBS S07 authenticated em SQL liga app.carteira_rpc e insere receita na carteira -> ' || r || ' (current_user=' || current_user || ')';

  -- ================================================================ S08: rendimento sobre dinheiro já resgatado
  -- Fixture retroativa (postgres), igual à do carteira-rls.sql: caixinha criada
  -- no mês m0, R$1.000 entram em m0 e SAEM inteiros no dia 1 de m1.
  RESET ROLE;
  INSERT INTO public.investment_boxes (family_id, account_id, name, rate_type, rate_bps, rate_defined_at, resgate_imediato, balance_cents, created_at)
  VALUES (fa, wa, 'Esvaziada', 'liquidez_diaria', 100, m0, true, 0, m0::timestamp AT TIME ZONE 'America/Sao_Paulo')
  RETURNING id INTO box_w;
  INSERT INTO public.investment_box_rates (family_id, box_id, rate_bps, valid_from) VALUES (fa, box_w, 100, m0);
  INSERT INTO public.investment_box_movements (family_id, box_id, kind, counterpart, amount_cents, occurred_on, created_by_member_id)
  VALUES (fa, box_w, 'entrada', 'nao_alocado', 100000, m0 + 4, ma),
         (fa, box_w, 'saida',   'nao_alocado', 100000, m1,     ma);

  PERFORM set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT balance_cents INTO nb FROM public.investment_boxes WHERE id = box_w;
  SELECT string_agg(to_char(p.competencia, 'YYYY-MM') || '=' || p.rendimento_cents, ',' ORDER BY p.competencia) INTO r
    FROM public.carteira_rendimentos_pendentes() p WHERE p.caixinha_id = box_w;
  saida := saida || E'\n  OBS S08a caixinha zerada no dia 1 de ' || to_char(m1, 'YYYY-MM') || ' (saldo=' || nb || '): pendentes = ' || coalesce(r, '<nenhum>');
  v := NULL;
  r := 'ok';
  BEGIN
    SELECT x.valor_cents INTO v FROM public.carteira_confirmar_rendimento(box_w, m1) x;
  EXCEPTION WHEN OTHERS THEN r := SQLERRM;
  END;
  SELECT balance_cents INTO nb FROM public.investment_boxes WHERE id = box_w;
  saida := saida || E'\n  OBS S08b confirmar ' || to_char(m1, 'YYYY-MM') || ' -> ' || r || ' valor=' || coalesce(v, -1) || ' | saldo da caixinha agora=' || nb;
  r := 'ok';
  BEGIN
    PERFORM public.carteira_resgatar(box_w, nb, ca);
  EXCEPTION WHEN OTHERS THEN r := SQLERRM;
  END;
  SELECT balance_cents INTO nb FROM public.investment_boxes WHERE id = box_w;
  saida := saida || E'\n  OBS S08c resgatar esse saldo para a corrente de A -> ' || r || ' | saldo da caixinha depois=' || nb;

  -- S09: B chama a função de meses pendentes com a caixinha de A (não coberta).
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.carteira_meses_pendentes_da_caixinha(box_w);
  SELECT count(*) INTO nb FROM public.v_account_balances WHERE account_id = wa;
  saida := saida || E'\n  OBS S09 B: carteira_meses_pendentes_da_caixinha(caixinha de A) -> ' || n || ' linha(s) | v_account_balances da conta-carteira de A -> ' || nb || ' linha(s)';

  RESET ROLE;
  RAISE EXCEPTION 'PLACAR sentinela-hostil:%', saida;
END $s$;
