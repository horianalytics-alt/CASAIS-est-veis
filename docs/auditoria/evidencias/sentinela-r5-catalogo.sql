-- Sentinela R5 — leitura de catálogo (SOMENTE SELECT, nada é gravado).
SELECT json_build_object(
  'rls', (SELECT json_agg(json_build_object('tabela', c.relname, 'rls', c.relrowsecurity, 'force', c.relforcerowsecurity) ORDER BY c.relname)
          FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relkind = 'r'),
  'policies', (SELECT json_agg(json_build_object('tabela', tablename, 'policy', policyname, 'cmd', cmd, 'roles', roles, 'using', qual, 'check', with_check) ORDER BY tablename, policyname)
               FROM pg_policies WHERE schemaname = 'public'
                 AND tablename IN ('push_subscriptions','category_groups','category_budgets','transactions','categories')),
  'views', (SELECT json_agg(json_build_object('view', c.relname, 'reloptions', c.reloptions,
                    'anon_select', has_table_privilege('anon', c.oid, 'SELECT'),
                    'auth_select', has_table_privilege('authenticated', c.oid, 'SELECT'),
                    'auth_insert', has_table_privilege('authenticated', c.oid, 'INSERT')) ORDER BY c.relname)
            FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind IN ('v','m')),
  'anon_tabelas', (SELECT json_agg(json_build_object('tabela', c.relname,
                    'sel', has_table_privilege('anon', c.oid, 'SELECT'),
                    'ins', has_table_privilege('anon', c.oid, 'INSERT'),
                    'upd', has_table_privilege('anon', c.oid, 'UPDATE'),
                    'del', has_table_privilege('anon', c.oid, 'DELETE')) ORDER BY c.relname)
            FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind = 'r'),
  'auth_update_colunas_transactions', (SELECT json_agg(column_name ORDER BY column_name) FROM information_schema.column_privileges
            WHERE table_schema='public' AND table_name='transactions' AND grantee='authenticated' AND privilege_type='UPDATE'),
  'auth_insert_colunas_transactions', (SELECT json_agg(column_name ORDER BY column_name) FROM information_schema.column_privileges
            WHERE table_schema='public' AND table_name='transactions' AND grantee='authenticated' AND privilege_type='INSERT'),
  'funcoes_definer', (SELECT json_agg(json_build_object('fn', p.oid::regprocedure::text, 'definer', p.prosecdef,
                    'config', p.proconfig,
                    'anon_exec', has_function_privilege('anon', p.oid, 'EXECUTE'),
                    'auth_exec', has_function_privilege('authenticated', p.oid, 'EXECUTE')) ORDER BY p.proname)
            FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.prosecdef),
  'fk_recurrence', (SELECT json_agg(pg_get_constraintdef(oid)) FROM pg_constraint
            WHERE conrelid = 'public.transactions'::regclass AND contype='f' AND pg_get_constraintdef(oid) LIKE '%recurrence_parent_id%'),
  'pg_version', current_setting('server_version')
) AS catalogo;
