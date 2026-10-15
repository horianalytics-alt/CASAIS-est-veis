// Teste da migration 00010: o acerto registrado por settle_up tem de ABATER a
// dívida em v_settlement. Antes da 00010 a view ignorava toda transferência,
// então o saldo nunca mudava depois de acertar e o usuário acertava de novo
// (bug real: 3 acertos de 546,47 na família do Heitor em 13/10).
//
// Roda contra o projeto HOSPEDADO (não existe Supabase local neste projeto),
// numa família descartável criada aqui e APAGADA no finally — mesmo se o teste
// quebrar no meio. Nunca toca na família real.
//
// Uso, de dentro de app/ (o import de @supabase/supabase-js só resolve aqui):
//   set -a && . ./.env.local && set +a
//   node tests/integration/acerto-liquido.mjs
import { createClient } from '@supabase/supabase-js'
import { limparTeste } from './limpeza-utils.mjs'

const URL = 'https://wxhfgstgjjlmqauogeid.supabase.co'
const ANON = process.env.ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE = process.env.SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
// A família real nunca pode aparecer entre as criadas/apagadas por este teste.
const FAMILIA_REAL = '9969d589-1645-403f-912a-1504bfeebb89'

if (!ANON || !SERVICE) {
  console.error('Faltam NEXT_PUBLIC_SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY no ambiente.')
  process.exit(1)
}

// service_role SÓ para criar usuários de teste e para a limpeza. Toda operação
// testada roda com a sessão do usuário (RLS ligado), como no app.
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } })
const stamp = Date.now()

let failures = 0
let checks = 0
const createdUsers = []
const createdFamilies = []

function check(name, passed, detail = '') {
  checks++
  if (passed) console.log(`  PASS  ${name}${detail ? ' — ' + detail : ''}`)
  else {
    failures++
    console.log(`  FALHA ${name}${detail ? ' — ' + detail : ''}`)
  }
}

const perto = (a, b) => Math.abs(Number(a) - Number(b)) < 0.005

async function novoUsuario(tag) {
  const email = `acerto-${tag}-${stamp}@example.com`
  const pass = 'Senha!Forte123'
  const { data, error } = await admin.auth.admin.createUser({ email, password: pass, email_confirm: true })
  if (error) throw new Error(`createUser ${tag}: ${error.message}`)
  createdUsers.push(data.user.id)
  const cli = createClient(URL, ANON, { auth: { persistSession: false } })
  const { error: sErr } = await cli.auth.signInWithPassword({ email, password: pass })
  if (sErr) throw new Error(`signIn ${tag}: ${sErr.message}`)
  return { tag, uid: data.user.id, cli }
}

async function criarCasa(u, nome) {
  const { data, error } = await u.cli.rpc('create_family', {
    p_family_name: nome, p_split_rule: 'equal', p_member_name: `Membro ${u.tag}`, p_monthly_income: 3000,
  })
  if (error) throw new Error(`create_family ${u.tag}: ${error.message}`)
  const row = Array.isArray(data) ? data[0] : data
  if (row.family_id === FAMILIA_REAL) throw new Error('create_family devolveu a família real — abortando')
  createdFamilies.push(row.family_id)
  Object.assign(u, { familyId: row.family_id, memberId: row.member_id, joinCode: row.join_code })
  return u
}

async function entrarNaCasa(u, joinCode) {
  const { data, error } = await u.cli.rpc('join_family', {
    p_join_code: joinCode, p_member_name: `Membro ${u.tag}`, p_monthly_income: 3000,
  })
  if (error) throw new Error(`join_family ${u.tag}: ${error.message}`)
  const row = Array.isArray(data) ? data[0] : data
  if (!row) throw new Error(`join_family ${u.tag}: nenhuma linha`)
  Object.assign(u, { familyId: row.family_id, memberId: row.member_id })
  return u
}

async function contaCorrente(u) {
  const { data, error } = await u.cli.from('accounts').select('id')
    .eq('owner_member_id', u.memberId).eq('type', 'corrente').single()
  if (error) throw new Error(`conta de ${u.tag}: ${error.message}`)
  return data.id
}

async function lancar(u, itens) {
  const { data, error } = await u.cli.rpc('save_transactions', { p_items: itens })
  return { data, error }
}

async function saldos(u) {
  const { data, error } = await u.cli.from('v_settlement').select('*')
  if (error) throw new Error(`v_settlement ${u.tag}: ${error.message}`)
  return new Map((data ?? []).map((r) => [r.member_id, r]))
}

const HOJE = '2026-10-05'

