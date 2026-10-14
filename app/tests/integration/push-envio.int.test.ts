// @vitest-environment node
//
// Push real (Fase B, R-1) + pagarFatura / registrarAcerto (R-13), de verdade,
// contra o banco HOSPEDADO. O que é REAL aqui: Zod, getUser, resolução da
// família pela sessão, RLS de push_subscriptions (cada inscrição é gravada pela
// sessão do PRÓPRIO membro), as RPCs pay_invoice/settle_up, e o servico.ts
// com service_role lendo/apagando inscrições no banco.
//
// O que é trocado, e por quê:
//   - createClient do servidor (cookie do Next) -> cliente supabase-js já
//     autenticado como o usuário do teste (mesmo arranjo dos outros .int).
//   - after() -> guarda o callback sem rodar. Assim o teste PROVA que o envio
//     não acontece antes da action responder, e roda o callback depois.
//   - web-push.sendNotification -> grava para onde iria cada POST e devolve o
//     status escolhido (201, 404, 410, 500). A criptografia/VAPID reais estão
//     em tests/unit/push-envio-real.test.ts. Nenhuma requisição sai para FCM.
//
// Famílias descartáveis: Casa A (A1 + A2, entrou por join_family) e Casa B
// (B1). Tudo APAGADO no afterAll por limparTeste (lançamentos -> famílias ->
// usuários; push_subscriptions sai em CASCADE de families, join_attempts em
// CASCADE de auth.users), com contagem global antes/depois. Nunca toca a
// família real.
//
// Sem as chaves no ambiente o arquivo é PULADO. Para rodar, de dentro de app/:
//   set -a && . ./.env.local && set +a
//   npx vitest run tests/integration/push-envio.int.test.ts
import { createECDH, randomBytes } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { limparTeste } from './limpeza-utils.mjs'

type Envio = { endpoint: string; payload: string }
const estado = vi.hoisted(() => ({
  cliente: null as unknown,
  agendados: [] as Array<() => unknown>,
  enviados: [] as Array<{ endpoint: string; payload: string }>,
  statusPorEndpoint: new Map<string, number>(),
}))

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }))
vi.mock('next/server', () => ({ after: (cb: () => unknown) => void estado.agendados.push(cb) }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => estado.cliente }))
vi.mock('web-push', () => ({
  default: {
    sendNotification: async (sub: { endpoint: string }, payload: string) => {
      estado.enviados.push({ endpoint: sub.endpoint, payload })
      const status = estado.statusPorEndpoint.get(sub.endpoint) ?? 201
      if (status >= 300) throw Object.assign(new Error(`push recusado ${status}`), { statusCode: status })
      return { statusCode: status, body: '', headers: {} }
    },
  },
}))

import { salvarLancamento } from '@/actions/lancamento'
import { pagarFatura } from '@/actions/fatura'
import { registrarAcerto } from '@/actions/acerto'
import { removerInscricaoPush, salvarInscricaoPush } from '@/actions/push'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const temAmbiente = Boolean(URL && ANON && SERVICE)
const FAMILIA_REAL = '9969d589-1645-403f-912a-1504bfeebb89'
const DIA = '2026-10-05'
// uuid válido que não existe em lugar nenhum (nunca igual a um id gerado).
const UUID_OUTRO = '00000000-0000-4000-8000-000000000000'

type Cliente = SupabaseClient<Database>
type Membro = { tag: string; uid: string; cli: Cliente; familyId: string; memberId: string; joinCode: string }

const stamp = Date.now()
let admin: Cliente
const usuarios: string[] = []
const familias: string[] = []
let contagemAntes: { familias: number; usuarios: number; push: number } | null = null

