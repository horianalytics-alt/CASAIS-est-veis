// Sentinela R5 — retrato do banco (SOMENTE LEITURA, service_role).
// Uso (de app/): set -a && . ./.env.local && set +a && \
//   REAL_FAMILY_ID=<id> REAL_JOIN_CODE=<codigo> node ../docs/auditoria/evidencias/sentinela-r5-estado.cjs <rotulo>
// Imprime contagens globais e a impressão digital da família REAL. Nada de PII:
// e-mails aparecem só como contagem; ids da família real não são impressos além do prefixo.
// Sem fallback hardcoded no código (achado de security-guidance): o id e o
// join_code da família real vêm só de env var, nunca de literal versionado.
const { createClient } = require('C:/dev/financas-a-dois/app/node_modules/@supabase/supabase-js')
const REAL = process.env.REAL_FAMILY_ID
const JOIN_CODE_ESPERADO = process.env.REAL_JOIN_CODE
if (!REAL || !JOIN_CODE_ESPERADO) {
  throw new Error('Defina REAL_FAMILY_ID e REAL_JOIN_CODE antes de rodar — sem fallback no código.')
}
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

async function contar(tabela, filtro) {
  let q = admin.from(tabela).select('id', { count: 'exact', head: true })
  if (filtro) q = q.eq('family_id', filtro)
  const { count, error } = await q
  if (error) throw new Error(`${tabela}: ${error.message}`)
  return count
}

;(async () => {
  const rotulo = process.argv[2] || 'retrato'
  let usuarios = 0, pagina = 1, sentinela = 0
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page: pagina, perPage: 1000 })
    if (error) throw error
    usuarios += data.users.length
    sentinela += data.users.filter((u) => /^sentinela-r5-/.test(u.email || '')).length
    if (data.users.length < 1000) break
    pagina++
  }
  const global = {}
  for (const t of ['families', 'family_members', 'accounts', 'categories', 'transactions', 'push_subscriptions', 'category_groups', 'category_budgets']) global[t] = await contar(t)
  const real = {}
  for (const t of ['family_members', 'accounts', 'categories', 'transactions', 'push_subscriptions', 'category_groups', 'category_budgets']) real[t] = await contar(t, REAL)
  const { data: tx } = await admin.from('transactions').select('amount,updated_at').eq('family_id', REAL)
  real.soma_valores = (tx || []).reduce((s, r) => s + Number(r.amount), 0).toFixed(2)
  real.max_updated_at = (tx || []).map((r) => r.updated_at).sort().pop() || null
  const { data: fam } = await admin.from('families').select('join_code,name').eq('id', REAL).single()
  real.join_code_inalterado = fam?.join_code === JOIN_CODE_ESPERADO
  const { data: testes } = await admin.from('families').select('id').like('name', 'Sentinela R5%')
  console.log(JSON.stringify({ rotulo, quando: new Date().toISOString(), auth_users: usuarios, auth_users_sentinela_r5: sentinela, familias_sentinela_r5: (testes || []).length, global, familia_real: real }, null, 2))
})().catch((e) => { console.error('ERRO', e.message); process.exit(1) })
