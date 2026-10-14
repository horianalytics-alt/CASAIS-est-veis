-- Teste de isolamento de tenant de category_groups (migration 00011).
--
-- Roda POR SQL contra o banco hospedado, trocando o papel com
-- SET LOCAL ROLE + request.jwt.claims — o mesmo caminho que o PostgREST usa.
--
-- NUNCA GRAVA NADA: o bloco termina SEMPRE em RAISE EXCEPTION com o placar.
-- A exceção desfaz a transação inteira (usuários, famílias, grupos e
-- categorias de teste). Não existe limpeza para esquecer. Não toca na família
-- real: as duas famílias são criadas aqui, com usuários com uuid novo.
--
-- Não rode este arquivo direto: use tests/integration/grupos-rls.mjs, que
-- interpreta o placar e devolve código de saída.
DO $teste$
DECLARE
  ua uuid := gen_random_uuid();
  ub uuid := gen_random_uuid();
  fa uuid; fb uuid;
  ga uuid; gb uuid;
  ca uuid; cb uuid;
  n  int;
  v_estado text;
  v_texto  text;
  v_total  int := 0;
  v_falhas int := 0;
  v_linhas text := '';
BEGIN
  -- ------------------------------------------------------------ fixtures (postgres)
  INSERT INTO auth.users (id, email, aud, role)
  VALUES (ua, 'rls-grupos-a-' || ua || '@example.com', 'authenticated', 'authenticated'),
         (ub, 'rls-grupos-b-' || ub || '@example.com', 'authenticated', 'authenticated');

  INSERT INTO public.families (name, join_code) VALUES ('RLS Grupos A', 'QQ2345') RETURNING id INTO fa;
  INSERT INTO public.families (name, join_code) VALUES ('RLS Grupos B', 'QQ2346') RETURNING id INTO fb;
  INSERT INTO public.family_members (family_id, user_id, display_name) VALUES (fa, ua, 'Membro A');
  INSERT INTO public.family_members (family_id, user_id, display_name) VALUES (fb, ub, 'Membro B');

  INSERT INTO public.category_groups (family_id, name) VALUES (fa, 'Grupo A') RETURNING id INTO ga;
  INSERT INTO public.category_groups (family_id, name) VALUES (fb, 'Grupo B') RETURNING id INTO gb;
  INSERT INTO public.categories (family_id, name, type, group_id)
    VALUES (fa, 'Categoria A', 'despesa', ga) RETURNING id INTO ca;
  INSERT INTO public.categories (family_id, name, type, group_id)
    VALUES (fb, 'Categoria B', 'despesa', gb) RETURNING id INTO cb;

  -- ------------------------------------------------------------ como o usuário A
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  -- R01 controle positivo: sem ele, um teste que nunca enxerga linha nenhuma
  -- passaria em todas as asserções de "0 linhas".
  SELECT count(*) INTO n FROM public.category_groups WHERE id = ga;
  v_total := v_total + 1;
  IF n = 1 THEN v_linhas := v_linhas || E'\n  PASS  R01 A lê o próprio grupo (1 linha)';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA R01 A lê o próprio grupo — obtido ' || n; END IF;

  SELECT count(*) INTO n FROM public.category_groups WHERE id = gb;
  v_total := v_total + 1;
  IF n = 0 THEN v_linhas := v_linhas || E'\n  PASS  R02 A não lê o grupo de B (0 linhas)';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA R02 A lê o grupo de B — ' || n || ' linha(s)'; END IF;

  SELECT count(*) INTO n FROM public.category_groups;
  v_total := v_total + 1;
  IF n = 1 THEN v_linhas := v_linhas || E'\n  PASS  R03 SELECT sem filtro devolve só o grupo de A';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA R03 SELECT sem filtro devolveu ' || n || ' linhas'; END IF;

  UPDATE public.category_groups SET name = 'Invadido' WHERE id = gb;
  GET DIAGNOSTICS n = ROW_COUNT;
  v_total := v_total + 1;
  IF n = 0 THEN v_linhas := v_linhas || E'\n  PASS  R04 UPDATE no grupo de B afeta 0 linhas';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA R04 UPDATE no grupo de B afetou ' || n; END IF;

  DELETE FROM public.category_groups WHERE id = gb;
  GET DIAGNOSTICS n = ROW_COUNT;
  v_total := v_total + 1;
  IF n = 0 THEN v_linhas := v_linhas || E'\n  PASS  R05 DELETE no grupo de B afeta 0 linhas';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA R05 DELETE no grupo de B afetou ' || n; END IF;

  v_estado := 'ok';
  BEGIN
    INSERT INTO public.category_groups (family_id, name) VALUES (fb, 'Plantado por A');
  EXCEPTION WHEN OTHERS THEN v_estado := SQLSTATE;
  END;
  v_total := v_total + 1;
  IF v_estado = '42501' THEN v_linhas := v_linhas || E'\n  PASS  R06 INSERT de grupo na família de B recusado (42501)';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA R06 INSERT na família de B — resultado ' || v_estado; END IF;

  v_estado := 'ok';
  BEGIN
    UPDATE public.category_groups SET family_id = fb WHERE id = ga;
  EXCEPTION WHEN OTHERS THEN v_estado := SQLSTATE;
  END;
  v_total := v_total + 1;
  IF v_estado = '42501' THEN v_linhas := v_linhas || E'\n  PASS  R07 mover o próprio grupo para a família de B recusado (42501)';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA R07 mover grupo para B — resultado ' || v_estado; END IF;

  v_estado := 'ok';
  BEGIN
    UPDATE public.categories SET group_id = gb WHERE id = ca;
  EXCEPTION WHEN OTHERS THEN v_estado := SQLSTATE;
  END;
  v_total := v_total + 1;
  IF v_estado = '23503' THEN v_linhas := v_linhas || E'\n  PASS  R08 pendurar categoria de A no grupo de B recusado (23503, FK composta)';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA R08 categoria de A no grupo de B — resultado ' || v_estado; END IF;

  UPDATE public.categories SET group_id = ga WHERE id = cb;
  GET DIAGNOSTICS n = ROW_COUNT;
  v_total := v_total + 1;
  IF n = 0 THEN v_linhas := v_linhas || E'\n  PASS  R09 mudar o grupo da categoria de B afeta 0 linhas';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA R09 mudou o grupo da categoria de B — ' || n; END IF;

  -- R10: excluir o próprio grupo desvincula a categoria e NÃO a apaga.
  DELETE FROM public.category_groups WHERE id = ga;
  GET DIAGNOSTICS n = ROW_COUNT;
  SELECT count(*) INTO n FROM public.categories
    WHERE id = ca AND group_id IS NULL AND family_id = fa;
  v_total := v_total + 1;
  IF n = 1 THEN v_linhas := v_linhas || E'\n  PASS  R10 excluir o grupo deixa a categoria sem grupo, na mesma família';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA R10 categoria depois de excluir o grupo — ' || n || ' linha(s) sem grupo'; END IF;

  -- ------------------------------------------------------------ como anon
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  SET LOCAL ROLE anon;
  v_estado := 'ok';
  BEGIN
    SELECT count(*) INTO n FROM public.category_groups;
  EXCEPTION WHEN OTHERS THEN v_estado := SQLSTATE;
  END;
  v_total := v_total + 1;
  IF v_estado = '42501' THEN v_linhas := v_linhas || E'\n  PASS  R11 anon sem acesso a category_groups (42501)';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA R11 anon leu category_groups — ' || v_estado || ', ' || coalesce(n, 0) || ' linha(s)'; END IF;

  -- ------------------------------------------------------------ conferência (postgres)
  RESET ROLE;
  SELECT name INTO v_texto FROM public.category_groups WHERE id = gb;
  v_total := v_total + 1;
  IF v_texto = 'Grupo B' THEN v_linhas := v_linhas || E'\n  PASS  R12 grupo de B intacto depois dos ataques';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA R12 grupo de B agora: ' || coalesce(v_texto, '<apagado>'); END IF;

  SELECT count(*) INTO n FROM public.category_groups WHERE family_id = fb;
  v_total := v_total + 1;
  IF n = 1 THEN v_linhas := v_linhas || E'\n  PASS  R13 família B continua com exatamente 1 grupo';
  ELSE v_falhas := v_falhas + 1; v_linhas := v_linhas || E'\n  FALHA R13 família B tem ' || n || ' grupo(s)'; END IF;

  -- Sempre aborta: o placar sai na mensagem e a transação é desfeita.
  RAISE EXCEPTION 'PLACAR grupos-rls: % de % passaram, % falha(s)%',
    v_total - v_falhas, v_total, v_falhas, v_linhas;
END $teste$;
