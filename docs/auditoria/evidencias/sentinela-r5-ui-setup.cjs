// Sentinela R5 — cria (ou apaga, com "limpar") a conta descartável usada nos testes de navegador.
// Uso (de app/): node ../docs/auditoria/evidencias/sentinela-r5-ui-setup.cjs criar|limpar
// A senha/ids ficam em %TEMP% (fora do repositório), nunca impressos aqui além do e-mail.
const fs = require('fs')
const os = require('os')
const path = require('path')
const { createClient } = require('C:/dev/financas-a-dois/app/node_modules/@supabase/supabase-js')
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const ARQ = path.join(os.tmpdir(), 'sentinela-r5-ui.json')

async function criar() {
  const stamp = Date.now()
  const contas = []
  for (const tag of ['ui', 'atacante']) {
    const email = `sentinela-r5-${tag}-${stamp}@example.com`
    const senha = 'Sentinela!R5-ui-' + stamp
    const { data: u, error } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true })
    if (error) throw error
    const cli = createClient(URL, ANON, { auth: { persistSession: false } })
    const s = await cli.auth.signInWithPassword({ email, password: senha })
    if (s.error) throw s.error
    const { data: fam, error: fe } = await cli.rpc('create_family', { p_family_name: `Sentinela R5 ${tag === 'ui' ? 'UI' : 'Atacante'}`, p_split_rule: 'equal', p_member_name: tag === 'ui' ? 'Sentinela UI' : 'Atacante R5', p_monthly_income: 1000 })
    if (fe) throw fe
    const f = fam[0]
    const conta = (await cli.from('accounts').select('id').eq('family_id', f.family_id).limit(1)).data[0].id
    const c2 = await cli.from('accounts').insert({ family_id: f.family_id, owner_member_id: f.member_id, name: 'Poupança R5', type: 'corrente', initial_balance: 0, sort_order: 5 }).select('id').single()
    const cat = (await cli.from('categories').select('id').eq('family_id', f.family_id).eq('type', 'despesa').limit(1)).data[0].id
    if (tag === 'ui') {
      const itens = [
        { type: 'despesa', description: 'Mercado teste R5', amount: 120.5, date: '2026-10-08', account_id: conta, category_id: cat, is_paid: true, paid_date: '2026-10-08', recurrence_months: 1 },
        { type: 'receita', description: 'Salário teste R5', amount: 3000, date: '2026-10-05', account_id: conta, is_paid: true, paid_date: '2026-10-05', recurrence_months: 1 },
        { type: 'despesa', description: 'Notebook 3x R5', amount: 300, date: '2026-10-09', account_id: conta, category_id: cat, is_paid: false, recurrence_months: 3 },
        { type: 'transferencia', description: 'Guardar R5', amount: 50, date: '2026-10-10', account_id: conta, to_account_id: c2.data.id, is_paid: true, paid_date: '2026-10-10', recurrence_months: 1 },
      ]
      const r = await cli.rpc('save_transactions', { p_items: itens })
      if (r.error) throw r.error
    }
    contas.push({ tag, email, senha, uid: u.user.id, familyId: f.family_id })
  }
  fs.writeFileSync(ARQ, JSON.stringify(contas))
  console.log(JSON.stringify(contas.map((c) => ({ tag: c.tag, email: c.email, uid: c.uid, familyId: c.familyId }))))
}

async function limpar() {
  const contas = JSON.parse(fs.readFileSync(ARQ, 'utf8'))
  const out = []
  for (const c of contas) {
    const tx = await admin.from('transactions').delete().eq('family_id', c.familyId).select('id')
    const fam = await admin.from('families').delete().eq('id', c.familyId).select('id')
    const u = await admin.auth.admin.deleteUser(c.uid)
    out.push({ email: c.email, tx: tx.data?.length ?? tx.error?.message, familia: fam.data?.length ?? fam.error?.message, usuario: u.error ? u.error.message : 'removido' })
  }
  fs.unlinkSync(ARQ)
  console.log(JSON.stringify(out))
}

;(process.argv[2] === 'limpar' ? limpar() : criar()).catch((e) => { console.error('ERRO', e.message); process.exit(1) })
