// Sentinela — auditoria R4 — leitura do estado do banco (SOMENTE LEITURA).
// Uso (de dentro de app/): set -a && . ./.env.local && set +a && node ../docs/auditoria/evidencias/sentinela-r4-estado-banco.cjs
// E-mails são mascarados na saída (PII).
const { createRequire } = require('module')
const req = createRequire('C:/dev/financas-a-dois/app/package.json')
const { createClient } = req('@supabase/supabase-js')

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})
const mask = (e) => (e ? e.replace(/^(.{3}).*(@.*)$/, '$1***$2') : e)

;(async () => {
  const { data: fams, error: e1 } = await admin.from('families').select('id,name,join_code,member_limit,created_at')
  if (e1) throw e1
  console.log('families:', fams.length)
  for (const f of fams) console.log('  ', f.id, '|', f.name, '| join_code=', f.join_code, '| member_limit=', f.member_limit)

  const { data: mems, error: e2 } = await admin.from('family_members').select('id,family_id,user_id,display_name')
  if (e2) throw e2
  console.log('family_members:', mems.length)
  for (const m of mems) console.log('  ', m.display_name, '| user_id=', m.user_id, '| family=', m.family_id)

  const todos = []
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    todos.push(...data.users)
    if (data.users.length < 1000) break
  }
  const membros = new Set(mems.map((m) => m.user_id))
  console.log('auth.users:', todos.length)
  for (const u of todos) console.log('  ', u.id, '|', mask(u.email), '| membro?', membros.has(u.id))
  const orfaos = todos.filter((u) => !membros.has(u.id))
  console.log('usuarios orfaos (sem family_members):', orfaos.length)

  // Sanidade de integridade pos-limpeza
  for (const t of ['accounts', 'categories', 'payment_methods', 'transactions', 'category_budgets', 'account_goals', 'push_subscriptions']) {
    const { count, error } = await admin.from(t).select('id', { count: 'exact', head: true })
    const { count: fora } = await admin
      .from(t)
      .select('id', { count: 'exact', head: true })
      .not('family_id', 'in', `(${fams.map((f) => f.id).join(',')})`)
    console.log(`${t}: total=${error ? 'ERRO ' + error.message : count} | fora da(s) familia(s) existente(s)=${fora}`)
  }
  const { count: txNullCat } = await admin.from('transactions').select('id', { count: 'exact', head: true }).is('category_id', null)
  console.log('transactions com category_id NULL:', txNullCat)

  // Carol real: o e-mail do fallback hardcoded de semear.mjs e o e-mail real coincidem?
  const FALLBACK = 'carol.financas.teste@gmail.com'
  const carol = mems.find((m) => /carol/i.test(m.display_name))
  const uCarol = carol && todos.find((u) => u.id === carol.user_id)
  console.log('fallback de semear.mjs == e-mail real da membro Carol?', uCarol ? uCarol.email === FALLBACK : 'n/a')
})().catch((e) => {
  console.error('ERRO', e.message || e)
  process.exit(1)
})
