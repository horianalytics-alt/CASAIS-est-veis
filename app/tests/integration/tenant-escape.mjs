// Prova de conceito do achado do security-guidance:
// a policy family_members_update_self so verifica user_id = auth.uid(),
// sem fixar family_id. Um membro consegue trocar o proprio family_id e
// entrar na familia de outra pessoa?
import { createClient } from '@supabase/supabase-js'

const URL = 'https://wxhfgstgjjlmqauogeid.supabase.co'
const ANON = process.env.ANON_KEY
const SERVICE = process.env.SERVICE_KEY
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } })

const stamp = Date.now()
const created = []
let failures = 0

async function mk(label, familyName, memberName) {
  const email = `escape-${label}-${stamp}@example.com`
  const pass = 'Senha!Forte123'
  const { data, error } = await admin.auth.admin.createUser({
    email, password: pass, email_confirm: true,
  })
  if (error) throw new Error(`createUser ${label}: ${error.message}`)
  created.push(data.user.id)

  const cli = createClient(URL, ANON, { auth: { persistSession: false } })
  const { error: sErr } = await cli.auth.signInWithPassword({ email, password: pass })
  if (sErr) throw new Error(`signIn ${label}: ${sErr.message}`)

  const { data: fam, error: fErr } = await cli.rpc('create_family', {
    p_family_name: familyName, p_split_rule: 'equal',
    p_member_name: memberName, p_monthly_income: 5000,
  })
  if (fErr) throw new Error(`create_family ${label}: ${fErr.message}`)
  const row = Array.isArray(fam) ? fam[0] : fam
  return { cli, familyId: row.family_id, memberId: row.member_id, uid: data.user.id }
}

try {
  const A = await mk('a', 'Casa A', 'Alice')
  const B = await mk('b', 'Casa B', 'Bruno')

  // B tem um lancamento secreto.
  const { data: acc } = await B.cli.from('accounts').select('id').eq('family_id', B.familyId).limit(1)
  const { data: cat } = await B.cli.from('categories').select('id').eq('family_id', B.familyId).limit(1)
  await B.cli.from('transactions').insert({
    family_id: B.familyId, account_id: acc[0].id, category_id: cat[0].id,
    created_by_member_id: B.memberId, paid_by_member_id: B.memberId,
    type: 'despesa', description: 'SEGREDO DE B', amount: 999.99,
    date: '2026-10-05', is_paid: true, paid_date: '2026-10-05',
  })

  console.log('\n--- ATAQUE: A troca o proprio family_id para o de B ---')
  const { data: upd, error: uErr } = await A.cli
    .from('family_members')
    .update({ family_id: B.familyId })
    .eq('id', A.memberId)
    .select('id,family_id')

  if (uErr) {
    console.log(`  BLOQUEADO — ${uErr.code}: ${uErr.message}`)
  } else if ((upd ?? []).length === 0) {
    console.log('  BLOQUEADO — 0 linhas alteradas')
  } else {
    console.log(`  ESCAPOU! family_id virou ${upd[0].family_id}`)
    failures++
  }

  // Independente do resultado acima: A consegue ler o segredo de B agora?
  const { data: leak } = await A.cli.from('transactions').select('description,amount')
  const sawSecret = (leak ?? []).some((r) => r.description === 'SEGREDO DE B')
  if (sawSecret) {
    console.log(`  VAZOU — A leu: ${JSON.stringify(leak)}`)
    failures++
  } else {
    console.log(`  A continua sem ver o segredo de B (viu ${(leak ?? []).length} linha(s))`)
  }

  console.log('\n--- ATAQUE 2: A troca o proprio user_id para o de B ---')
  const { data: u2, error: u2Err } = await A.cli
    .from('family_members')
    .update({ user_id: B.uid })
    .eq('id', A.memberId)
    .select('id')
  if (u2Err) console.log(`  BLOQUEADO — ${u2Err.code}`)
  else if ((u2 ?? []).length === 0) console.log('  BLOQUEADO — 0 linhas')
  else { console.log('  ESCAPOU! user_id trocado'); failures++ }

  console.log(`\n=== ${failures === 0 ? 'NAO EXPLORAVEL' : 'EXPLORAVEL — ' + failures + ' falha(s)'} ===`)
} catch (e) {
  console.error('ERRO:', e.message)
  failures++
} finally {
  for (const uid of created) await admin.auth.admin.deleteUser(uid).catch(() => {})
  console.log(`limpeza: ${created.length} usuario(s) removido(s)`)
}
process.exit(failures > 0 ? 1 : 0)
