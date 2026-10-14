// Sentinela — auditoria R4 — catálogo do Postgres (SOMENTE LEITURA: transação READ ONLY).
// Uso: DB_URL=... node sentinela-r4-catalogo.cjs
const { createRequire } = require('module')
const fs = require('fs')
const PGTOOL = process.env.PGTOOL_DIR
const req = createRequire(PGTOOL + '/package.json')
const pg = req('pg')
const CA = fs.readFileSync(PGTOOL + '/supabase-ca.crt', 'utf8')

;(async () => {
  const c = new pg.Client({ connectionString: process.env.DB_URL, ssl: { ca: CA, rejectUnauthorized: true } })
  await c.connect()
  await c.query('BEGIN TRANSACTION READ ONLY')
  const run = async (titulo, sql) => {
    console.log('\n===== ' + titulo + ' =====')
    const r = await c.query(sql)
    for (const row of r.rows) console.log(JSON.stringify(row))
    console.log('-- ' + r.rows.length + ' linha(s)')
  }
  await run('versao', `select version()`)
  await run(
    'FKs em public com ON DELETE SET NULL (definicao real)',
    `select conrelid::regclass as tabela, conname, pg_get_constraintdef(oid) as def
       from pg_constraint where contype='f' and connamespace='public'::regnamespace
        and pg_get_constraintdef(oid) ilike '%SET NULL%' order by 1,2`,
  )
  await run(
    'FKs SET NULL sem lista de coluna (esperado 0)',
    `select conname from pg_constraint where contype='f' and connamespace='public'::regnamespace
        and pg_get_constraintdef(oid) ~ 'ON DELETE SET NULL$'`,
  )
  await run(
    'indices unicos de nome',
    `select indexrelid::regclass as indice, pg_get_indexdef(indexrelid) as def
       from pg_index where indexrelid::regclass::text in ('categories_nome_ativo_unico','payment_methods_nome_ativo_unico')`,
  )
  await run(
    'colisao funcional: o que a chave do indice gera para variantes de "Mercado"',
    `select v as entrada, lower(btrim(v)) as chave_indice
       from unnest(array['Mercado','mercado ','  MERCADO','Mer  cado','Mercado'||chr(9),'Mercado'||chr(160),'Mércado','Mercado'||chr(10)]) v`,
  )
  await run(
    'privilegios de tabela do role authenticated nas 3 tabelas',
    `select table_name, string_agg(privilege_type, ',' order by privilege_type) as privs
       from information_schema.role_table_grants
      where grantee='authenticated' and table_schema='public'
        and table_name in ('accounts','categories','payment_methods') group by 1 order by 1`,
  )
  await run(
    'privilegios de coluna UPDATE em accounts.type para authenticated',
    `select has_column_privilege('authenticated','public.accounts','type','UPDATE') as pode_update_type`,
  )
  await run(
    'triggers em accounts/categories/payment_methods',
    `select tgrelid::regclass as tabela, tgname from pg_trigger
      where not tgisinternal and tgrelid::regclass::text in ('accounts','categories','payment_methods')`,
  )
  await run(
    'CHECK de tamanho de nome nas 3 tabelas',
    `select conrelid::regclass as tabela, conname, pg_get_constraintdef(oid) as def from pg_constraint
      where contype='c' and conrelid::regclass::text in ('accounts','categories','payment_methods') order by 1,2`,
  )
  await run(
    'transactions.family_id NOT NULL',
    `select column_name, is_nullable from information_schema.columns
      where table_schema='public' and table_name='transactions' and column_name in ('family_id','category_id','payment_method_id')`,
  )
  await c.query('ROLLBACK')
  await c.end()
})().catch((e) => {
  console.error('ERRO', e.message)
  process.exit(1)
})
