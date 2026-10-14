// Sentinela — R4 — complemento: o BANCO limita o tamanho do nome (sem a action)?
// Reusa o usuário A descartável da execução 2 (família 5db71b29-...). Não toca a família real.
// Uso (de dentro de app/): set -a && . ./.env.local && set +a && node ../docs/auditoria/evidencias/sentinela-r4-tamanho-direto.cjs
const { createRequire } = require('module')
const req = createRequire('C:/dev/financas-a-dois/app/package.json')
const { createClient } = req('@supabase/supabase-js')

const UID_A = 'b24e3eb8-caf2-400b-b5c4-500215ed59e9'
const FAM_A = '5db71b29-5a31-49e6-a11b-023b83534bba'
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL

;(async () => {
  const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  const { data: u, error } = await admin.auth.admin.getUserById(UID_A)
  if (error) throw error
  const email = u.user.email
  if (!/^sentinela-r4-a-\d+@example\.com$/.test(email)) throw new Error('usuario nao e descartavel: abortado')
  const stamp = email.match(/-(\d+)@/)[1]
  const cli = createClient(URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  const { error: sErr } = await cli.auth.signInWithPassword({ email, password: 'Sentinela!R4-' + stamp })
  if (sErr) throw sErr

  const nome = 'L'.repeat(10000)
  const cat = await cli.from('categories').insert({ family_id: FAM_A, name: nome, type: 'despesa' }).select('id,name')
  console.log('OBS 6.categoria_10k_direto =>', JSON.stringify({ err: cat.error?.code, msg: cat.error?.message, id: cat.data?.[0]?.id, len: cat.data?.[0]?.name.length }))
  const fp = await cli.from('payment_methods').insert({ family_id: FAM_A, name: 'M'.repeat(10000) }).select('id,name')
  console.log('OBS 6.forma_10k_direto =>', JSON.stringify({ err: fp.error?.code, msg: fp.error?.message, id: fp.data?.[0]?.id, len: fp.data?.[0]?.name.length }))
  const zw = await cli.from('categories').insert({ family_id: FAM_A, name: '\u200b\u200b', type: 'receita' }).select('id,name')
  console.log('OBS 6.categoria_so_zwsp_direto =>', JSON.stringify({ err: zw.error?.code, msg: zw.error?.message, id: zw.data?.[0]?.id }))
})().catch((e) => {
  console.error('ERRO', e.message || e)
  process.exit(1)
})
