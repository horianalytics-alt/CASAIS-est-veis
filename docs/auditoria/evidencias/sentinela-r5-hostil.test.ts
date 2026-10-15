// Sentinela — auditoria R5 — testes hostis INDEPENDENTES contra o banco hospedado.
//
// Famílias DESCARTÁVEIS: "Sentinela R5 A" (A1 dono + A2 entrou por join_family) e
// "Sentinela R5 B" (B1). E-mails sentinela-r5-*@example.com. Nunca toca a família real
// (9969d589-...), exceto para TENTAR (e confirmar que falha) gravar nela.
//
// O que é REAL: Zod, getUser, resolução de família pela sessão, RLS, FKs, RPCs, e o
// servico.ts (service_role) lendo push_subscriptions de verdade.
// O que é trocado: createClient do servidor -> cliente supabase-js logado como o
// usuário do teste; after() -> fila controlada; web-push -> gravador (nenhum POST
// sai para FCM ou para host hostil); next/cache -> no-op; server-only -> vazio.
//
// Limpeza no afterAll, com contagem real do que saiu. Cada teste imprime 'OBS ...'.
import { createECDH, randomBytes } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const estado = vi.hoisted(() => ({ cliente: null as unknown }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => estado.cliente }))

import { pagarFatura } from '@/actions/fatura'
import { registrarAcerto } from '@/actions/acerto'
import { atualizarLancamento, atualizarLancamentosEmMassa } from '@/actions/editar-lancamento'
import { excluirLancamento, salvarLancamento } from '@/actions/lancamento'
import { definirOrcamento, excluirOrcamento } from '@/actions/orcamentos'
import { adicionarGrupo, atribuirGrupoCategoria, excluirGrupo, renomearGrupo } from '@/actions/grupos-categoria'
import { removerInscricaoPush, salvarInscricaoPush } from '@/actions/push'
import { pedirRecuperacaoDeSenha } from '@/actions/auth'

const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const REAL_FAMILY = '9969d589-1645-403f-912a-1504bfeebb89'
const stamp = Date.now()
import { appendFileSync } from 'node:fs'
const SAIDA = process.env.R5_SAIDA || 'C:/dev/financas-a-dois/docs/auditoria/evidencias/sentinela-r5-hostil.obs.txt'
const obs = (k: string, v: unknown) => {
  const l = 'OBS ' + k + ' => ' + JSON.stringify(v)
  appendFileSync(SAIDA, l + '\n')
  console.log(l)
}

// ---- ganchos dos stubs ----
type Envio = { endpoint: string; corpo: string }
const fila: Array<() => unknown> = []
const enviados: Envio[] = []
const statusPorEndpoint = new Map<string, number>()
const g = globalThis as Record<string, unknown>
g.__r5After = (cb: () => unknown) => void fila.push(cb)
g.__r5Push = async (sub: { endpoint: string }, corpo: string) => {
  enviados.push({ endpoint: sub.endpoint, corpo })
  const st = statusPorEndpoint.get(sub.endpoint) ?? 201
  if (st >= 300) throw Object.assign(new Error(`push recusado ${st}`), { statusCode: st, body: `{"error":"falha ${st}"}` })
  return { statusCode: st, body: '', headers: {} }
}
async function drenarFila() {
  const cbs = fila.splice(0)
  for (const cb of cbs) await cb()
  return cbs.length
}
// VAPID FALSO só para o caminho de envio rodar (web-push está stubado).
process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'BFakeVapidPublicKeySentinelaR5'
process.env.VAPID_PRIVATE_KEY = 'SEGREDO-VAPID-PRIVADO-SENTINELA-R5'

type U = { tag: string; uid: string; email: string; cli: SupabaseClient; familyId: string; memberId: string; contaId: string }
let admin: SupabaseClient
const criados = { usuarios: [] as string[], familias: [] as string[] }
let A1: U, A2: U, B1: U
let cartaoA: string, cartaoB: string
let joinCodeA = ''
const ids: Record<string, string> = {}

