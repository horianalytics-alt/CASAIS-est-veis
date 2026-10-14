// Prova de conceito do achado do security-guidance:
// a policy family_members_update_self so verifica user_id = auth.uid(),
// sem fixar family_id. Um membro consegue trocar o proprio family_id e
// entrar na familia de outra pessoa?
import { createClient } from '@supabase/supabase-js'
import { limparTeste } from './limpeza-utils.mjs'

const URL = 'https://wxhfgstgjjlmqauogeid.supabase.co'
const ANON = process.env.ANON_KEY
const SERVICE = process.env.SERVICE_KEY
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } })

const stamp = Date.now()
const created = []
const createdFamilies = []
let failures = 0
let checks = 0

// Portado de rls-isolation.mjs. Antes deste check() o arquivo usava console.log
// solto: um caso novo podia FALHAR e o processo ainda sair 0.
function check(name, passed, detail = '') {
  checks++
  if (passed) {
    console.log(`  PASS  ${name}${detail ? ' — ' + detail : ''}`)
  } else {
    failures++
    console.log(`  FALHA ${name}${detail ? ' — ' + detail : ''}`)
  }
}

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
  createdFamilies.push(row.family_id)
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

  // =========================================================================
  // Casos da migration 00006. Os dois ataques acima ja eram bloqueados ANTES
  // da 00006, mas por acidente (policy de SELECT + RETURNING do PostgREST).
  // Os casos abaixo provam que agora o bloqueio e EXPLICITO, e provam que o
  // caminho legitimo do produto nao quebrou com a defesa nova.
  // =========================================================================

  console.log('\n--- T1-ERRCODE: o bloqueio vem do trigger, com mensagem clara ---')
  {
    const { error: tErr } = await A.cli
      .from('family_members')
      .update({ family_id: B.familyId })
      .eq('id', A.memberId)
      .select('id')

    // Antes de 00006: 42501 (RLS, bloqueio acidental).
    // Depois de 00006: 23514 com 'Não é permitido mudar a família de um membro'.
    const bloqueioExplicito =
      !!tErr && (tErr.code === '23514' || /mudar a famíli/i.test(tErr.message ?? ''))
    check('T1-ERRCODE bloqueio explicito do trigger',
      bloqueioExplicito,
      tErr ? `${tErr.code}: ${tErr.message}` : 'NAO BLOQUEOU')
  }

  console.log('\n--- T1-OK: o membro ainda edita o proprio perfil ---')
  {
    const { data: okUpd, error: okErr } = await A.cli
      .from('family_members')
      .update({ display_name: 'Alice Editada', monthly_income: 6100 })
      .eq('id', A.memberId)
      .select('display_name,monthly_income')
    check('T1-OK edita proprio perfil',
      !okErr && okUpd?.[0]?.display_name === 'Alice Editada',
      okErr ? `${okErr.code}: ${okErr.message}` : JSON.stringify(okUpd))
  }

  console.log('\n--- T1-NOOP: PATCH que reenvia o MESMO family_id deve passar ---')
  {
    const { error: noopErr } = await A.cli
      .from('family_members')
      .update({ family_id: A.familyId, display_name: 'Alice' })
      .eq('id', A.memberId)
      .select('id')
    check('T1-NOOP family_id igual ao proprio passa',
      !noopErr, noopErr ? `${noopErr.code}: ${noopErr.message}` : 'ok')
  }

  console.log('\n--- T1-AVATAR: avatar_url continua editavel (decisao de produto) ---')
  {
    const { data: avUpd, error: avErr } = await A.cli
      .from('family_members')
      .update({ avatar_url: 'https://exemplo.test/a.png' })
      .eq('id', A.memberId)
      .select('avatar_url')
    check('T1-AVATAR membro edita o proprio avatar_url',
      !avErr && avUpd?.[0]?.avatar_url === 'https://exemplo.test/a.png',
      avErr ? `${avErr.code}: ${avErr.message}` : JSON.stringify(avUpd))
  }

  console.log('\n--- T1-JOINED: joined_at e congelado pelo trigger ---')
  {
    const { error: jErr } = await A.cli
      .from('family_members')
      .update({ joined_at: '2020-01-01T00:00:00Z' })
      .eq('id', A.memberId)
      .select('id')
    check('T1-JOINED troca de joined_at bloqueada',
      !!jErr && (jErr.code === '23514' || /data de entrada/i.test(jErr.message ?? '')),
      jErr ? `${jErr.code}: ${jErr.message}` : 'NAO BLOQUEOU')
  }

  console.log('\n--- T2-ORACULO: A nao descobre a familia de B pela funcao helper ---')
  {
    const { data: orc, error: orcErr } = await A.cli
      .rpc('get_user_family_id', { uid: B.uid })
    // Fechado = erro de permissao, ou nao devolveu o family_id de B.
    const oraculoFechado = !!orcErr || orc !== B.familyId
    check('T2-ORACULO get_user_family_id(uid de terceiro) negada',
      oraculoFechado,
      orcErr ? `${orcErr.code}: ${orcErr.message}` : `retornou ${JSON.stringify(orc)}`)
  }

  console.log('\n--- T2-SELF: a versao _self() responde sobre MIM, corretamente ---')
  {
    const { data: selfFam, error: selfErr } = await A.cli.rpc('get_user_family_id_self')
    check('T2-SELF get_user_family_id_self responde a propria familia',
      !selfErr && selfFam === A.familyId,
      selfErr ? `${selfErr.code}: ${selfErr.message}` : `${selfFam}`)
  }

  console.log('\n--- T2-SELF-TERCEIRO: _self() nao aceita parametro de terceiro ---')
  {
    // Mesmo quem tentar passar uid na chamada nao consegue perguntar sobre outro:
    // a funcao nao tem parametro, entao o PostgREST rejeita a assinatura.
    const { data: bad, error: badErr } = await A.cli
      .rpc('get_user_family_id_self', { uid: B.uid })
    check('T2-SELF-TERCEIRO _self com uid de terceiro nao responde sobre B',
      !!badErr || bad !== B.familyId,
      badErr ? `${badErr.code}: ${badErr.message}` : `retornou ${JSON.stringify(bad)}`)
  }

  console.log(`\n=== ${checks - failures}/${checks} verificacoes passaram ===`)
  console.log(`=== ${failures === 0 ? 'NAO EXPLORAVEL' : 'EXPLORAVEL — ' + failures + ' falha(s)'} ===`)
} catch (e) {
  console.error('ERRO:', e.message)
  failures++
} finally {
  // Antes: deleteUser(...).catch(() => {}) e nada mais. Apagar o usuário NÃO
  // apaga a família (só o membro, por cascata), e o lançamento de B
  // (created_by RESTRICT) travava a exclusão do usuário em silêncio — sobravam
  // "Casa A", "Casa B" e o usuário de B a cada execução. Agora a limpeza
  // compartilhada apaga lançamentos -> famílias -> usuários e conta o que saiu.
  const erros = await limparTeste(admin, createdFamilies, created)
  if (erros.length > 0) failures++
}
process.exit(failures > 0 ? 1 : 0)