function chavesDeAparelho() {
  const ecdh = createECDH('prime256v1')
  ecdh.generateKeys()
  return { p256dh: ecdh.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') }
}

const endpoint = (sufixo: string) => `https://fcm.googleapis.com/fcm/send/teste-${stamp}-${sufixo}`

async function novoUsuario(tag: string) {
  const email = `push-${tag}-${stamp}@example.com`
  const pass = 'Senha!Forte123'
  const { data, error } = await admin.auth.admin.createUser({ email, password: pass, email_confirm: true })
  if (error || !data.user) throw new Error(`createUser ${tag}: ${error?.message}`)
  usuarios.push(data.user.id)
  const cli = createClient<Database>(URL!, ANON!, { auth: { persistSession: false } })
  const { error: sErr } = await cli.auth.signInWithPassword({ email, password: pass })
  if (sErr) throw new Error(`signIn ${tag}: ${sErr.message}`)
  return { tag, uid: data.user.id, cli }
}

async function criarCasa(tag: string): Promise<Membro> {
  const u = await novoUsuario(tag)
  const { data, error } = await u.cli.rpc('create_family', {
    p_family_name: `Casa Push ${tag} ${stamp}`, p_split_rule: 'equal', p_member_name: `Membro ${tag}`, p_monthly_income: 3000,
  })
  const row = Array.isArray(data) ? data[0] : data
  if (error || !row) throw new Error(`create_family ${tag}: ${error?.message}`)
  if (row.family_id === FAMILIA_REAL) throw new Error('create_family devolveu a família real — abortando')
  familias.push(row.family_id)
  return { ...u, familyId: row.family_id, memberId: row.member_id, joinCode: row.join_code }
}

async function entrarNaCasa(tag: string, dono: Membro): Promise<Membro> {
  const u = await novoUsuario(tag)
  const { data, error } = await u.cli.rpc('join_family', {
    p_join_code: dono.joinCode, p_member_name: `Membro ${tag}`, p_monthly_income: 3000,
  })
  const row = Array.isArray(data) ? data[0] : data
  if (error || !row) throw new Error(`join_family ${tag}: ${error?.message}`)
  if (row.family_id !== dono.familyId) throw new Error(`join_family ${tag}: caiu em outra família`)
  return { ...u, familyId: row.family_id, memberId: row.member_id, joinCode: dono.joinCode }
}

/** Grava a inscrição pela sessão do PRÓPRIO membro (policy push_insert_own real). */
async function inscrever(m: Membro, sufixo: string, url = endpoint(sufixo)) {
  const { error } = await m.cli.from('push_subscriptions').insert({
    family_id: m.familyId, member_id: m.memberId, endpoint: url, ...chavesDeAparelho(),
  })
  if (error) throw new Error(`inscrever ${m.tag}/${sufixo}: ${error.message}`)
  return url
}

async function contaCorrente(m: Membro) {
  const { data, error } = await m.cli.from('accounts').select('id')
    .eq('owner_member_id', m.memberId).eq('type', 'corrente').order('id').limit(1).single()
  if (error || !data) throw new Error(`conta de ${m.tag}: ${error?.message}`)
  return data.id
}

function como(m: Membro | null) {
  estado.cliente = m ? m.cli : createClient<Database>(URL!, ANON!, { auth: { persistSession: false } })
}

/** Roda os callbacks de after() e devolve o que eles retornaram. */
async function rodarAgendados() {
  const cbs = estado.agendados.splice(0)
  return Promise.all(cbs.map((cb) => cb()))
}

const destinos = () => estado.enviados.map((e: Envio) => e.endpoint).sort()

async function inscricaoExiste(url: string) {
  const { data } = await admin.from('push_subscriptions').select('id').eq('endpoint', url)
  return (data ?? []).length > 0
}

async function contagemGlobal() {
  const { count: fam } = await admin.from('families').select('*', { count: 'exact', head: true })
  const { count: push } = await admin.from('push_subscriptions').select('*', { count: 'exact', head: true })
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error) throw new Error(`listUsers: ${error.message}`)
  return { familias: fam ?? -1, usuarios: data.users.length, push: push ?? -1 }
}