async function novoUsuario(tag: string) {
  const email = `sentinela-r5-${tag}-${stamp}@example.com`
  const pass = 'Sentinela!R5-' + stamp
  const { data: u, error } = await admin.auth.admin.createUser({ email, password: pass, email_confirm: true })
  if (error || !u.user) throw new Error(`createUser ${tag}: ${error?.message}`)
  criados.usuarios.push(u.user.id)
  const cli = createClient(URL_SB, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error: sErr } = await cli.auth.signInWithPassword({ email, password: pass })
  if (sErr) throw new Error(`signIn ${tag}: ${sErr.message}`)
  return { uid: u.user.id, email, cli }
}
async function contaCorrente(cli: SupabaseClient, familyId: string, memberId: string) {
  const { data } = await cli.from('accounts').select('id').eq('family_id', familyId).eq('owner_member_id', memberId).eq('type', 'corrente').limit(1)
  return data![0].id as string
}
async function novaCasa(tag: string): Promise<U> {
  const u = await novoUsuario(tag)
  const { data: fam, error } = await u.cli.rpc('create_family', {
    p_family_name: `Sentinela R5 ${tag.toUpperCase()}`, p_split_rule: 'equal', p_member_name: `Sentinela ${tag}`, p_monthly_income: 1000,
  })
  if (error || !fam?.[0]) throw new Error(`create_family ${tag}: ${error?.message}`)
  criados.familias.push(fam[0].family_id)
  if (tag === 'a1') joinCodeA = fam[0].join_code
  return { tag, ...u, familyId: fam[0].family_id, memberId: fam[0].member_id, contaId: await contaCorrente(u.cli, fam[0].family_id, fam[0].member_id) }
}
async function entrarNaCasa(tag: string, code: string): Promise<U> {
  const u = await novoUsuario(tag)
  const { data, error } = await u.cli.rpc('join_family', { p_join_code: code, p_member_name: `Sentinela ${tag}`, p_monthly_income: 1000 })
  if (error || !data?.[0]) throw new Error(`join_family ${tag}: ${error?.message}`)
  return { tag, ...u, familyId: data[0].family_id, memberId: data[0].member_id, contaId: await contaCorrente(u.cli, data[0].family_id, data[0].member_id) }
}
const como = (u: U | null) => { estado.cliente = u ? u.cli : createClient(URL_SB, ANON, { auth: { persistSession: false } }) }
async function cartao(u: U, nome: string) {
  const { data, error } = await u.cli.from('accounts').insert({ family_id: u.familyId, owner_member_id: u.memberId, name: nome, type: 'cartao', initial_balance: 0, closing_day: 5, due_day: 12, sort_order: 9 }).select('id').single()
  if (error) throw new Error(`cartão ${nome}: ${error.message}`)
  return data.id as string
}
async function lancar(u: U, item: Record<string, unknown>) {
  como(u)
  const r = await salvarLancamento(item as never)
  if (!r.ok) throw new Error(`lancar ${u.tag}: ${JSON.stringify(r)}`)
  return r.dados as Array<{ id: string; recurrence_parent_id: string | null; invoice_year: number | null; invoice_month: number | null }>
}
const linha = async (id: string) => (await admin.from('transactions').select('*').eq('id', id).maybeSingle()).data
function chavesPush() {
  const ecdh = createECDH('prime256v1')
  ecdh.generateKeys()
  return { p256dh: ecdh.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') }
}

beforeAll(async () => {
  admin = createClient(URL_SB, SERVICE, { auth: { persistSession: false } })
  A1 = await novaCasa('a1')
  A2 = await entrarNaCasa('a2', joinCodeA)
  B1 = await novaCasa('b1')
  cartaoA = await cartao(A1, 'Cartão A')
  cartaoB = await cartao(B1, 'Cartão B')
  const catA = (await A1.cli.from('categories').select('id').eq('family_id', A1.familyId).eq('type', 'despesa').limit(1)).data![0].id
  const catB = (await B1.cli.from('categories').select('id').eq('family_id', B1.familyId).eq('type', 'despesa').limit(1)).data![0].id
  ids.catA = catA
  ids.catB = catB
  ids.txA = (await lancar(A1, { tipo: 'despesa', descricao: 'Mercado A', valor: 100, data: '2026-10-10', contaId: A1.contaId, categoriaId: catA, estaPago: true, dataDoPagamento: '2026-10-10' }))[0].id
  ids.txA2 = (await lancar(A2, { tipo: 'despesa', descricao: 'Farmácia A2', valor: 40, data: '2026-10-11', contaId: A2.contaId, categoriaId: catA, estaPago: true, dataDoPagamento: '2026-10-11' }))[0].id
  const compraA = (await lancar(A1, { tipo: 'despesa', descricao: 'Compra cartão A', valor: 80, data: '2026-10-03', contaId: cartaoA, categoriaId: catA }))[0]
  ids.compraA = compraA.id
  ids.faturaA = JSON.stringify([compraA.invoice_year, compraA.invoice_month])
  ids.txB = (await lancar(B1, { tipo: 'despesa', descricao: 'Mercado B', valor: 50, data: '2026-10-10', contaId: B1.contaId, categoriaId: catB, estaPago: true, dataDoPagamento: '2026-10-10' }))[0].id
  const compraB = (await lancar(B1, { tipo: 'despesa', descricao: 'Compra cartão B', valor: 70, data: '2026-10-03', contaId: cartaoB, categoriaId: catB }))[0]
  ids.compraB = compraB.id
  ids.faturaB = JSON.stringify([compraB.invoice_year, compraB.invoice_month])
  const grupoB = await B1.cli.from('category_groups').insert({ family_id: B1.familyId, name: 'Grupo B', sort_order: 1 }).select('id').single()
  ids.grupoB = grupoB.data!.id
  fila.splice(0)
  obs('setup', { A1: A1.familyId, A2fam: A2.familyId, B1: B1.familyId, ids })
})

afterAll(async () => {
  // Limpeza: lançamentos -> famílias (cascade: membros, contas, categorias, grupos, orçamentos, push) -> usuários.
  const erros: string[] = []
  let lanc = 0, fams = 0, users = 0
  for (const fid of criados.familias) {
    const { data, error } = await admin.from('transactions').delete().eq('family_id', fid).select('id')
    if (error) erros.push(`tx ${fid}: ${error.message}`); else lanc += data.length
  }
  for (const fid of criados.familias) {
    const { data, error } = await admin.from('families').delete().eq('id', fid).select('id')
    if (error) erros.push(`fam ${fid}: ${error.message}`); else fams += data.length
  }
  for (const uid of criados.usuarios) {
    const { error } = await admin.auth.admin.deleteUser(uid)
    if (error && !/not.?found/i.test(error.message)) erros.push(`user ${uid}: ${error.message}`); else users++
  }
  appendFileSync(SAIDA, `LIMPEZA => ${lanc} lançamento(s), ${fams}/${criados.familias.length} família(s), ${users}/${criados.usuarios.length} usuário(s); erros=${JSON.stringify(erros)}\nREGISTROS CRIADOS => ${JSON.stringify(criados)}\n`)
  console.log(`LIMPEZA => ${lanc} lançamento(s), ${fams}/${criados.familias.length} família(s), ${users}/${criados.usuarios.length} usuário(s); erros=${JSON.stringify(erros)}`)
  console.log('REGISTROS CRIADOS => ' + JSON.stringify(criados))
})

describe('1. pagarFatura', () => {
  it('A tenta pagar fatura de B, usar conta de B, usar cartão como origem; payloads inválidos; RPC direta', async () => {
    const [anoB, mesB] = JSON.parse(ids.faturaB)
    const [anoA, mesA] = JSON.parse(ids.faturaA)
    como(A1)
    const base = { cartaoId: cartaoA, contaOrigemId: A1.contaId, anoFatura: anoA, mesFatura: mesA, data: '2026-10-12' }
    const r: Record<string, unknown> = {
      cartaoDeB: await pagarFatura({ ...base, cartaoId: cartaoB, anoFatura: anoB, mesFatura: mesB }),
      origemDeB: await pagarFatura({ ...base, contaOrigemId: B1.contaId }),
      origemCartao: await pagarFatura({ ...base, contaOrigemId: cartaoA }),
      ano1999: await pagarFatura({ ...base, anoFatura: 1999 }),
      mes13: await pagarFatura({ ...base, mesFatura: 13 }),
      mes0: await pagarFatura({ ...base, mesFatura: 0 }),
      mesFracao: await pagarFatura({ ...base, mesFatura: 1.5 }),
      mesString: await pagarFatura({ ...base, mesFatura: '10' as never }),
      data30fev: await pagarFatura({ ...base, data: '2026-02-30' }),
      dataSqli: await pagarFatura({ ...base, data: "2026-10-12'; DROP TABLE transactions; --" }),
      idSqli: await pagarFatura({ ...base, cartaoId: "1' OR '1'='1" }),
      inputNull: await pagarFatura(null as never),
      cartaoIgualOrigem: await pagarFatura({ ...base, contaOrigemId: cartaoA }),
    }
    const rpcDireta = await A1.cli.rpc('pay_invoice', { p_card_account_id: cartaoB, p_from_account_id: A1.contaId, p_invoice_year: anoB, p_invoice_month: mesB, p_date: '2026-10-12' })
    const rpcOrigemB = await A1.cli.rpc('pay_invoice', { p_card_account_id: cartaoA, p_from_account_id: B1.contaId, p_invoice_year: anoA, p_invoice_month: mesA, p_date: '2026-10-12' })
    obs('1.pagarFatura_hostil', r)
    obs('1.rpc_direta', { cartaoB: { data: rpcDireta.data, err: rpcDireta.error?.message }, origemB: { data: rpcOrigemB.data, err: rpcOrigemB.error?.message } })
    const compraB = await linha(ids.compraB)
    obs('1.compraB_depois', { is_paid: compraB?.is_paid, paid_date: compraB?.paid_date })
    for (const v of Object.values(r)) expect.soft((v as { ok: boolean }).ok).toBe(false)
    expect.soft(rpcDireta.error).not.toBeNull()
    expect.soft(rpcOrigemB.error).not.toBeNull()
    expect.soft(compraB?.is_paid).toBe(false)
    expect.soft(fila.length).toBe(0)
  })

  it('caminho feliz de A1 paga a fatura de A e agenda push só depois', async () => {
    const [anoA, mesA] = JSON.parse(ids.faturaA)
    como(A1)
    const r = await pagarFatura({ cartaoId: cartaoA, contaOrigemId: A1.contaId, anoFatura: anoA, mesFatura: mesA, data: '2026-10-12' })
    obs('1.pagarFatura_ok', { r, agendados: fila.length })
    expect.soft(r.ok).toBe(true)
    fila.splice(0)
  })
})

describe('2. registrarAcerto', () => {
  it('membros de outra família, valores inválidos, RPC direta', async () => {
    como(A1)
    const base = { deMembroId: A2.memberId, paraMembroId: A1.memberId, valor: 10, data: '2026-10-12' }
    const r: Record<string, unknown> = {
      deB: await registrarAcerto({ ...base, deMembroId: B1.memberId }),
      paraB: await registrarAcerto({ ...base, paraMembroId: B1.memberId }),
      mesmo: await registrarAcerto({ ...base, paraMembroId: A2.memberId }),
      negativo: await registrarAcerto({ ...base, valor: -10 }),
      zero: await registrarAcerto({ ...base, valor: 0 }),
      tresCasas: await registrarAcerto({ ...base, valor: 1.005 }),
      gigante: await registrarAcerto({ ...base, valor: 1e12 }),
      infinito: await registrarAcerto({ ...base, valor: Infinity }),
      nan: await registrarAcerto({ ...base, valor: NaN }),
      string: await registrarAcerto({ ...base, valor: '10' as never }),
      dataInvalida: await registrarAcerto({ ...base, data: '2026-13-01' }),
      idSqli: await registrarAcerto({ ...base, deMembroId: "x'); DELETE FROM transactions; --" }),
    }
    const rpcB = await A1.cli.rpc('settle_up', { p_from_member_id: B1.memberId, p_to_member_id: A1.memberId, p_amount: 10, p_date: '2026-10-12' })
    const rpcNeg = await A1.cli.rpc('settle_up', { p_from_member_id: A2.memberId, p_to_member_id: A1.memberId, p_amount: -10, p_date: '2026-10-12' })
    obs('2.registrarAcerto_hostil', r)
    obs('2.rpc_direta', { membroB: { data: rpcB.data, err: rpcB.error?.message }, negativo: { data: rpcNeg.data, err: rpcNeg.error?.message } })
    const { count: acertosB } = await admin.from('transactions').select('id', { count: 'exact', head: true }).eq('family_id', B1.familyId).not('settlement_to_member_id', 'is', null)
    obs('2.acertos_em_B', acertosB)
    for (const v of Object.values(r)) expect.soft((v as { ok: boolean }).ok).toBe(false)
    expect.soft(rpcB.error).not.toBeNull()
    expect.soft(rpcNeg.error).not.toBeNull()
    expect.soft(acertosB).toBe(0)
  })

  it('caminho feliz A2 -> A1 abate o saldo; v_settlement de B não é visível para A', async () => {
    como(A1)
    const antes = (await A1.cli.from('v_settlement').select('member_id,balance').eq('family_id', A1.familyId)).data
    const r = await registrarAcerto({ deMembroId: A2.memberId, paraMembroId: A1.memberId, valor: 30, data: '2026-10-12' })
    const depois = (await A1.cli.from('v_settlement').select('member_id,balance').eq('family_id', A1.familyId)).data
    const vistaB = await A1.cli.from('v_settlement').select('*').eq('family_id', B1.familyId)
    const vistaReal = await A1.cli.from('v_settlement').select('*').eq('family_id', REAL_FAMILY)
    const todas = await A1.cli.from('v_settlement').select('family_id')
    if (r.ok) ids.acertoA = r.dados.acertoId
    obs('2.acerto_ok', { r, antes, depois, vistaB: vistaB.data?.length, vistaReal: vistaReal.data?.length, familiasVisiveis: [...new Set((todas.data ?? []).map((x) => x.family_id))] })
    expect.soft(r.ok).toBe(true)
    expect.soft(vistaB.data?.length ?? 0).toBe(0)
    expect.soft(vistaReal.data?.length ?? 0).toBe(0)
    fila.splice(0)
  })
})

describe('3. atualizarLancamento', () => {
  it('ids/recursos de outra família, payloads hostis, acerto', async () => {
    como(A1)
    const base = { id: ids.txA, tipo: 'despesa' as const, descricao: 'Mercado A', valor: 100, data: '2026-10-10', contaId: A1.contaId, categoriaId: ids.catA, pagoPorId: A1.memberId, estaPago: true, dataDoPagamento: '2026-10-10' }
    const r: Record<string, unknown> = {
      txDeB: await atualizarLancamento({ ...base, id: ids.txB, descricao: 'Invadido' }),
      txDaFamiliaRealIdFalso: await atualizarLancamento({ ...base, id: '00000000-0000-4000-8000-000000000000' }),
      contaDeB: await atualizarLancamento({ ...base, contaId: B1.contaId }),
      categoriaDeB: await atualizarLancamento({ ...base, categoriaId: ids.catB }),
      pagoPorB: await atualizarLancamento({ ...base, pagoPorId: B1.memberId }),
      destinoDeB: await atualizarLancamento({ ...base, tipo: 'transferencia', contaDestinoId: B1.contaId }),
      transfSemDestino: await atualizarLancamento({ ...base, tipo: 'transferencia' }),
      investimento: await atualizarLancamento({ ...base, tipo: 'investimento' as never }),
      desc10k: await atualizarLancamento({ ...base, descricao: 'x'.repeat(10_000) }),
      desc121: await atualizarLancamento({ ...base, descricao: 'x'.repeat(121) }),
      descVazia: await atualizarLancamento({ ...base, descricao: '   ' }),
      valorNeg: await atualizarLancamento({ ...base, valor: -1 }),
      valorZero: await atualizarLancamento({ ...base, valor: 0 }),
      valor3casas: await atualizarLancamento({ ...base, valor: 10.001 }),
      valorGigante: await atualizarLancamento({ ...base, valor: 1e12 }),
      pagoSemData: await atualizarLancamento({ ...base, dataDoPagamento: null }),
      idSqli: await atualizarLancamento({ ...base, id: "1 OR 1=1" }),
      obs501: await atualizarLancamento({ ...base, observacao: 'o'.repeat(501) }),
      acerto: ids.acertoA ? await atualizarLancamento({ ...base, id: ids.acertoA, tipo: 'transferencia', contaDestinoId: A1.contaId, contaId: A2.contaId, valor: 1 }) : 'sem acerto',
    }
    obs('3.atualizar_hostil', r)
    const b = await linha(ids.txB)
    obs('3.txB_depois', { description: b?.description, amount: b?.amount })
    for (const [k, v] of Object.entries(r)) if (typeof v === 'object') expect.soft((v as { ok: boolean }).ok, k).toBe(false)
    expect.soft(b?.description).toBe('Mercado B')
  })

  it('texto hostil (SQLi/XSS/acentos/120 chars) é gravado como texto literal', async () => {
    como(A1)
    const base = { id: ids.txA, tipo: 'despesa' as const, valor: 100, data: '2026-10-10', contaId: A1.contaId, categoriaId: ids.catA, pagoPorId: A1.memberId, estaPago: true, dataDoPagamento: '2026-10-10' }
    const casos = ["'; DELETE FROM transactions; --", '<img src=x onerror=alert(1)>', 'çãü \' " < > & é', 'x'.repeat(120)]
    const res = []
    for (const d of casos) {
      const r = await atualizarLancamento({ ...base, descricao: d, observacao: '<script>alert(2)</script>' })
      const l = await linha(ids.txA)
      res.push({ ok: r.ok, igual: l?.description === d, notes: l?.notes })
    }
    const { count } = await admin.from('transactions').select('id', { count: 'exact', head: true }).in('family_id', criados.familias)
    obs('3.texto_literal', { res, txNasFamiliasDeTeste: count })
    for (const x of res) { expect.soft(x.ok).toBe(true); expect.soft(x.igual).toBe(true) }
    fila.splice(0)
  })
})

describe('4. atualizarLancamentosEmMassa', () => {
  it('arrays vazios/gigantes, mistura com id de B, recursos de B', async () => {
    como(A1)
    const muitos = Array.from({ length: 10_000 }, () => ids.txA)
    const muitosDistintos = Array.from({ length: 51 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`)
    const t0 = Date.now()
    const r: Record<string, unknown> = {
      vazio: await atualizarLancamentosEmMassa({ ids: [], estaPago: true }),
      dezMilRepetidos: await atualizarLancamentosEmMassa({ ids: muitos, estaPago: true }),
      cinquentaEUmDistintos: await atualizarLancamentosEmMassa({ ids: muitosDistintos, estaPago: true }),
      misturaComB: await atualizarLancamentosEmMassa({ ids: [ids.txA, ids.txA2, ids.txB], categoriaId: null }),
      soB: await atualizarLancamentosEmMassa({ ids: [ids.txB], estaPago: false }),
      categoriaDeB: await atualizarLancamentosEmMassa({ ids: [ids.txA], categoriaId: ids.catB }),
      contaDeB: await atualizarLancamentosEmMassa({ ids: [ids.txA], contaId: B1.contaId }),
      pagoPorB: await atualizarLancamentosEmMassa({ ids: [ids.txA], pagoPorId: B1.memberId }),
      nenhumCampo: await atualizarLancamentosEmMassa({ ids: [ids.txA] }),
      idNaoUuid: await atualizarLancamentosEmMassa({ ids: ['abc'], estaPago: true }),
      idsNaoArray: await atualizarLancamentosEmMassa({ ids: ids.txA as never, estaPago: true }),
      acertoNoLote: ids.acertoA ? await atualizarLancamentosEmMassa({ ids: [ids.txA, ids.acertoA], estaPago: true }) : 'sem acerto',
    }
    const ms = Date.now() - t0
    obs('4.massa_hostil', { r, ms })
    const a = await linha(ids.txA)
    const b = await linha(ids.txB)
    obs('4.estado_depois', { txA_category: a?.category_id === ids.catA, txB_is_paid: b?.is_paid, txB_category: b?.category_id === ids.catB })
    for (const [k, v] of Object.entries(r)) {
      if (typeof v !== 'object') continue
      if (k === 'dezMilRepetidos') continue // ver observação: dedup antes do max? registra
      expect.soft((v as { ok: boolean }).ok, k).toBe(false)
    }
    expect.soft(b?.is_paid).toBe(true)
    expect.soft(b?.category_id).toBe(ids.catB)
    expect.soft(a?.category_id).toBe(ids.catA)
    fila.splice(0)
  })
})

describe('5. orçamentos', () => {
  it('categoria/orçamento de outra família, mês/valor inválidos, views', async () => {
    como(B1)
    const okB = await definirOrcamento({ categoriaId: ids.catB, mes: '2026-10', valor: 500 })
    if (okB.ok) ids.orcB = okB.dados.id
    como(A1)
    const r: Record<string, unknown> = {
      categoriaDeB: await definirOrcamento({ categoriaId: ids.catB, mes: '2026-10', valor: 1 }),
      excluirOrcDeB: ids.orcB ? await excluirOrcamento({ id: ids.orcB }) : 'sem orc B',
      mes13: await definirOrcamento({ categoriaId: ids.catA, mes: '2026-13', valor: 10 }),
      mes1999: await definirOrcamento({ categoriaId: ids.catA, mes: '1999-12', valor: 10 }),
      mesSqli: await definirOrcamento({ categoriaId: ids.catA, mes: "2026-10'; DROP TABLE category_budgets; --", valor: 10 }),
      valorZero: await definirOrcamento({ categoriaId: ids.catA, mes: '2026-10', valor: 0 }),
      valorNeg: await definirOrcamento({ categoriaId: ids.catA, mes: '2026-10', valor: -5 }),
      valorGigante: await definirOrcamento({ categoriaId: ids.catA, mes: '2026-10', valor: 1e9 }),
      valor3casas: await definirOrcamento({ categoriaId: ids.catA, mes: '2026-10', valor: 1.234 }),
      idNaoUuid: await excluirOrcamento({ id: 'abc' }),
    }
    const okA = await definirOrcamento({ categoriaId: ids.catA, mes: '2026-10', valor: 300 })
    const vistaAdeB = await A1.cli.from('v_orcamento_progresso').select('*').eq('family_id', B1.familyId)
    const vistaAtodas = await A1.cli.from('v_orcamento_progresso').select('family_id,spent_amount')
    const patrAdeB = await A1.cli.from('v_patrimonio_mensal').select('*').eq('family_id', B1.familyId)
    const patrAreal = await A1.cli.from('v_patrimonio_mensal').select('*').eq('family_id', REAL_FAMILY)
    const patrAtodas = await A1.cli.from('v_patrimonio_mensal').select('family_id')
    const restAinsB = await A1.cli.from('category_budgets').insert({ family_id: B1.familyId, category_id: ids.catB, month: '2026-11', amount: 1 }).select('id')
    const restAinsCatB = await A1.cli.from('category_budgets').insert({ family_id: A1.familyId, category_id: ids.catB, month: '2026-11', amount: 1 }).select('id')
    const orcB = ids.orcB ? (await admin.from('category_budgets').select('amount').eq('id', ids.orcB).maybeSingle()).data : null
    obs('5.orcamentos_hostil', r)
    obs('5.views_e_rest', {
      okB: okB.ok, okA: okA.ok,
      vistaAdeB: vistaAdeB.data?.length, familiasNaVistaA: [...new Set((vistaAtodas.data ?? []).map((x) => x.family_id))],
      patrAdeB: patrAdeB.data?.length, patrAreal: patrAreal.data?.length, familiasPatrA: [...new Set((patrAtodas.data ?? []).map((x) => x.family_id))],
      restAinsB: restAinsB.error?.code, restAinsCatB: { code: restAinsCatB.error?.code, msg: restAinsCatB.error?.message },
      orcB_depois: orcB,
    })
    for (const [k, v] of Object.entries(r)) if (typeof v === 'object') expect.soft((v as { ok: boolean }).ok, k).toBe(false)
    expect.soft(vistaAdeB.data?.length ?? 0).toBe(0)
    expect.soft(patrAdeB.data?.length ?? 0).toBe(0)
    expect.soft(patrAreal.data?.length ?? 0).toBe(0)
    expect.soft(restAinsB.error).not.toBeNull()
    expect.soft(restAinsCatB.error).not.toBeNull()
    expect.soft(Number(orcB?.amount)).toBe(500)
  })
})

describe('6. grupos de categoria', () => {
  it('nomes hostis, recursos de outra família, FK composta via REST', async () => {
    como(A1)
    const okA = await adicionarGrupo({ nome: 'Casa' })
    if (okA.ok) ids.grupoA = okA.dados.id
    const r: Record<string, unknown> = {
      vazio: await adicionarGrupo({ nome: '' }),
      soEspacos: await adicionarGrupo({ nome: ' ​ \t ' }),
      nome41: await adicionarGrupo({ nome: 'x'.repeat(41) }),
      nome10k: await adicionarGrupo({ nome: 'y'.repeat(10_000) }),
      duplicadoAcento: await adicionarGrupo({ nome: '  CÁSA ' }),
      naoString: await adicionarGrupo({ nome: 123 as never }),
      renomearDeB: await renomearGrupo({ id: ids.grupoB, nome: 'Invadido' }),
      excluirDeB: await excluirGrupo({ id: ids.grupoB }),
      atribuirCatAaGrupoB: await atribuirGrupoCategoria({ categoriaId: ids.catA, grupoId: ids.grupoB }),
      atribuirCatBaGrupoA: await atribuirGrupoCategoria({ categoriaId: ids.catB, grupoId: ids.grupoA ?? null }),
      atribuirSemGrupoCampo: await atribuirGrupoCategoria({ categoriaId: ids.catA } as never),
    }
    const xss = await adicionarGrupo({ nome: '<img src=x onerror=alert(1)>' })
    const sqli = await adicionarGrupo({ nome: "'; DROP TABLE x; --" })
    const restFk = await A1.cli.from('categories').update({ group_id: ids.grupoB }).eq('id', ids.catA).select('id')
    const restIns = await A1.cli.from('category_groups').insert({ family_id: B1.familyId, name: 'Plantado' }).select('id')
    const restInsReal = await A1.cli.from('category_groups').insert({ family_id: REAL_FAMILY, name: 'Plantado' }).select('id')
    const restSelB = await A1.cli.from('category_groups').select('id').eq('family_id', B1.familyId)
    const restUpdB = await A1.cli.from('category_groups').update({ name: 'X' }).eq('id', ids.grupoB).select('id')
    const restMoverParaB = ids.grupoA ? await A1.cli.from('category_groups').update({ family_id: B1.familyId }).eq('id', ids.grupoA).select('id') : null
    const gB = (await admin.from('category_groups').select('name,family_id').eq('id', ids.grupoB).maybeSingle()).data
    obs('6.grupos_hostil', r)
    obs('6.grupos_texto', { xss: xss.ok ? xss.dados.nome : xss, sqli: sqli.ok ? sqli.dados.nome : sqli })
    obs('6.grupos_rest', {
      fkComposta: { rows: restFk.data?.length, code: restFk.error?.code },
      insB: restIns.error?.code, insReal: restInsReal.error?.code,
      selB: restSelB.data?.length, updB: restUpdB.data?.length,
      moverGrupoAParaB: restMoverParaB ? { rows: restMoverParaB.data?.length, code: restMoverParaB.error?.code } : null,
      grupoB_depois: gB?.name,
    })
    for (const [k, v] of Object.entries(r)) expect.soft((v as { ok: boolean }).ok, k).toBe(false)
    expect.soft(restFk.error?.code).toBe('23503')
    expect.soft(restIns.error).not.toBeNull()
    expect.soft(restInsReal.error).not.toBeNull()
    expect.soft(restSelB.data?.length ?? 0).toBe(0)
    expect.soft(gB?.name).toBe('Grupo B')
  })
})

describe('7. push: anti-SSRF, RLS por membro, destinatários e logs', () => {
  it('salvarInscricaoPush recusa endpoints hostis e aceita FCM válido', async () => {
    const k = chavesPush()
    como(A1)
    const tentar = (endpoint: string, keys: unknown = k) => salvarInscricaoPush({ endpoint, keys } as never)
    const r: Record<string, unknown> = {
      hostQualquer: await tentar('https://evil.example/push/1'),
      httpFcm: await tentar('http://fcm.googleapis.com/fcm/send/abc'),
      sufixoFalso: await tentar('https://fcm.googleapis.com.evil.example/fcm/send/abc'),
      userinfo: await tentar('https://fcm.googleapis.com@evil.example/x'),
      userinfo2: await tentar('https://evil@fcm.googleapis.com/fcm/send/abc'),
      porta: await tentar('https://fcm.googleapis.com:8443/fcm/send/abc'),
      fragmento: await tentar('https://evil.example/#.push.services.mozilla.com'),
      metadata: await tentar('https://169.254.169.254/latest/meta-data'),
      localhost: await tentar('https://localhost/x'),
      longo: await tentar('https://fcm.googleapis.com/fcm/send/' + 'a'.repeat(3000)),
      p256dhRuim: await tentar('https://fcm.googleapis.com/fcm/send/ok', { p256dh: 'AAAA', auth: k.auth }),
      authRuim: await tentar('https://fcm.googleapis.com/fcm/send/ok', { p256dh: k.p256dh, auth: 'xx' }),
      semKeys: await salvarInscricaoPush({ endpoint: 'https://fcm.googleapis.com/fcm/send/ok' } as never),
    }
    obs('7.endpoints_hostis', r)
    for (const [kk, v] of Object.entries(r)) expect.soft((v as { ok: boolean }).ok, kk).toBe(false)
    const { count } = await admin.from('push_subscriptions').select('id', { count: 'exact', head: true }).in('family_id', criados.familias)
    obs('7.inscricoes_apos_hostis', count)
    expect.soft(count).toBe(0)
  })

  it('RLS: membro não grava/lê/apaga inscrição de outro; bypass por REST com host hostil é pulado no envio', async () => {
    const kA1 = chavesPush(), kA2 = chavesPush(), kB1 = chavesPush()
    const epA1 = `https://fcm.googleapis.com/fcm/send/sentinela-r5-a1-${stamp}`
    const epA2 = `https://fcm.googleapis.com/fcm/send/sentinela-r5-a2-${stamp}`
    const epB1 = `https://fcm.googleapis.com/fcm/send/sentinela-r5-b1-${stamp}`
    const epEvil = `https://evil.example/ssrf-${stamp}`
    como(A1); const sA1 = await salvarInscricaoPush({ endpoint: epA1, keys: kA1 })
    como(A2); const sA2 = await salvarInscricaoPush({ endpoint: epA2, keys: kA2 })
    como(B1); const sB1 = await salvarInscricaoPush({ endpoint: epB1, keys: kB1 })
    // Bypass: A1 grava direto pelo REST um endpoint hostil (a policy de INSERT permite).
    const bypass = await A1.cli.from('push_subscriptions').insert({ family_id: A1.familyId, member_id: A1.memberId, endpoint: epEvil, p256dh: kA1.p256dh, auth: kA1.auth }).select('id')
    // Tentativas cruzadas.
    const insNomeA2 = await A1.cli.from('push_subscriptions').insert({ family_id: A1.familyId, member_id: A2.memberId, endpoint: epEvil + '-x', p256dh: 'x', auth: 'y' }).select('id')
    const insFamB = await A1.cli.from('push_subscriptions').insert({ family_id: B1.familyId, member_id: B1.memberId, endpoint: epEvil + '-y', p256dh: 'x', auth: 'y' }).select('id')
    const selA2 = await A2.cli.from('push_subscriptions').select('member_id,endpoint')
    const selB1 = await B1.cli.from('push_subscriptions').select('member_id,endpoint')
    const delA2sobreA1 = await A2.cli.from('push_subscriptions').delete().eq('endpoint', epA1).select('id')
    como(A2); const removerA1PorA2 = await removerInscricaoPush({ endpoint: epA1 })
    const aindaA1 = (await admin.from('push_subscriptions').select('id').eq('endpoint', epA1)).data?.length
    obs('7.rls_push', {
      sA1: sA1.ok, sA2: sA2.ok, sB1: sB1.ok,
      bypassRestHostHostil: { rows: bypass.data?.length, code: bypass.error?.code },
      insEmNomeDeA2: insNomeA2.error?.code, insNaFamiliaB: insFamB.error?.code,
      A2ve: (selA2.data ?? []).map((x) => (x.member_id === A2.memberId ? 'proprio' : 'OUTRO')),
      B1ve: (selB1.data ?? []).map((x) => (x.member_id === B1.memberId ? 'proprio' : 'OUTRO')),
      A2apagaA1RestRows: delA2sobreA1.data?.length, removerA1PorA2: removerA1PorA2, inscricaoA1Sobrevive: aindaA1,
    })
    expect.soft(insNomeA2.error).not.toBeNull()
    expect.soft(insFamB.error).not.toBeNull()
    expect.soft((selA2.data ?? []).every((x) => x.member_id === A2.memberId)).toBe(true)
    expect.soft((selB1.data ?? []).every((x) => x.member_id === B1.memberId)).toBe(true)
    expect.soft(aindaA1).toBe(1)

    // Envio: A2 lança -> só A1 recebe (epA1); evil é pulado; B1 nunca.
    const logs: string[] = []
    const orig = { log: console.log, info: console.info, warn: console.warn, error: console.error }
    const cap = (k: keyof typeof orig) => (...a: unknown[]) => { logs.push(a.map((x) => (x instanceof Error ? x.message : typeof x === 'string' ? x : JSON.stringify(x))).join(' ')); orig[k](...a) }
    console.info = cap('info'); console.warn = cap('warn'); console.error = cap('error')
    enviados.splice(0); fila.splice(0)
    await lancar(A2, { tipo: 'despesa', descricao: 'Push teste', valor: 1, data: '2026-10-12', contaId: A2.contaId, categoriaId: ids.catA })
    const antesDeDrenar = enviados.length
    await drenarFila()
    const env1 = enviados.map((e) => e.endpoint)
    const corpo1 = enviados[0]?.corpo
    // Envio com falha 500 e 410 para exercitar os logs de erro e a remoção.
    enviados.splice(0)
    statusPorEndpoint.set(epA2, 500)
    como(A1)
    const ac = await registrarAcerto({ deMembroId: A1.memberId, paraMembroId: A2.memberId, valor: 5, data: '2026-10-12' })
    await drenarFila()
    const env2 = enviados.map((e) => e.endpoint)
    enviados.splice(0)
    statusPorEndpoint.set(epA2, 410)
    await lancar(A1, { tipo: 'despesa', descricao: 'Push 410', valor: 1, data: '2026-10-12', contaId: A1.contaId, categoriaId: ids.catA })
    await drenarFila()
    const a2Depois410 = (await admin.from('push_subscriptions').select('id').eq('endpoint', epA2)).data?.length
    console.info = orig.info; console.warn = orig.warn; console.error = orig.error
    const segredos = [epA1, epA2, epB1, epEvil, kA1.p256dh, kA1.auth, kA2.p256dh, kA2.auth, kB1.p256dh, kB1.auth, 'SEGREDO-VAPID-PRIVADO-SENTINELA-R5', SERVICE]
    const vazados = segredos.filter((s) => logs.some((l) => l.includes(s))).map((s) => s.slice(0, 24) + '...')
    obs('7.envio', { enviadosAntesDoAfter: antesDeDrenar, destinosLancamentoA2: env1, corpoNotificacao: corpo1, acerto: ac.ok, destinosAcertoA1: env2, inscricaoA2Apos410: a2Depois410 })
    obs('7.logs_capturados', logs)
    obs('7.segredos_vazados_em_log', vazados)
    expect.soft(antesDeDrenar).toBe(0)
    expect.soft(env1).toEqual([epA1])
    expect.soft(env2).toEqual([epA2])
    expect.soft(a2Depois410).toBe(0)
    expect.soft(vazados).toEqual([])
    expect.soft(env1.concat(env2).some((e) => e.includes('evil') || e === epB1)).toBe(false)
  })
})

describe('8. exclusão de lançamento', () => {
  it('"single" na 1ª parcela de uma série de 3', async () => {
    const serie = await lancar(A1, { tipo: 'despesa', descricao: 'Série 3x', valor: 30, data: '2026-10-10', contaId: A1.contaId, categoriaId: ids.catA, parcelas: 3 })
    const pai = serie.find((x) => x.recurrence_parent_id == null)!
    const idsSerie = serie.map((x) => x.id)
    const antes = (await admin.from('transactions').select('id').in('id', idsSerie)).data?.length
    como(A1)
    const r = await excluirLancamento(pai.id, 'single')
    const depois = (await admin.from('transactions').select('id').in('id', idsSerie)).data?.length
    obs('8.excluir_single_pai', { parcelasCriadas: serie.length, antes, resposta: r, depois })
    expect.soft(depois).toBe(antes! - 1)
  })

  it('A tenta excluir lançamento de B (single e series)', async () => {
    como(A1)
    const r1 = await excluirLancamento(ids.txB, 'single')
    const r2 = await excluirLancamento(ids.txB, 'series')
    const r3 = await excluirLancamento(ids.txB, 'tudo' as never)
    const b = await linha(ids.txB)
    obs('8.excluir_de_B', { r1, r2, r3, txBExiste: Boolean(b) })
    expect.soft(r1.ok).toBe(false)
    expect.soft(r2.ok).toBe(false)
    expect.soft(Boolean(b)).toBe(true)
  })
})

describe('9. REST direto: integridade do acerto e FK de série', () => {
  it('membro grava "acerto" sem passar por settle_up; e aponta série para lançamento de B', async () => {
    const antes = (await A1.cli.from('v_settlement').select('member_id,balance').eq('family_id', A1.familyId)).data
    const forjado = await A1.cli.from('transactions').insert({
      family_id: A1.familyId, type: 'transferencia', description: 'Ajuda', amount: 999, date: '2026-10-12',
      account_id: A1.contaId, to_account_id: A2.contaId, created_by_member_id: A1.memberId, paid_by_member_id: A1.memberId,
      settlement_to_member_id: A2.memberId, is_paid: true, paid_date: '2026-10-12',
    }).select('id')
    const depois = (await A1.cli.from('v_settlement').select('member_id,balance').eq('family_id', A1.familyId)).data
    const viraAcerto = await A1.cli.from('transactions').update({ settlement_to_member_id: null }).eq('id', ids.acertoA ?? '00000000-0000-4000-8000-000000000000').select('id')
    const acertoParaB = await A1.cli.from('transactions').insert({
      family_id: A1.familyId, type: 'transferencia', description: 'x', amount: 1, date: '2026-10-12',
      account_id: A1.contaId, to_account_id: A2.contaId, created_by_member_id: A1.memberId, paid_by_member_id: A1.memberId,
      settlement_to_member_id: B1.memberId, is_paid: true, paid_date: '2026-10-12',
    }).select('id')
    const serieCruzada = await A1.cli.from('transactions').insert({
      family_id: A1.familyId, type: 'despesa', description: 'filho de B', amount: 1, date: '2026-10-12',
      account_id: A1.contaId, created_by_member_id: A1.memberId, paid_by_member_id: A1.memberId, recurrence_parent_id: ids.txB,
    }).select('id')
    const serieIdInexistente = await A1.cli.from('transactions').insert({
      family_id: A1.familyId, type: 'despesa', description: 'filho de ninguém', amount: 1, date: '2026-10-12',
      account_id: A1.contaId, created_by_member_id: A1.memberId, paid_by_member_id: A1.memberId, recurrence_parent_id: '00000000-0000-4000-8000-000000000001',
    }).select('id')
    obs('9.rest_integridade', {
      acertoForjadoPorRest: { rows: forjado.data?.length, code: forjado.error?.code },
      saldoAntes: antes, saldoDepois: depois,
      desfazerAcertoPorRest: { rows: viraAcerto.data?.length, code: viraAcerto.error?.code },
      acertoComMembroDeB: { code: acertoParaB.error?.code },
      serieApontandoParaTxDeB: { rows: serieCruzada.data?.length, code: serieCruzada.error?.code },
      serieApontandoParaIdInexistente: { rows: serieIdInexistente.data?.length, code: serieIdInexistente.error?.code },
    })
    // Efeito colateral do FK simples: se B apagar txB, a linha de A some junto?
    if (serieCruzada.data?.length) {
      const idA = serieCruzada.data[0].id
      ids.filhoDeB = idA
      const rB = await B1.cli.rpc('delete_transactions', { p_id: ids.txB, p_scope: 'single' }) // B apaga o PRÓPRIO lançamento
      const filhoSobrevive = Boolean(await linha(idA))
      obs('9.cascata_cruzada', { BexcluiuTxB: rB.error?.message ?? rB.data, linhaDeAsobrevive: filhoSobrevive })
    }
    expect.soft(acertoParaB.error?.code).toBe('23503')
  })

  it('anon (sem sessão) nas views e nas tabelas novas', async () => {
    const anon = createClient(URL_SB, ANON, { auth: { persistSession: false } })
    const res: Record<string, unknown> = {}
    for (const v of ['v_account_balances', 'v_invoices', 'v_monthly_summary', 'v_settlement', 'v_orcamento_progresso', 'v_patrimonio_mensal', 'push_subscriptions', 'category_groups', 'category_budgets']) {
      const q = await anon.from(v).select('*').limit(1)
      res[v] = { status: q.status, rows: q.data?.length ?? null, code: q.error?.code, msg: q.error?.message }
    }
    const insV = await anon.from('v_account_balances').insert({ account_id: 'x' } as never)
    res['insert_anon_v_account_balances'] = { status: insV.status, code: insV.error?.code, msg: insV.error?.message }
    obs('9.anon', res)
    for (const v of Object.values(res)) expect.soft((v as { rows: number | null }).rows ?? 0).toBe(0)
  })

  it('sem sessão: todas as actions novas recusam', async () => {
    como(null)
    const r = {
      pagarFatura: await pagarFatura({ cartaoId: cartaoA, contaOrigemId: A1.contaId, anoFatura: 2026, mesFatura: 10, data: '2026-10-12' }),
      registrarAcerto: await registrarAcerto({ deMembroId: A2.memberId, paraMembroId: A1.memberId, valor: 1, data: '2026-10-12' }),
      atualizar: await atualizarLancamento({ id: ids.txA, tipo: 'despesa', descricao: 'x', valor: 1, data: '2026-10-10', contaId: A1.contaId, pagoPorId: A1.memberId, estaPago: false }),
      massa: await atualizarLancamentosEmMassa({ ids: [ids.txA], estaPago: false }),
      orc: await definirOrcamento({ categoriaId: ids.catA, mes: '2026-10', valor: 1 }),
      grupo: await adicionarGrupo({ nome: 'Anon' }),
      push: await salvarInscricaoPush({ endpoint: 'https://fcm.googleapis.com/fcm/send/anon', keys: chavesPush() }),
      excluir: await excluirLancamento(ids.txA, 'single'),
    }
    obs('9.sem_sessao', r)
    for (const v of Object.values(r)) expect.soft(v.ok).toBe(false)
  })
})

describe('10. recuperação de senha: domínio do link', () => {
  it('redirectTo vem só de env; Host forjado não tem por onde entrar', async () => {
    const chamadas: Array<{ email: string; opts: unknown }> = []
    estado.cliente = { auth: { resetPasswordForEmail: async (email: string, opts: unknown) => { chamadas.push({ email, opts }); return { data: {}, error: null } } } }
    const envOrig = { site: process.env.NEXT_PUBLIC_SITE_URL, vercel: process.env.VERCEL_URL }
    process.env.NEXT_PUBLIC_SITE_URL = 'https://financascasais.vercel.app/'
    const r1 = await pedirRecuperacaoDeSenha({ email: 'alvo@example.com' })
    delete process.env.NEXT_PUBLIC_SITE_URL
    process.env.VERCEL_URL = 'financascasais-git-x.vercel.app'
    const r2 = await pedirRecuperacaoDeSenha({ email: 'alvo@example.com' })
    process.env.NEXT_PUBLIC_SITE_URL = ''
    const r3 = await pedirRecuperacaoDeSenha({ email: 'alvo@example.com' })
    process.env.NEXT_PUBLIC_SITE_URL = envOrig.site; if (envOrig.site === undefined) delete process.env.NEXT_PUBLIC_SITE_URL
    process.env.VERCEL_URL = envOrig.vercel; if (envOrig.vercel === undefined) delete process.env.VERCEL_URL
    obs('10.redirectTo', { r1: r1.ok, r2: r2.ok, r3: r3.ok, chamadas })
    expect.soft((chamadas[0].opts as { redirectTo: string }).redirectTo).toBe('https://financascasais.vercel.app/nova-senha')
  })
})
