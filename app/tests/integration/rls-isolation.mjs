// Teste de isolamento RLS: usuario da familia A nao le, nao escreve e nao
// altera nada da familia B. Roda contra o projeto hospedado.
// Uso: node rls-test.mjs
import { createClient } from '@supabase/supabase-js'

const URL = 'https://wxhfgstgjjlmqauogeid.supabase.co'
const ANON = process.env.ANON_KEY
const SERVICE = process.env.SERVICE_KEY

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } })

const stamp = Date.now()
const users = [
  { label: 'A', email: `rlstest-a-${stamp}@example.com`, pass: 'Senha!Forte123', family: 'Casa A', member: 'Alice' },
  { label: 'B', email: `rlstest-b-${stamp}@example.com`, pass: 'Senha!Forte123', family: 'Casa B', member: 'Bruno' },
]

let failures = 0
let checks = 0
const created = []

function check(name, passed, detail = '') {
  checks++
  if (passed) {
    console.log(`  PASS  ${name}${detail ? ' — ' + detail : ''}`)
  } else {
    failures++
    console.log(`  FALHA ${name}${detail ? ' — ' + detail : ''}`)
  }
}

async function setup(u) {
  const { data, error } = await admin.auth.admin.createUser({
    email: u.email, password: u.pass, email_confirm: true,
  })
  if (error) throw new Error(`createUser ${u.label}: ${error.message}`)
  u.uid = data.user.id
  created.push(u.uid)

  const cli = createClient(URL, ANON, { auth: { persistSession: false } })
  const { error: sErr } = await cli.auth.signInWithPassword({ email: u.email, password: u.pass })
  if (sErr) throw new Error(`signIn ${u.label}: ${sErr.message}`)
  u.cli = cli

  const { data: fam, error: fErr } = await cli.rpc('create_family', {
    p_family_name: u.family,
    p_split_rule: 'equal',
    p_member_name: u.member,
    p_monthly_income: 5000,
  })
  if (fErr) throw new Error(`create_family ${u.label}: ${fErr.message}`)
  const row = Array.isArray(fam) ? fam[0] : fam
  u.familyId = row.family_id
  u.memberId = row.member_id
  u.joinCode = row.join_code

  const { data: acc, error: aErr } = await cli.from('accounts')
    .select('id').eq('family_id', u.familyId).limit(1)
  if (aErr) throw new Error(`accounts ${u.label}: ${aErr.message}`)
  u.accountId = acc[0]?.id

  const { data: cat, error: cErr } = await cli.from('categories')
    .select('id').eq('family_id', u.familyId).limit(1)
  if (cErr) throw new Error(`categories ${u.label}: ${cErr.message}`)
  u.categoryId = cat[0]?.id

  const { data: tx, error: tErr } = await cli.from('transactions').insert({
    family_id: u.familyId,
    account_id: u.accountId,
    category_id: u.categoryId,
    created_by_member_id: u.memberId,
    paid_by_member_id: u.memberId,
    type: 'despesa',
    description: `Segredo da familia ${u.label}`,
    amount: u.label === 'A' ? 111.11 : 222.22,
    date: '2026-10-05',
    is_paid: true,
    paid_date: '2026-10-05',
  }).select('id').single()
  if (tErr) throw new Error(`insert tx ${u.label}: ${tErr.message}`)
  u.txId = tx.id

  console.log(`  setup ${u.label}: family=${u.familyId.slice(0, 8)} member=${u.memberId.slice(0, 8)} tx=${u.txId.slice(0, 8)}`)
}