async function run() {
  const a = await criarCasa(await novoUsuario('a'), `Casa Acerto ${stamp}`)
  const b = await entrarNaCasa(await novoUsuario('b'), a.joinCode)
  const c = await criarCasa(await novoUsuario('c'), `Casa Intrusa ${stamp}`)
  const contaA = await contaCorrente(a)
  const contaB = await contaCorrente(b)

  // ==========================================================================
  console.log('\n--- S1: gasto compartilhado desequilibrado gera dívida ---')
  // ==========================================================================
  // A paga 1000, B paga 200, divisão igual: cada um devia 600.
  // A tem +400 a receber, B deve -400.
  {
    const r1 = await lancar(a, [{ type: 'despesa', description: 'Mercado do mês', amount: 1000, date: HOJE,
      account_id: contaA, is_paid: true, paid_date: HOJE }])
    const r2 = await lancar(b, [{ type: 'despesa', description: 'Farmácia', amount: 200, date: HOJE,
      account_id: contaB, is_paid: true, paid_date: HOJE }])
    check('S1 lançamentos gravados', !r1.error && !r2.error, r1.error?.message ?? r2.error?.message ?? '')
    const s = await saldos(a)
    check('S1 saldo de A = +400', perto(s.get(a.memberId)?.balance, 400), `balance=${s.get(a.memberId)?.balance}`)
    check('S1 saldo de B = -400', perto(s.get(b.memberId)?.balance, -400), `balance=${s.get(b.memberId)?.balance}`)
  }

  // ==========================================================================
  console.log('\n--- S2: acerto PARCIAL abate na direção certa ---')
  // ==========================================================================
  // B paga 150 a A. Quem pagou o acerto (B) deve menos; quem recebeu (A) tem
  // menos a receber. Testa o SINAL separado do caso que zera tudo.
  let acertoParcialId
  {
    const { data, error } = await b.cli.rpc('settle_up', {
      p_from_member_id: b.memberId, p_to_member_id: a.memberId, p_amount: 150, p_date: HOJE,
    })
    acertoParcialId = data
    check('S2 settle_up(B -> A, 150) aceito', !error && typeof data === 'string', error?.message ?? '')

    const { data: tx, error: txErr } = await b.cli.from('transactions').select('*').eq('id', data).single()
    check('S2 o acerto grava o DESTINATÁRIO explícito (settlement_to_member_id = A)',
      !txErr && tx?.settlement_to_member_id === a.memberId,
      txErr ? txErr.message : `settlement_to_member_id=${tx?.settlement_to_member_id}`)

    const s = await saldos(a)
    check('S2 saldo de A = +250 depois de receber 150', perto(s.get(a.memberId)?.balance, 250),
      `balance=${s.get(a.memberId)?.balance}`)
    check('S2 saldo de B = -250 depois de pagar 150', perto(s.get(b.memberId)?.balance, -250),
      `balance=${s.get(b.memberId)?.balance}`)
  }

  // ==========================================================================
  console.log('\n--- S3: acerto do valor exato ZERA os dois saldos ---')
  // ==========================================================================
  {
    const { error } = await b.cli.rpc('settle_up', {
      p_from_member_id: b.memberId, p_to_member_id: a.memberId, p_amount: 250, p_date: HOJE,
    })
    check('S3 settle_up(B -> A, 250) aceito', !error, error?.message ?? '')
    const s = await saldos(a)
    const sa = s.get(a.memberId), sb = s.get(b.memberId)
    check('S3 saldo de A = 0', perto(sa?.balance, 0), `balance=${sa?.balance}`)
    check('S3 saldo de B = 0', perto(sb?.balance, 0), `balance=${sb?.balance}`)
    check('S3 total_paid e total_owed NÃO mudam com o acerto (só despesas)',
      perto(sa?.total_paid, 1000) && perto(sa?.total_owed, 600) && perto(sb?.total_paid, 200) && perto(sb?.total_owed, 600),
      `A pago=${sa?.total_paid} cota=${sa?.total_owed} | B pago=${sb?.total_paid} cota=${sb?.total_owed}`)
    check('S3 total_settled_sent de B = 400 e total_settled_received de A = 400',
      perto(sb?.total_settled_sent, 400) && perto(sa?.total_settled_received, 400)
        && perto(sa?.total_settled_sent, 0) && perto(sb?.total_settled_received, 0),
      `B enviou=${sb?.total_settled_sent} A recebeu=${sa?.total_settled_received}`)
  }

  // ==========================================================================
  console.log('\n--- S4: transferência MANUAL não é acerto, mesmo com o mesmo nome ---')
  // ==========================================================================
  // O /lancar aceita transferência com qualquer descrição. Se o critério fosse o
  // texto, isto viraria acerto e criaria dívida do nada.
  {
    const { data, error } = await lancar(a, [{ type: 'transferencia', description: 'Acerto de contas',
      amount: 300, date: HOJE, account_id: contaA, to_account_id: contaB, is_paid: true, paid_date: HOJE }])
    check('S4 transferência manual gravada', !error, error?.message ?? '')
    const row = Array.isArray(data) ? data[0] : data
    check('S4 transferência manual NÃO tem destinatário de acerto', row && row.settlement_to_member_id == null,
      `settlement_to_member_id=${row?.settlement_to_member_id}`)
    const s = await saldos(a)
    check('S4 saldos continuam 0 / 0', perto(s.get(a.memberId)?.balance, 0) && perto(s.get(b.memberId)?.balance, 0),
      `A=${s.get(a.memberId)?.balance} B=${s.get(b.memberId)?.balance}`)
  }

  // ==========================================================================
  console.log('\n--- S5: pagar fatura NÃO conta em dobro ---')
  // ==========================================================================
  // Compra compartilhada de 100 no cartão, paga por A via pay_invoice. Só a
  // compra entra no acerto (+50 / -50); a transferência "Pagamento de fatura" não.
  {
    const { data: cartao, error: cErr } = await a.cli.from('accounts').insert({
      family_id: a.familyId, name: 'Cartão teste', type: 'cartao', closing_day: 10, due_day: 20,
    }).select('id').single()
    check('S5 cartão criado', !cErr, cErr?.message ?? '')
    const { error: lErr } = await lancar(a, [{ type: 'despesa', description: 'Restaurante', amount: 100,
      date: HOJE, account_id: cartao.id, is_paid: false }])
    check('S5 compra no cartão gravada', !lErr, lErr?.message ?? '')
    const { error: pErr } = await a.cli.rpc('pay_invoice', {
      p_card_account_id: cartao.id, p_from_account_id: contaA, p_invoice_year: 2026, p_invoice_month: 10, p_date: HOJE,
    })
    check('S5 pay_invoice aceito', !pErr, pErr?.message ?? '')
    const s = await saldos(a)
    check('S5 saldo de A = +50 e de B = -50 (só a compra conta)',
      perto(s.get(a.memberId)?.balance, 50) && perto(s.get(b.memberId)?.balance, -50),
      `A=${s.get(a.memberId)?.balance} B=${s.get(b.memberId)?.balance}`)
  }

  // ==========================================================================
  console.log('\n--- S6: isolamento — outra família não lê nem forja acerto ---')
  // ==========================================================================
  {
    const { data: vista } = await c.cli.from('v_settlement').select('family_id,member_id')
    const fams = new Set((vista ?? []).map((r) => r.family_id))
    check('S6 v_settlement de C não mostra a família de A', !fams.has(a.familyId) && fams.size <= 1,
      `famílias vistas por C: ${fams.size}`)

    const { count: antesC } = await admin.from('transactions').select('*', { count: 'exact', head: true })
      .eq('family_id', a.familyId)
    const { error: forja } = await c.cli.rpc('settle_up', {
      p_from_member_id: b.memberId, p_to_member_id: a.memberId, p_amount: 10, p_date: HOJE,
    })
    const { count: depoisC } = await admin.from('transactions').select('*', { count: 'exact', head: true })
      .eq('family_id', a.familyId)
    check('S6 C não registra acerto entre membros de outra família',
      !!forja && antesC === depoisC, forja ? `${forja.code}: ${forja.message}` : 'ACEITOU!')

    // B tenta apontar o destinatário de um acerto para um membro de OUTRA casa.
    // Desde a 00015 a 1ª barreira para a sessão do usuário é o trigger
    // tx_acerto_so_por_settle_up (42501): acerto não se edita por REST.
    const { data: upd, error: updErr } = await b.cli.from('transactions')
      .update({ settlement_to_member_id: c.memberId }).eq('id', acertoParcialId).select('id')
    check('S6 sessão de B não reaponta o destinatário de um acerto (trigger 00015)',
      updErr?.code === '42501' && (upd ?? []).length === 0, updErr ? `${updErr.code}: ${updErr.message}` : 'GRAVOU!')

    // As constraints continuam sendo a 2ª camada. Para exercitá-las sem o
    // trigger na frente, a sonda vai como service_role (que o trigger libera).
    const { error: fkErr } = await admin.from('transactions')
      .update({ settlement_to_member_id: c.memberId }).eq('id', acertoParcialId).select('id')
    check('S6 destinatário de acerto não aponta para membro de outra família (FK composta, via service_role)',
      fkErr?.code === '23503', fkErr ? `${fkErr.code}: ${fkErr.message}` : 'GRAVOU!')

    // E não dá para marcar uma DESPESA como acerto.
    const { data: desp } = await a.cli.from('transactions').select('id').eq('type', 'despesa').order('id').limit(1).single()
    const { error: trgErr } = await a.cli.from('transactions')
      .update({ settlement_to_member_id: b.memberId }).eq('id', desp.id).select('id')
    check('S6 sessão de A não marca despesa como acerto (trigger 00015)', trgErr?.code === '42501',
      trgErr ? `${trgErr.code}: ${trgErr.message}` : 'GRAVOU!')
    const { error: chkErr } = await admin.from('transactions')
      .update({ settlement_to_member_id: b.memberId }).eq('id', desp.id).select('id')
    check('S6 CHECK impede destinatário de acerto em despesa (via service_role)', chkErr?.code === '23514',
      chkErr ? `${chkErr.code}: ${chkErr.message}` : 'GRAVOU!')
  }

  // ==========================================================================
  console.log('\n--- L: sondagem do fluxo de lançamento (parcela, arquivados) ---')
  // ==========================================================================
  // Investigação do "lançamento não carrega": a RPC trava ou falha nesses casos?
  {
    const { data: cartao } = await a.cli.from('accounts').select('id').eq('type', 'cartao').single()
    let t0 = Date.now()
    const p = await lancar(a, [{ type: 'despesa', description: 'Fone parcelado', amount: 159.91, date: HOJE,
      account_id: cartao.id, is_paid: false, recurrence_months: 3 }])
    check('L1 parcelado 3x no cartão grava 3 parcelas', !p.error && (p.data ?? []).length === 3,
      p.error ? p.error.message : `${(p.data ?? []).length} linhas em ${Date.now() - t0} ms`)

    const { data: cat } = await a.cli.from('categories').select('id').eq('type', 'despesa').limit(1).single()
    await a.cli.from('categories').update({ archived_at: new Date().toISOString() }).eq('id', cat.id)
    t0 = Date.now()
    const q = await lancar(a, [{ type: 'despesa', description: 'Com categoria arquivada', amount: 10, date: HOJE,
      account_id: contaA, category_id: cat.id, is_paid: true, paid_date: HOJE }])
    check('L2 categoria arquivada não trava a RPC', !q.error, q.error ? q.error.message : `${Date.now() - t0} ms`)

    const { data: arq } = await a.cli.from('accounts').insert({
      family_id: a.familyId, name: 'Conta arquivada', type: 'corrente', archived_at: new Date().toISOString(),
    }).select('id').single()
    t0 = Date.now()
    const r = await lancar(a, [{ type: 'despesa', description: 'Em conta arquivada', amount: 10, date: HOJE,
      account_id: arq.id, is_paid: true, paid_date: HOJE }])
    check('L3 conta arquivada não trava a RPC', !r.error, r.error ? r.error.message : `${Date.now() - t0} ms`)
  }
}