describe.skipIf(!temAmbiente)('push real + pagarFatura/registrarAcerto contra o banco real', () => {
  let A1: Membro
  let A2: Membro
  let B1: Membro
  let eA1: string
  let eA2: string
  let eB1: string
  let contaA1: string
  let vapidReal: { publicKey: string; privateKey: string }

  beforeAll(async () => {
    admin = createClient<Database>(URL!, SERVICE!, { auth: { persistSession: false } })
    contagemAntes = await contagemGlobal()
    console.log(`contagem global ANTES: ${JSON.stringify(contagemAntes)}`)

    A1 = await criarCasa('a1')
    A2 = await entrarNaCasa('a2', A1)
    B1 = await criarCasa('b1')
    eA1 = await inscrever(A1, 'a1')
    eA2 = await inscrever(A2, 'a2')
    eB1 = await inscrever(B1, 'b1')
    contaA1 = await contaCorrente(A1)

    // web-push é CommonJS (`export =` nos tipos); no import dinâmico ele vem em `default`.
    const real = (await vi.importActual('web-push')) as { default: typeof import('web-push') }
    vapidReal = real.default.generateVAPIDKeys()
  }, 90_000)

  beforeEach(() => {
    estado.agendados.length = 0
    estado.enviados.length = 0
    estado.statusPorEndpoint.clear()
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = vapidReal.publicKey
    process.env.VAPID_PRIVATE_KEY = vapidReal.privateKey
  })

  afterAll(async () => {
    if (familias.includes(FAMILIA_REAL)) throw new Error('A família real apareceu entre as criadas — limpeza ABORTADA')
    const erros = await limparTeste(admin, familias, usuarios)
    const depois = await contagemGlobal()
    console.log(`contagem global DEPOIS: ${JSON.stringify(depois)}`)
    const { count: sobras } = await admin.from('push_subscriptions')
      .select('*', { count: 'exact', head: true }).in('family_id', familias)
    expect(erros).toEqual([])
    expect(sobras).toBe(0)
    expect(depois).toEqual(contagemAntes)
  }, 90_000)

  const despesaA1 = () => ({
    tipo: 'despesa' as const, descricao: 'Mercado do mês', valor: 123.45, data: DIA,
    contaId: contaA1, estaPago: true, dataDoPagamento: DIA,
  })

  // ------------------------------------------------------------ salvarLancamento
  it('salvarLancamento: o envio é AGENDADO em after(), não feito antes da resposta', async () => {
    como(A1)
    const r = await salvarLancamento(despesaA1())
    expect(r.ok).toBe(true)
    expect(estado.agendados).toHaveLength(1)
    expect(estado.enviados).toHaveLength(0) // a action já respondeu e nada saiu
    await rodarAgendados()
    expect(estado.enviados.length).toBeGreaterThan(0)
  })

  it('o AUTOR não recebe a própria notificação', async () => {
    como(A1)
    expect((await salvarLancamento(despesaA1())).ok).toBe(true)
    await rodarAgendados()
    expect(destinos()).not.toContain(eA1)
    expect(destinos()).toEqual([eA2])
  })

  it('OUTRA família nunca recebe', async () => {
    como(A1)
    expect((await salvarLancamento(despesaA1())).ok).toBe(true)
    await rodarAgendados()
    expect(destinos()).not.toContain(eB1)
  })

  it('o payload é o contrato do sw.js, com o nome do autor e SEM o valor', async () => {
    como(A1)
    expect((await salvarLancamento(despesaA1())).ok).toBe(true)
    await rodarAgendados()
    const payload = JSON.parse(estado.enviados[0].payload)
    expect(payload).toEqual({ titulo: 'Finanças a Dois', corpo: 'Membro a1 registrou um lançamento', url: '/inicio' })
    expect(estado.enviados[0].payload).not.toMatch(/123|R\$/)
  })

  it('lote de 2 itens: UMA notificação, dizendo 2 lançamentos', async () => {
    como(A1)
    expect((await salvarLancamento([despesaA1(), { ...despesaA1(), descricao: 'Padaria' }])).ok).toBe(true)
    await rodarAgendados()
    expect(estado.enviados).toHaveLength(1)
    expect(JSON.parse(estado.enviados[0].payload).corpo).toBe('Membro a1 registrou 2 lançamentos')
  })

  it('B1 lança na própria casa: ninguém de A recebe, e B1 não recebe a própria', async () => {
    como(B1)
    const contaB1 = await contaCorrente(B1)
    expect((await salvarLancamento({ ...despesaA1(), contaId: contaB1 })).ok).toBe(true)
    const [rel] = await rodarAgendados()
    expect(estado.enviados).toEqual([])
    expect(rel).toMatchObject({ destinos: 0, enviados: 0 })
  })

  it('validação falhou: nada é agendado', async () => {
    como(A1)
    const r = await salvarLancamento({ ...despesaA1(), valor: 0 })
    expect(r.ok).toBe(false)
    expect(estado.agendados).toHaveLength(0)
  })

  // ----------------------------------------------------------------- pagarFatura
  it('pagarFatura de A1: quita a fatura, devolve o id, e SÓ A2 recebe', async () => {
    const { data: cartao, error: cErr } = await A1.cli.from('accounts').insert({
      family_id: A1.familyId, name: 'Cartão push', type: 'cartao', closing_day: 10, due_day: 20,
    }).select('id').single()
    expect(cErr).toBeNull()
    const { data: compra, error: lErr } = await A1.cli.rpc('save_transactions', {
      p_items: [{ type: 'despesa', description: 'Restaurante', amount: 100, date: DIA, account_id: cartao!.id, is_paid: false }],
    })
    expect(lErr).toBeNull()
    const linha = (compra as Array<{ id: string; invoice_year: number; invoice_month: number }>)[0]

    como(A1)
    const r = await pagarFatura({
      cartaoId: cartao!.id, contaOrigemId: contaA1,
      anoFatura: linha.invoice_year, mesFatura: linha.invoice_month, data: DIA,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(typeof r.dados.pagamentoId).toBe('string')

    const { data: depois } = await admin.from('transactions').select('is_paid, paid_date').eq('id', linha.id).single()
    expect(depois).toEqual({ is_paid: true, paid_date: DIA })

    await rodarAgendados()
    expect(destinos()).toEqual([eA2])
    expect(JSON.parse(estado.enviados[0].payload)).toEqual({
      titulo: 'Finanças a Dois', corpo: 'Membro a1 pagou uma fatura do cartão', url: '/carteira',
    })
  })

  it('pagarFatura de novo na fatura já paga: erro da RPC, nada agendado', async () => {
    const { data: cartao } = await admin.from('accounts').select('id').eq('family_id', A1.familyId).eq('type', 'cartao').single()
    const { data: paga } = await admin.from('transactions').select('invoice_year, invoice_month')
      .eq('account_id', cartao!.id).eq('type', 'despesa').order('id').limit(1).single()
    como(A1)
    const r = await pagarFatura({
      cartaoId: cartao!.id, contaOrigemId: contaA1, anoFatura: paga!.invoice_year!, mesFatura: paga!.invoice_month!, data: DIA,
    })
    expect(r).toEqual({ ok: false, erro: 'Esta fatura não tem valor em aberto' })
    expect(estado.agendados).toHaveLength(0)
  })

  it('B1 tentando pagar a fatura de A: "Cartão não encontrado", nada agendado, nenhum lançamento novo em A', async () => {
    const { data: cartao } = await admin.from('accounts').select('id').eq('family_id', A1.familyId).eq('type', 'cartao').single()
    const { count: antes } = await admin.from('transactions').select('*', { count: 'exact', head: true }).eq('family_id', A1.familyId)
    como(B1)
    const r = await pagarFatura({ cartaoId: cartao!.id, contaOrigemId: await contaCorrente(B1), anoFatura: 2026, mesFatura: 10, data: DIA })
    expect(r).toEqual({
      ok: false, erro: 'Cartão não encontrado nesta família',
      camposComErro: { cartaoId: ['Cartão não encontrado nesta família'] },
    })
    expect(estado.agendados).toHaveLength(0)
    const { count: depois } = await admin.from('transactions').select('*', { count: 'exact', head: true }).eq('family_id', A1.familyId)
    expect(depois).toBe(antes)
  })

  it('pagarFatura com conta de origem que é cartão: recusado no campo contaOrigemId', async () => {
    const { data: cartao } = await admin.from('accounts').select('id').eq('family_id', A1.familyId).eq('type', 'cartao').single()
    const { data: outro } = await A1.cli.from('accounts').insert({
      family_id: A1.familyId, name: 'Outro cartão', type: 'cartao', closing_day: 5, due_day: 15,
    }).select('id').single()
    como(A1)
    const r = await pagarFatura({ cartaoId: cartao!.id, contaOrigemId: outro!.id, anoFatura: 2026, mesFatura: 10, data: DIA })
    expect(r).toEqual({ ok: false, erro: 'Conta de origem inválida', camposComErro: { contaOrigemId: ['Conta de origem inválida'] } })
  })

  it('pagarFatura com mês 13: erro de campo, nada agendado', async () => {
    como(A1)
    const r = await pagarFatura({ cartaoId: contaA1, contaOrigemId: UUID_OUTRO, anoFatura: 2026, mesFatura: 13, data: DIA })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.camposComErro?.mesFatura).toEqual(['Fatura inválida.'])
    expect(estado.agendados).toHaveLength(0)
  })

  // -------------------------------------------------------------- registrarAcerto
  it('registrarAcerto A2 -> A1 do valor exato: grava o destinatário (00010), ZERA os saldos e SÓ A1 recebe', async () => {
    const { data: antes } = await A2.cli.from('v_settlement').select('member_id, balance')
    const saldoA2 = Number(antes!.find((s) => s.member_id === A2.memberId)!.balance)
    expect(saldoA2).toBeLessThan(0) // A1 pagou tudo até aqui: A2 deve

    como(A2)
    const r = await registrarAcerto({
      deMembroId: A2.memberId, paraMembroId: A1.memberId, valor: Math.round(-saldoA2 * 100) / 100, data: DIA,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return

    const { data: tx } = await admin.from('transactions')
      .select('type, paid_by_member_id, settlement_to_member_id, created_by_member_id, family_id')
      .eq('id', r.dados.acertoId).single()
    expect(tx).toEqual({
      type: 'transferencia', paid_by_member_id: A2.memberId, settlement_to_member_id: A1.memberId,
      created_by_member_id: A2.memberId, family_id: A1.familyId,
    })

    const { data: depois } = await A2.cli.from('v_settlement').select('member_id, balance')
    for (const s of depois!) expect(Math.abs(Number(s.balance))).toBeLessThan(0.005)

    await rodarAgendados()
    expect(destinos()).toEqual([eA1])
    expect(destinos()).not.toContain(eA2) // o autor (A2) não recebe
    expect(JSON.parse(estado.enviados[0].payload).corpo).toBe('Membro a2 registrou um acerto de contas')
  })

  it('B1 tentando registrar acerto entre A1 e A2: recusado, nenhum lançamento novo em A, nada agendado', async () => {
    const { count: antes } = await admin.from('transactions').select('*', { count: 'exact', head: true }).eq('family_id', A1.familyId)
    como(B1)
    const r = await registrarAcerto({ deMembroId: A2.memberId, paraMembroId: A1.memberId, valor: 10, data: DIA })
    expect(r).toEqual({
      ok: false, erro: 'Membro não encontrado nesta família',
      camposComErro: { deMembroId: ['Membro não encontrado nesta família'] },
    })
    expect(estado.agendados).toHaveLength(0)
    const { count: depois } = await admin.from('transactions').select('*', { count: 'exact', head: true }).eq('family_id', A1.familyId)
    expect(depois).toBe(antes)
  })

  it('registrarAcerto com a mesma pessoa dos dois lados: erro de campo, nada agendado', async () => {
    como(A1)
    const r = await registrarAcerto({ deMembroId: A1.memberId, paraMembroId: A1.memberId, valor: 10, data: DIA })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.camposComErro?.paraMembroId).toEqual(['O acerto precisa ser entre duas pessoas diferentes'])
    expect(estado.agendados).toHaveLength(0)
  })

  // ------------------------------------------------------------ inscrições mortas
  it('inscrição que responde 410 ou 404 é APAGADA; a que responde 500 fica', async () => {
    const morta410 = await inscrever(A2, 'a2-410')
    const morta404 = await inscrever(A2, 'a2-404')
    const falha500 = await inscrever(A2, 'a2-500')
    estado.statusPorEndpoint.set(morta410, 410)
    estado.statusPorEndpoint.set(morta404, 404)
    estado.statusPorEndpoint.set(falha500, 500)

    como(A1)
    expect((await salvarLancamento(despesaA1())).ok).toBe(true)
    const [rel] = await rodarAgendados()

    expect(destinos()).toEqual([eA2, morta404, morta410, falha500].sort())
    expect(rel).toMatchObject({ destinos: 4, enviados: 1, apagados: 2, falhas: 1 })
    expect(await inscricaoExiste(morta410)).toBe(false)
    expect(await inscricaoExiste(morta404)).toBe(false)
    expect(await inscricaoExiste(falha500)).toBe(true)
    expect(await inscricaoExiste(eA2)).toBe(true)

    await A2.cli.from('push_subscriptions').delete().eq('endpoint', falha500)
  })

  it('endpoint gravado DIRETO pelo REST fora dos serviços de push: o servidor NÃO faz POST para ele', async () => {
    const forjado = await inscrever(A2, 'forjado', `https://evil.example/coleta-${stamp}`)
    como(A1)
    expect((await salvarLancamento(despesaA1())).ok).toBe(true)
    const [rel] = await rodarAgendados()
    expect(destinos()).toEqual([eA2])
    expect(rel).toMatchObject({ pulados: 1 })
    await A2.cli.from('push_subscriptions').delete().eq('endpoint', forjado)
  })

  it('aparelho COMPARTILHADO: endpoint que também está no nome do autor não recebe o aviso do que o autor fez', async () => {
    // Heitor ativou no navegador, saiu sem desativar, Carol entrou e ativou no
    // mesmo navegador: o MESMO endpoint fica em nome dos dois (o UNIQUE é por
    // membro+endpoint). Quem estiver no aparelho pode ser o próprio autor.
    const compartilhado = endpoint('compartilhado')
    await inscrever(A1, 'compartilhado-a1', compartilhado)
    await inscrever(A2, 'compartilhado-a2', compartilhado)

    como(A1)
    expect((await salvarLancamento(despesaA1())).ok).toBe(true)
    await rodarAgendados()
    expect(destinos()).toEqual([eA2])

    await A1.cli.from('push_subscriptions').delete().eq('endpoint', compartilhado)
    await A2.cli.from('push_subscriptions').delete().eq('endpoint', compartilhado)
  })

  it('sem VAPID no ambiente: a action segue ok e nada é enviado', async () => {
    delete process.env.VAPID_PRIVATE_KEY
    como(A1)
    expect((await salvarLancamento(despesaA1())).ok).toBe(true)
    const [rel] = await rodarAgendados()
    expect(estado.enviados).toEqual([])
    expect(rel).toMatchObject({ enviados: 0, motivo: 'sem-vapid' })
  })

  it('sem sessão: recusa e nada é agendado', async () => {
    como(null)
    expect(await pagarFatura({ cartaoId: contaA1, contaOrigemId: UUID_OUTRO, anoFatura: 2026, mesFatura: 10, data: DIA }))
      .toEqual({ ok: false, erro: 'Sua sessão expirou. Entre de novo.' })
    expect(await registrarAcerto({ deMembroId: A1.memberId, paraMembroId: A2.memberId, valor: 1, data: DIA }))
      .toEqual({ ok: false, erro: 'Sua sessão expirou. Entre de novo.' })
    expect(estado.agendados).toHaveLength(0)
  })

  // ---------------------------------------------------- salvar/remover inscrição
  it('salvarInscricaoPush grava para o PRÓPRIO membro; repetir não duplica; remover apaga', async () => {
    const url = endpoint('a1-novo')
    const entrada = { endpoint: url, expirationTime: null, keys: chavesDeAparelho() }
    como(A1)
    expect(await salvarInscricaoPush(entrada)).toEqual({ ok: true, dados: undefined })
    expect(await salvarInscricaoPush(entrada)).toEqual({ ok: true, dados: undefined })

    const { data } = await admin.from('push_subscriptions').select('family_id, member_id').eq('endpoint', url)
    expect(data).toEqual([{ family_id: A1.familyId, member_id: A1.memberId }])

    expect(await removerInscricaoPush({ endpoint: url })).toEqual({ ok: true, dados: undefined })
    expect(await inscricaoExiste(url)).toBe(false)
  })

  it('salvarInscricaoPush de novo com CHAVES NOVAS troca as chaves e mantém UMA linha', async () => {
    const url = endpoint('a1-rotacao')
    const antigas = chavesDeAparelho()
    const novas = chavesDeAparelho()
    como(A1)
    expect((await salvarInscricaoPush({ endpoint: url, keys: antigas })).ok).toBe(true)
    expect((await salvarInscricaoPush({ endpoint: url, keys: novas })).ok).toBe(true)
    const { data } = await admin.from('push_subscriptions').select('p256dh, auth').eq('endpoint', url)
    expect(data).toEqual([{ p256dh: novas.p256dh, auth: novas.auth }])
    expect(await removerInscricaoPush({ endpoint: url })).toEqual({ ok: true, dados: undefined })
  })

  it('salvarInscricaoPush repetido com as MESMAS chaves não apaga a linha viva (mesmo id)', async () => {
    const url = endpoint('a1-mesmo')
    const chaves = chavesDeAparelho()
    como(A1)
    expect((await salvarInscricaoPush({ endpoint: url, keys: chaves })).ok).toBe(true)
    const { data: antes } = await admin.from('push_subscriptions').select('id').eq('endpoint', url).single()
    expect((await salvarInscricaoPush({ endpoint: url, keys: chaves })).ok).toBe(true)
    const { data: depois } = await admin.from('push_subscriptions').select('id').eq('endpoint', url).single()
    expect(depois!.id).toBe(antes!.id) // não houve apagar + inserir
    expect((await removerInscricaoPush({ endpoint: url })).ok).toBe(true)
  })

  it('salvarInscricaoPush com endpoint fora dos serviços de push: recusado e nada gravado', async () => {
    const url = `https://evil.example/x-${stamp}`
    como(A1)
    const r = await salvarInscricaoPush({ endpoint: url, keys: chavesDeAparelho() })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.camposComErro?.endpoint).toEqual(['Serviço de notificação não reconhecido.'])
    expect(await inscricaoExiste(url)).toBe(false)
  })

  it('removerInscricaoPush não apaga a inscrição de OUTRO membro', async () => {
    como(A1)
    expect((await removerInscricaoPush({ endpoint: eA2 })).ok).toBe(true)
    expect(await inscricaoExiste(eA2)).toBe(true)
  })

  it('salvarInscricaoPush sem sessão: recusa', async () => {
    como(null)
    expect(await salvarInscricaoPush({ endpoint: endpoint('x'), keys: chavesDeAparelho() }))
      .toEqual({ ok: false, erro: 'Sua sessão expirou. Entre de novo.' })
  })
})