async function run() {
  const [A, B] = users
  console.log('\n--- Setup: dois usuarios, duas familias ---')
  await setup(A)
  await setup(B)

  console.log('\n--- 1. Leitura cruzada ---')
  for (const [me, other] of [[A, B], [B, A]]) {
    const { data } = await me.cli.from('transactions').select('id,description,amount')
    const ids = (data ?? []).map((r) => r.id)
    check(`${me.label} ve apenas o proprio lancamento`,
      ids.length === 1 && ids[0] === me.txId,
      `viu ${ids.length} linha(s)`)
    check(`${me.label} NAO ve o lancamento de ${other.label}`,
      !ids.includes(other.txId))
  }

  console.log('\n--- 2. Leitura cruzada por filtro explicito ---')
  {
    const { data } = await A.cli.from('transactions').select('id').eq('family_id', B.familyId)
    check('A filtrando pelo family_id de B recebe vazio', (data ?? []).length === 0,
      `recebeu ${(data ?? []).length}`)
  }
  {
    const { data } = await A.cli.from('accounts').select('id').eq('family_id', B.familyId)
    check('A nao le contas de B', (data ?? []).length === 0)
  }
  {
    const { data } = await A.cli.from('family_members').select('id,display_name')
    const names = (data ?? []).map((r) => r.display_name)
    check('A nao ve membros de B', !names.includes(B.member), `viu [${names}]`)
  }

  console.log('\n--- 3. Escrita cruzada ---')
  {
    const { error } = await A.cli.from('transactions').insert({
      family_id: B.familyId,
      account_id: B.accountId,
      category_id: B.categoryId,
      created_by_member_id: B.memberId,
      paid_by_member_id: B.memberId,
      type: 'despesa', description: 'Invasao', amount: 9.99, date: '2026-10-06',
    })
    check('A NAO insere lancamento na familia de B', !!error, error?.code ?? 'INSERIU!')
  }
  {
    const { data, error } = await A.cli.from('transactions')
      .update({ amount: 1 }).eq('id', B.txId).select('id')
    check('A NAO altera lancamento de B',
      !error && (data ?? []).length === 0, error ? error.code : `${(data ?? []).length} alterada(s)`)
  }
  {
    const { data, error } = await A.cli.from('transactions')
      .delete().eq('id', B.txId).select('id')
    check('A NAO apaga lancamento de B',
      !error && (data ?? []).length === 0, error ? error.code : `${(data ?? []).length} apagada(s)`)
  }
  {
    const { data, error } = await A.cli.from('families')
      .update({ name: 'Tomada' }).eq('id', B.familyId).select('id')
    check('A NAO renomeia a familia de B',
      !error && (data ?? []).length === 0, error ? error.code : `${(data ?? []).length}`)
  }

  console.log('\n--- 4. Assinatura de lancamento ---')
  {
    const { error } = await A.cli.from('transactions').insert({
      family_id: A.familyId, account_id: A.accountId, category_id: A.categoryId,
      created_by_member_id: B.memberId,   // assinando como outra pessoa
      paid_by_member_id: A.memberId,
      type: 'despesa', description: 'Assinatura falsa', amount: 5, date: '2026-10-06',
    })
    check('A NAO assina lancamento como outro membro', !!error, error?.code ?? 'INSERIU!')
  }

  console.log('\n--- 5. Views de agregacao (security_invoker) ---')
  for (const [me, other] of [[A, B], [B, A]]) {
    const { data } = await me.cli.from('v_settlement').select('family_id,display_name')
    const fams = new Set((data ?? []).map((r) => r.family_id))
    check(`v_settlement de ${me.label} nao vaza outra familia`,
      fams.size <= 1 && !fams.has(other.familyId), `familias vistas: ${fams.size}`)
  }
  {
    const { data } = await A.cli.from('v_account_balances').select('family_id')
    const fams = new Set((data ?? []).map((r) => r.family_id))
    check('v_account_balances nao vaza outra familia',
      !fams.has(B.familyId), `familias vistas: ${fams.size}`)
  }
  {
    const { data } = await A.cli.from('v_monthly_summary').select('family_id')
    const fams = new Set((data ?? []).map((r) => r.family_id))
    check('v_monthly_summary nao vaza outra familia', !fams.has(B.familyId))
  }

  console.log('\n--- 6. Tokens de push sao privados entre o casal ---')
  {
    await A.cli.from('push_subscriptions').insert({
      family_id: A.familyId, member_id: A.memberId,
      endpoint: `https://push.example/${stamp}-a`, p256dh: 'x', auth: 'y',
    })
    const { data } = await B.cli.from('push_subscriptions').select('id')
    check('B nao le token de push de A', (data ?? []).length === 0)
  }

  console.log('\n--- 7. RPC com codigo de outra familia ---')
  {
    const { data, error } = await A.cli.rpc('family_preview', { p_join_code: B.joinCode })
    const row = Array.isArray(data) ? data[0] : data
    check('family_preview mostra so nome/vagas, sem dados financeiros',
      !error && row && !('transactions' in (row ?? {})),
      error ? error.code : JSON.stringify(row))
  }
  {
    const { error } = await A.cli.rpc('join_family', {
      p_join_code: B.joinCode, p_member_name: 'Intruso', p_monthly_income: 0,
    })
    check('A (ja em familia) NAO entra na familia de B', !!error, error?.code ?? 'ENTROU!')
  }

  console.log('\n--- 8. Transferencia nao cruza familia ---')
  {
    const { error } = await A.cli.from('transactions').insert({
      family_id: A.familyId, account_id: A.accountId,
      to_account_id: B.accountId,          // destino em outra familia
      created_by_member_id: A.memberId, paid_by_member_id: A.memberId,
      type: 'transferencia', description: 'Fuga', amount: 50, date: '2026-10-06',
    })
    check('A NAO transfere para conta de B', !!error, error?.code ?? 'INSERIU!')
  }

  console.log(`\n=== ${checks - failures}/${checks} verificacoes passaram ===`)
}

async function cleanup() {
  for (const uid of created) {
    await admin.auth.admin.deleteUser(uid).catch(() => {})
  }
  console.log(`limpeza: ${created.length} usuario(s) de teste removido(s)`)
}

try {
  await run()
} catch (e) {
  failures++
  console.error('\nERRO FATAL:', e.message)
} finally {
  await cleanup()
}
process.exit(failures > 0 ? 1 : 0)
