-- Sentinela r2 — SOMENTE LEITURA. Estado do banco de produção e catálogo da 00018.
-- Nenhum dado pessoal: só contagens e metadados de catálogo.
select
  (select string_agg(version, ',' order by version) from supabase_migrations.schema_migrations where version >= '00016') as migrations_16_em_diante,
  (select count(*) from public.families) as familias,
  (select count(*) from public.investment_wallets) as carteiras,
  (select count(*) from public.investment_boxes) as caixinhas,
  (select count(*) from public.investment_box_movements) as movimentos,
  (select count(*) from public.investment_box_movements where kind = 'rendimento') as rendimentos_confirmados,
  (select count(*) from auth.users where email like 'sentinela-%' or email like '%@example.com') as usuarios_de_teste_residuais,
  (select prosrc ~ 'occurred_on <= v_fim' from pg_proc where oid = 'public.carteira_rendimento_calculado(uuid, date)'::regprocedure) as rendimento_usa_fim_do_mes,
  (select prosecdef from pg_proc where oid = 'public.carteira_rendimento_calculado(uuid, date)'::regprocedure) as rendimento_calc_definer,
  (select has_function_privilege('authenticated', 'public.carteira_rendimento_calculado(uuid, date)', 'EXECUTE')) as rendimento_calc_exec_authenticated,
  (select has_function_privilege('anon', 'public.carteira_rendimento_calculado(uuid, date)', 'EXECUTE')) as rendimento_calc_exec_anon,
  (select has_function_privilege('anon', 'public.carteira_criar_caixinha(text, text, integer, boolean, date)', 'EXECUTE')) as criar_exec_anon,
  (select pg_get_triggerdef(oid) from pg_trigger where tgname = 'trg_accounts_carteira_congela') as trigger_def,
  (select tgenabled from pg_trigger where tgname = 'trg_accounts_carteira_congela') as trigger_enabled,
  (select prosecdef from pg_proc where oid = 'public.accounts_carteira_congela()'::regprocedure) as trava_definer,
  (select md5(prosrc) from pg_proc where oid = 'public.carteira_rendimento_calculado(uuid, date)'::regprocedure) as md5_rendimento_calc,
  (select md5(prosrc) from pg_proc where oid = 'public.carteira_criar_caixinha(text, text, integer, boolean, date)'::regprocedure) as md5_criar,
  (select md5(prosrc) from pg_proc where oid = 'public.accounts_carteira_congela()'::regprocedure) as md5_trava;