async function contagemGlobal() {
  const { count: familias } = await admin.from('families').select('*', { count: 'exact', head: true })
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error) throw new Error(`listUsers: ${error.message}`)
  return { familias, usuarios: data.users.length }
}

let estadoAntes = null
try {
  estadoAntes = await contagemGlobal()
  console.log(`estado global antes: ${estadoAntes.familias} família(s), ${estadoAntes.usuarios} usuário(s)`)
  await run()
  console.log(`\n=== ${checks - failures}/${checks} verificações passaram ===`)
} catch (e) {
  failures++
  console.error('\nERRO FATAL:', e.message)
} finally {
  if (createdFamilies.includes(FAMILIA_REAL)) {
    console.error('ABORTANDO LIMPEZA: a família real apareceu na lista de criadas.')
    failures++
  } else {
    const erros = await limparTeste(admin, createdFamilies, createdUsers)
    if (erros.length > 0) failures++
    if (estadoAntes) {
      const depois = await contagemGlobal()
      const limpo = depois.familias === estadoAntes.familias && depois.usuarios === estadoAntes.usuarios
      console.log(`estado global depois da limpeza: ${depois.familias} família(s), ${depois.usuarios} usuário(s) — ` +
        (limpo ? 'IGUAL ao de antes' : 'DIFERENTE do de antes'))
      if (!limpo) failures++
    }
  }
}
process.exit(failures > 0 ? 1 : 0)
