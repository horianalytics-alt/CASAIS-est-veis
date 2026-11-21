-- Sentinela r2 — re-auditoria da 00018 (aplicada). Mesmo arranjo do r1:
-- famílias sintéticas criadas aqui, papel trocado com SET LOCAL ROLE +
-- request.jwt.claims, e o bloco termina SEMPRE em RAISE EXCEPTION com o
-- placar, o que desfaz a transação inteira. Não toca a família real.
-- Cada linha começa com OBS e diz o que aconteceu (sem PASS/FALHA pré-julgado).
DO $s$
DECLARE
  ua uuid := gen_random_uuid();
  ub uuid := gen_random_uuid();
  fa uuid; fb uuid; ma uuid; mb uuid;
  ca uuid; cb uuid; wa uuid;
  box_w uuid; box_p uuid; box_u uuid; box_x uuid;
  hoje date; m0 date; m1 date; m2 date;
  n int; nb bigint; v bigint; soma bigint;
  r text; s text; e text;
  saida text := '';
BEGIN
  hoje := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  m0 := date_trunc('month', hoje - interval '3 months')::date;
  m1 := (m0 + interval '1 month')::date;
  m2 := (m0 + interval '2 months')::date;
  saida := saida || E'\n  OBS hoje=' || hoje || ' m0=' || m0 || ' m1=' || m1 || ' m2=' || m2;

  -- fixtures (postgres)
  INSERT INTO auth.users (id, email, aud, role)
  VALUES (ua, 'sentinela-a-' || ua || '@example.com', 'authenticated', 'authenticated'),
         (ub, 'sentinela-b-' || ub || '@example.com', 'authenticated', 'authenticated');
  INSERT INTO public.families (name, join_code) VALUES ('Sentinela A', 'QK2357') RETURNING id INTO fa;
  INSERT INTO public.families (name, join_code) VALUES ('Sentinela B', 'QK2358') RETURNING id INTO fb;
  INSERT INTO public.family_members (family_id, user_id, display_name) VALUES (fa, ua, 'Sentinela A') RETURNING id INTO ma;
  INSERT INTO public.family_members (family_id, user_id, display_name) VALUES (fb, ub, 'Sentinela B') RETURNING id INTO mb;
  INSERT INTO public.accounts (family_id, owner_member_id, name, type) VALUES (fa, ma, 'Corrente A', 'corrente') RETURNING id INTO ca;
  INSERT INTO public.accounts (family_id, owner_member_id, name, type) VALUES (fb, mb, 'Corrente B', 'corrente') RETURNING id INTO cb;
  INSERT INTO public.transactions (family_id, type, description, amount, date, account_id, created_by_member_id, paid_by_member_id, is_paid, paid_date)
  VALUES (fa, 'receita', 'Salario A', 5000.00, hoje, ca, ma, ma, true, hoje);

  -- ================================================================ como A
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  PERFORM public.carteira_aplicar(ca, 1000, NULL);   -- cria a conta-carteira de A
  SELECT account_id INTO wa FROM public.investment_wallets WHERE family_id = fa;

  -- ---------------------------------------------------------------- H1 = S08 do r1, reproduzido igual
  -- Caixinha criada em m0, R$1.000 entram em m0+4 e SAEM inteiros no dia 1 de m1. Taxa 1%/mês.
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

  SELECT string_agg(to_char(p.competencia, 'YYYY-MM') || '=' || p.rendimento_cents, ',' ORDER BY p.competencia) INTO r
    FROM public.carteira_rendimentos_pendentes() p WHERE p.caixinha_id = box_w;
  saida := saida || E'\n  OBS H1a caixinha zerada no dia 1 de ' || to_char(m1, 'YYYY-MM') || ': pendentes = ' || coalesce(r, '<nenhum>')
                 || ' | calculado(m1)=' || public.carteira_rendimento_calculado(box_w, m1)
                 || ' | calculado(m2)=' || public.carteira_rendimento_calculado(box_w, m2);
  r := 'ok';
  BEGIN
    SELECT x.valor_cents INTO v FROM public.carteira_confirmar_rendimento(box_w, m1) x;
  EXCEPTION WHEN OTHERS THEN r := SQLERRM;
  END;
  saida := saida || E'\n  OBS H1b confirmar ' || to_char(m1, 'YYYY-MM') || ' direto (o ataque do r1) -> ' || r;
  v := NULL; r := 'ok';
  BEGIN
    SELECT x.valor_cents INTO v FROM public.carteira_confirmar_rendimento(box_w, m0) x;
  EXCEPTION WHEN OTHERS THEN r := SQLERRM;
  END;
  saida := saida || E'\n  OBS H1c confirmar ' || to_char(m0, 'YYYY-MM') || ' -> ' || r || ' valor=' || coalesce(v, -1);
  SELECT string_agg(to_char(p.competencia, 'YYYY-MM') || '=' || p.rendimento_cents, ',' ORDER BY p.competencia) INTO r
    FROM public.carteira_rendimentos_pendentes() p WHERE p.caixinha_id = box_w;
  saida := saida || E'\n  OBS H1d pendentes depois de confirmar m0 = ' || coalesce(r, '<nenhum>');
  v := NULL; r := 'ok';
  BEGIN
    SELECT x.valor_cents INTO v FROM public.carteira_confirmar_rendimento(box_w, m1) x;
  EXCEPTION WHEN OTHERS THEN r := SQLERRM;
  END;
  SELECT balance_cents INTO nb FROM public.investment_boxes WHERE id = box_w;
  saida := saida || E'\n  OBS H1e confirmar ' || to_char(m1, 'YYYY-MM') || ' -> ' || r || ' valor=' || coalesce(v, -1) || ' | saldo da caixinha=' || nb;

  -- ---------------------------------------------------------------- H2 saque parcial no meio do mês
  -- R$1.000 em m0+4; saque de R$400 em m1+14. Base de m1 = 60000 + rendimento confirmado de m0.
  RESET ROLE;
  INSERT INTO public.investment_boxes (family_id, account_id, name, rate_type, rate_bps, rate_defined_at, resgate_imediato, balance_cents, created_at)
  VALUES (fa, wa, 'Parcial', 'liquidez_diaria', 100, m0, true, 0, m0::timestamp AT TIME ZONE 'America/Sao_Paulo')
  RETURNING id INTO box_p;
  INSERT INTO public.investment_box_rates (family_id, box_id, rate_bps, valid_from) VALUES (fa, box_p, 100, m0);
  INSERT INTO public.investment_box_movements (family_id, box_id, kind, counterpart, amount_cents, occurred_on, created_by_member_id)
  VALUES (fa, box_p, 'entrada', 'nao_alocado', 100000, m0 + 4,  ma),
         (fa, box_p, 'saida',   'nao_alocado',  40000, m1 + 14, ma);
  UPDATE public.investment_boxes SET balance_cents = 60000 WHERE id = box_p;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  PERFORM public.carteira_confirmar_rendimento(box_p, m0);
  SELECT x.valor_cents INTO v FROM public.carteira_confirmar_rendimento(box_p, m1) x;
  SELECT balance_cents INTO nb FROM public.investment_boxes WHERE id = box_p;
  saida := saida || E'\n  OBS H2 saque de 40000 em ' || (m1 + 14) || ': rendimento confirmado de m1=' || v || ' (esperado 1% de 61000=610) | saldo=' || nb;

  -- ---------------------------------------------------------------- H3 regra ESCOLHIDA (risco aceito)
  -- Caixinha vazia criada em m0; entra R$1.000 no ÚLTIMO dia de m1 e sai no dia 1 de m2.
  RESET ROLE;
  INSERT INTO public.investment_boxes (family_id, account_id, name, rate_type, rate_bps, rate_defined_at, resgate_imediato, balance_cents, created_at)
  VALUES (fa, wa, 'Ultimo dia', 'liquidez_diaria', 100, m0, true, 0, m0::timestamp AT TIME ZONE 'America/Sao_Paulo')
  RETURNING id INTO box_u;
  INSERT INTO public.investment_box_rates (family_id, box_id, rate_bps, valid_from) VALUES (fa, box_u, 100, m0);
  INSERT INTO public.investment_box_movements (family_id, box_id, kind, counterpart, amount_cents, occurred_on, created_by_member_id)
  VALUES (fa, box_u, 'entrada', 'nao_alocado', 100000, m2 - 1, ma),
         (fa, box_u, 'saida',   'nao_alocado', 100000, m2,     ma);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT string_agg(to_char(p.competencia, 'YYYY-MM') || '=' || p.rendimento_cents, ',' ORDER BY p.competencia) INTO r
    FROM public.carteira_rendimentos_pendentes() p WHERE p.caixinha_id = box_u;
  saida := saida || E'\n  OBS H3 R$1.000 por 1 dia (' || (m2 - 1) || ' -> ' || m2 || '): pendentes = ' || coalesce(r, '<nenhum>');

  -- ---------------------------------------------------------------- H4 invariante saldo = soma dos movimentos
  SELECT count(*) INTO n FROM (
    SELECT b.id, b.balance_cents,
           COALESCE(sum(CASE WHEN m.kind = 'saida' THEN -m.amount_cents ELSE m.amount_cents END), 0) AS soma
    FROM public.investment_boxes b LEFT JOIN public.investment_box_movements m ON m.box_id = b.id
    WHERE b.family_id = fa GROUP BY b.id, b.balance_cents) t
  WHERE t.balance_cents <> t.soma;
  saida := saida || E'\n  OBS H4 caixinhas de A com saldo diferente da soma dos movimentos: ' || n;

  -- ---------------------------------------------------------------- H5 A5: conta-carteira
  r := 'ok';
  BEGIN
    UPDATE public.accounts SET archived_at = now() WHERE id = wa;
    GET DIAGNOSTICS n = ROW_COUNT; r := 'aceito, ' || n || ' linha(s)';
  EXCEPTION WHEN OTHERS THEN r := SQLSTATE || ' ' || SQLERRM;
  END;
  s := 'ok';
  BEGIN
    UPDATE public.accounts SET name = 'Carteira renomeada' WHERE id = wa;
    GET DIAGNOSTICS n = ROW_COUNT; s := 'aceito, ' || n || ' linha(s)';
  EXCEPTION WHEN OTHERS THEN s := SQLSTATE || ' ' || SQLERRM;
  END;
  e := 'ok';
  BEGIN
    DELETE FROM public.accounts WHERE id = wa;
    GET DIAGNOSTICS n = ROW_COUNT; e := 'aceito, ' || n || ' linha(s)';
  EXCEPTION WHEN OTHERS THEN e := SQLSTATE || ' ' || SQLERRM;
  END;
  saida := saida || E'\n  OBS H5 A arquiva a conta-carteira -> ' || r || ' | renomeia -> ' || s || ' | exclui -> ' || e;
  -- B tenta arquivar a carteira de A
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  UPDATE public.accounts SET archived_at = now() WHERE id = wa;
  GET DIAGNOSTICS n = ROW_COUNT;
  saida := saida || E'\n  OBS H5b B arquiva a conta-carteira de A -> ' || n || ' linha(s) afetada(s)';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  -- ---------------------------------------------------------------- H6 A6: nomes pela RPC direta
  -- casos que o teste do Estrutura não usa
  r := 'ok';
  BEGIN PERFORM public.carteira_criar_caixinha(NULL, 'liquidez_diaria', 0, true, NULL); EXCEPTION WHEN OTHERS THEN r := SQLERRM; END;
  saida := saida || E'\n  OBS H6a nome NULL -> ' || r;
  r := 'ok';
  BEGIN PERFORM public.carteira_criar_caixinha(chr(12288) || chr(8203) || chr(65279), 'liquidez_diaria', 0, true, NULL); EXCEPTION WHEN OTHERS THEN r := SQLERRM; END;
  saida := saida || E'\n  OBS H6b nome U+3000+U+200B+U+FEFF -> ' || r;
  r := 'ok';
  BEGIN
    box_x := public.carteira_criar_caixinha(chr(10240) || chr(10240) || chr(10240), 'liquidez_diaria', 0, true, NULL);
    SELECT 'CRIADA nome_hex=' || encode(convert_to(name, 'UTF8'), 'hex') || ' len=' || char_length(name) INTO r FROM public.investment_boxes WHERE id = box_x;
  EXCEPTION WHEN OTHERS THEN r := SQLERRM; END;
  saida := saida || E'\n  OBS H6c nome so U+2800 (Braille em branco) x3 -> ' || r;
  r := 'ok';
  BEGIN
    box_x := public.carteira_criar_caixinha(repeat(chr(769), 5), 'liquidez_diaria', 0, true, NULL);
    SELECT 'CRIADA nome_hex=' || encode(convert_to(name, 'UTF8'), 'hex') || ' len=' || char_length(name) INTO r FROM public.investment_boxes WHERE id = box_x;
  EXCEPTION WHEN OTHERS THEN r := SQLERRM; END;
  saida := saida || E'\n  OBS H6d nome so U+0301 (acento combinante solto) x5 -> ' || r;
  r := 'ok';
  BEGIN
    box_x := public.carteira_criar_caixinha(repeat('a', 60) || repeat(chr(8203), 10), 'liquidez_diaria', 0, true, NULL);
    SELECT 'CRIADA len=' || char_length(name) INTO r FROM public.investment_boxes WHERE id = box_x;
  EXCEPTION WHEN OTHERS THEN r := SQLERRM; END;
  saida := saida || E'\n  OBS H6e 60 letras + 10 U+200B -> ' || r;
  r := 'ok';
  BEGIN
    box_x := public.carteira_criar_caixinha('Reserva' || chr(8238) || 'atsiv' || chr(1) || chr(9) || '  Pet', 'liquidez_diaria', 0, true, NULL);
    SELECT 'CRIADA nome=[' || name || ']' INTO r FROM public.investment_boxes WHERE id = box_x;
  EXCEPTION WHEN OTHERS THEN r := SQLERRM; END;
  saida := saida || E'\n  OBS H6f nome com U+202E, U+0001, tab e espacos -> ' || r;

  RESET ROLE;
  RAISE EXCEPTION 'PLACAR sentinela-hostil-r2:%', saida;
END $s$;
