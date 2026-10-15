// @vitest-environment node
//
// atualizarLancamento / atualizarLancamentosEmMassa, de verdade, contra o banco
// HOSPEDADO (plano: docs/planos/estrutura-editar-lancamento.md). Mesmo arranjo
// de orcamentos.int.test.ts: só o createClient do servidor (cookie do Next) é
// trocado por um cliente supabase-js autenticado como o usuário do teste;
// revalidatePath é neutralizado; after() só ENFILEIRA o push (não envia).
// Zod, família, consultas, RLS, CHECKs e FKs são os reais.
//
// Duas famílias descartáveis: A (2 membros, 2 contas correntes + 1 cartão) e B
// (1 membro). APAGADAS no afterAll pela limparTeste (lançamentos -> famílias ->
// usuários) com contagem de sobras = 0. Nunca toca na família real.
//
// Para rodar, de dentro de app/:
//   set -a && . ./.env.local && set +a
//   npx vitest run tests/integration/editar-lancamento.int.test.ts
// EDICAO_RLS_MUTANTE=1 troca o intruso do bloco "RLS direto" pelo service_role:
// esses testes TÊM de ficar vermelhos nesse modo.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { hojeEmSaoPaulo } from '@/lib/hoje'
import { limparTeste } from './limpeza-utils.mjs'

const estado = vi.hoisted(() => ({ cliente: null as unknown, agendados: [] as unknown[] }))
vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }))
vi.mock('next/server', () => ({ after: (cb: unknown) => void estado.agendados.push(cb) }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => estado.cliente }))

import { atualizarLancamento, atualizarLancamentosEmMassa } from '@/actions/editar-lancamento'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const temAmbiente = Boolean(URL && ANON && SERVICE)
const FAMILIA_REAL = '9969d589-1645-403f-912a-1504bfeebb89'

type Cliente = SupabaseClient<Database>
type Linha = Database['public']['Tables']['transactions']['Row']
type Membro = { id: string; cli: Cliente }
type Casa = {
  familyId: string
  m1: Membro
  m2?: Membro
  conta1: string
  conta2?: string
  cartao?: string
  cat1: string
  cat2: string
}

const NAO_ENCONTRADO = 'Lançamento não encontrado.'
const ACERTO = 'Acerto de contas não pode ser editado. Exclua e registre de novo.'
const DESTINO = 'Escolha uma conta de destino diferente da conta de origem.'
const SESSAO = 'Sua sessão expirou. Entre de novo.'

const stamp = Date.now()
let admin: Cliente
const usuarios: string[] = []
const familias: string[] = []

async function entrar(tag: string): Promise<{ cli: Cliente }> {
  const email = `editar-lanc-${tag}-${stamp}@example.com`
  const pass = 'Senha!Forte123'
  const { data: u, error } = await admin.auth.admin.createUser({ email, password: pass, email_confirm: true })
  if (error || !u.user) throw new Error(`createUser ${tag}: ${error?.message}`)
  usuarios.push(u.user.id)
  const cli = createClient<Database>(URL!, ANON!, { auth: { persistSession: false } })
  const { error: sErr } = await cli.auth.signInWithPassword({ email, password: pass })
  if (sErr) throw new Error(`signIn ${tag}: ${sErr.message}`)
  return { cli }
}

async function novaCasa(tag: string, comParceiro: boolean): Promise<Casa> {
  const { cli } = await entrar(`${tag}1`)
  const { data: fam, error } = await cli.rpc('create_family', {
    p_family_name: `Casa Editar ${tag} ${stamp}`, p_split_rule: 'equal', p_member_name: `Membro ${tag}1`, p_monthly_income: 1000,
  })
  if (error || !fam?.[0]) throw new Error(`create_family ${tag}: ${error?.message}`)
  const familyId = fam[0].family_id
  if (familyId === FAMILIA_REAL) throw new Error('create_family devolveu a família real — abortando')
  familias.push(familyId)
  const m1: Membro = { id: fam[0].member_id, cli }

  let m2: Membro | undefined
  if (comParceiro) {
    const { cli: cli2 } = await entrar(`${tag}2`)
    const { data: f } = await admin.from('families').select('join_code').eq('id', familyId).single()
    const { data: j, error: jErr } = await cli2.rpc('join_family', { p_join_code: f!.join_code, p_member_name: `Membro ${tag}2` })
    if (jErr || !j?.[0]) throw new Error(`join_family ${tag}: ${jErr?.message}`)
    m2 = { id: j[0].member_id, cli: cli2 }
  }

  const { data: contas } = await admin.from('accounts').select('id,owner_member_id')
    .eq('family_id', familyId).eq('type', 'corrente').order('id')
  const conta1 = contas!.find((c) => c.owner_member_id === m1.id)!.id
  const conta2 = m2 ? contas!.find((c) => c.owner_member_id === m2!.id)!.id : undefined

  let cartao: string | undefined
  if (comParceiro) {
    const { data: c, error: cErr } = await admin.from('accounts')
      .insert({ family_id: familyId, name: 'Cartão Teste', type: 'cartao', closing_day: 10, due_day: 20 })
      .select('id').single()
    if (cErr) throw new Error(`cartão ${tag}: ${cErr.message}`)
    cartao = c.id
  }

  // Desempate por id (L-010).
  const { data: cats } = await admin.from('categories').select('id')
    .eq('family_id', familyId).eq('type', 'despesa').order('id').limit(2)
  return { familyId, m1, m2, conta1, conta2, cartao, cat1: cats![0].id, cat2: cats![1].id }
}

async function lancar(casa: Casa, extra: Record<string, unknown> = {}): Promise<string> {
  const item = {
    type: 'despesa', description: 'Mercado', amount: 100, date: '2026-10-05',
    account_id: casa.conta1, category_id: casa.cat1, is_paid: false, paid_date: null, ...extra,
  }
  const { data, error } = await casa.m1.cli.rpc('save_transactions', { p_items: [item] })
  if (error || !data?.[0]) throw new Error(`save_transactions: ${error?.message}`)
  return data[0].id
}

async function linha(id: string): Promise<Linha> {
  const { data, error } = await admin.from('transactions').select('*').eq('id', id).single()
  if (error) throw new Error(error.message)
  return data
}

function como(m: Membro | null) {
  estado.cliente = m ? m.cli : createClient<Database>(URL!, ANON!, { auth: { persistSession: false } })
}

describe.skipIf(!temAmbiente)('editar lançamento contra o banco real', () => {
  let A: Casa
  let B: Casa

  const edicao = (id: string, extra: Record<string, unknown> = {}) => ({
    id, tipo: 'despesa' as const, descricao: 'Mercado editado', valor: 123.45, data: '2026-10-05',
    contaId: A.conta1, categoriaId: A.cat1, pagoPorId: A.m1.id, estaPago: false,
    dataDoPagamento: null, observacao: null, ...extra,
  })

  beforeAll(async () => {
    admin = createClient<Database>(URL!, SERVICE!, { auth: { persistSession: false } })
    A = await novaCasa('a', true)
    B = await novaCasa('b', false)
  }, 90_000)

  beforeEach(() => {
    estado.agendados.length = 0
  })

  afterAll(async () => {
    const erros = await limparTeste(admin, familias, usuarios)
    expect(erros).toEqual([])
    const { count: sobraFam } = await admin.from('families').select('id', { count: 'exact', head: true }).in('id', familias)
    const { count: sobraTx } = await admin.from('transactions').select('id', { count: 'exact', head: true }).in('family_id', familias)
    const { count: sobraConta } = await admin.from('accounts').select('id', { count: 'exact', head: true }).in('family_id', familias)
    console.log(`sobras após limpeza: ${sobraFam} família(s), ${sobraTx} lançamento(s), ${sobraConta} conta(s)`)
    expect([sobraFam, sobraTx, sobraConta]).toEqual([0, 0, 0])
  }, 90_000)

  // ------------------------------------------------------------ individual
  it('edita todos os campos da assinatura; o resto da linha não muda; agenda 1 push', async () => {
    const id = await lancar(A)
    const antes = await linha(id)
    como(A.m1)
    const r = await atualizarLancamento(edicao(id, {
      descricao: '  Feira  ', valor: 0.1 + 0.2, data: '2026-10-07', contaId: A.conta2, categoriaId: A.cat2,
      pagoPorId: A.m2!.id, estaPago: true, dataDoPagamento: '2026-10-08', observacao: 'nota',
    }))
    expect(r).toEqual({ ok: true, dados: undefined })
    const depois = await linha(id)
    expect(depois).toMatchObject({
      description: 'Feira', amount: 0.3, date: '2026-10-07', account_id: A.conta2, category_id: A.cat2,
      paid_by_member_id: A.m2!.id, is_paid: true, paid_date: '2026-10-08', notes: 'nota',
      // não tocados:
      created_by_member_id: antes.created_by_member_id, family_id: A.familyId,
      owner_member_id: antes.owner_member_id, is_futile: antes.is_futile, invoice_year: null,
    })
    expect(estado.agendados).toHaveLength(1)
  })

  it('mover para o cartão calcula a fatura (dia do fechamento = ciclo seguinte); voltar zera', async () => {
    const id = await lancar(A)
    como(A.m1)
    expect((await atualizarLancamento(edicao(id, { contaId: A.cartao, data: '2026-10-10' }))).ok).toBe(true)
    expect(await linha(id)).toMatchObject({ account_id: A.cartao, invoice_year: 2026, invoice_month: 11 })
    expect((await atualizarLancamento(edicao(id, { contaId: A.conta1 }))).ok).toBe(true)
    expect(await linha(id)).toMatchObject({ account_id: A.conta1, invoice_year: null, invoice_month: null })
  })

  it('editar só a descrição de compra do cartão NÃO move a fatura, mesmo após mudar o fechamento', async () => {
    const id = await lancar(A, { account_id: A.cartao, date: '2026-10-05' })
    expect(await linha(id)).toMatchObject({ invoice_year: 2026, invoice_month: 10 })
    await admin.from('accounts').update({ closing_day: 3 }).eq('id', A.cartao!)
    try {
      como(A.m1)
      expect((await atualizarLancamento(edicao(id, { contaId: A.cartao, descricao: 'só o nome' }))).ok).toBe(true)
      expect(await linha(id)).toMatchObject({ description: 'só o nome', invoice_year: 2026, invoice_month: 10 })
    } finally {
      await admin.from('accounts').update({ closing_day: 10 }).eq('id', A.cartao!)
    }
  })

  it('despesa → transferência sem destino é recusada no campo contaDestinoId, sem gravar', async () => {
    const id = await lancar(A)
    const antes = await linha(id)
    como(A.m1)
    const r = await atualizarLancamento(edicao(id, { tipo: 'transferencia' }))
    expect(r).toEqual({ ok: false, erro: DESTINO, camposComErro: { contaDestinoId: [DESTINO] } })
    expect(await linha(id)).toEqual(antes)
  })

  it('despesa → transferência com destino: categoria zerada; e de volta a despesa zera o destino', async () => {
    const id = await lancar(A)
    como(A.m1)
    expect((await atualizarLancamento(edicao(id, { tipo: 'transferencia', contaDestinoId: A.conta2 }))).ok).toBe(true)
    expect(await linha(id)).toMatchObject({ type: 'transferencia', to_account_id: A.conta2, category_id: null })
    // Transferência existente, editada sem contaDestinoId: destino mantido.
    expect((await atualizarLancamento(edicao(id, { tipo: 'transferencia', descricao: 'Guardar' }))).ok).toBe(true)
    expect(await linha(id)).toMatchObject({ description: 'Guardar', to_account_id: A.conta2 })
    expect((await atualizarLancamento(edicao(id))).ok).toBe(true)
    expect(await linha(id)).toMatchObject({ type: 'despesa', to_account_id: null, category_id: A.cat1 })
  })

  it('acerto de contas é recusado, sem gravar', async () => {
    const { data: acerto, error } = await admin.from('transactions').insert({
      family_id: A.familyId, type: 'transferencia', description: 'Acerto de contas', amount: 50, date: '2026-10-05',
      account_id: A.conta1, to_account_id: A.conta2, created_by_member_id: A.m1.id, paid_by_member_id: A.m1.id,
      settlement_to_member_id: A.m2!.id, is_paid: true, paid_date: '2026-10-05',
    }).select('id').single()
    if (error) throw new Error(error.message)
    const antes = await linha(acerto.id)
    como(A.m1)
    const r = await atualizarLancamento(edicao(acerto.id, { tipo: 'transferencia', contaDestinoId: A.conta2, descricao: 'x' }))
    expect(r).toEqual({ ok: false, erro: ACERTO, camposComErro: { formulario: [ACERTO] } })
    expect(await linha(acerto.id)).toEqual(antes)
    expect(estado.agendados).toHaveLength(0)
  })

  it('valor com 3 casas é recusado no campo valor, sem gravar e sem push', async () => {
    const id = await lancar(A)
    const antes = await linha(id)
    como(A.m1)
    const r = await atualizarLancamento(edicao(id, { valor: 1.005 }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.camposComErro?.valor).toEqual(['Use no máximo 2 casas decimais.'])
    expect(await linha(id)).toEqual(antes)
    expect(estado.agendados).toHaveLength(0)
  })

  it('sem sessão: as duas actions pedem login', async () => {
    const id = await lancar(A)
    como(null)
    expect(await atualizarLancamento(edicao(id))).toEqual({ ok: false, erro: SESSAO })
    expect(await atualizarLancamentosEmMassa({ ids: [id], estaPago: true })).toEqual({ ok: false, erro: SESSAO })
  })

  // ------------------------------------------------ isolamento: individual
  it('B não edita lançamento de A: "não encontrado" e a linha de A fica igual', async () => {
    const id = await lancar(A)
    const antes = await linha(id)
    como(B.m1)
    const r = await atualizarLancamento(edicao(id, { contaId: B.conta1, categoriaId: B.cat1, pagoPorId: B.m1.id }))
    expect(r).toEqual({ ok: false, erro: NAO_ENCONTRADO })
    expect(await linha(id)).toEqual(antes)
    expect(estado.agendados).toHaveLength(0)
  })

  // Com as referências de B a FK composta de transactions (23503) barra o
  // UPDATE mesmo sem o filtro da action; com as do próprio A, não há FK que
  // segure: só o filtro por família (e o RLS) impedem a gravação.
  it('B não edita lançamento de A nem usando conta, categoria e membro do próprio A', async () => {
    const id = await lancar(A)
    const antes = await linha(id)
    como(B.m1)
    const r = await atualizarLancamento(edicao(id, { descricao: 'invadido', contaId: A.conta2 }))
    expect(r).toEqual({ ok: false, erro: NAO_ENCONTRADO })
    expect(await linha(id)).toEqual(antes)
    expect(estado.agendados).toHaveLength(0)
  })

  it('B não aponta o PRÓPRIO lançamento para conta, categoria ou membro de A', async () => {
    const idB = await lancar(B)
    const antes = await linha(idB)
    como(B.m1)
    const base = { contaId: B.conta1, categoriaId: B.cat1, pagoPorId: B.m1.id }
    const conta = await atualizarLancamento(edicao(idB, { ...base, contaId: A.conta1 }))
    const categoria = await atualizarLancamento(edicao(idB, { ...base, categoriaId: A.cat1 }))
    const membro = await atualizarLancamento(edicao(idB, { ...base, pagoPorId: A.m1.id }))
    const destino = await atualizarLancamento(edicao(idB, { ...base, tipo: 'transferencia', contaDestinoId: A.conta1 }))
    expect(conta).toEqual({ ok: false, erro: 'Conta não encontrada.', camposComErro: { contaId: ['Conta não encontrada.'] } })
    expect(categoria).toEqual({ ok: false, erro: 'Categoria não encontrada.', camposComErro: { categoriaId: ['Categoria não encontrada.'] } })
    expect(membro).toEqual({ ok: false, erro: 'Membro não encontrado.', camposComErro: { pagoPorId: ['Membro não encontrado.'] } })
    expect(destino).toEqual({
      ok: false, erro: 'Conta de destino não encontrada.', camposComErro: { contaDestinoId: ['Conta de destino não encontrada.'] },
    })
    expect(await linha(idB)).toEqual(antes)
  })

  it('id inexistente (uuid válido) cai em "não encontrado"', async () => {
    como(A.m1)
    expect(await atualizarLancamento(edicao(randomUUID()))).toEqual({ ok: false, erro: NAO_ENCONTRADO })
  })

  // ------------------------------------------------------------------ lote
  it('categoria em 3 lançamentos: atualizados = 3; 1 push', async () => {
    const ids = [await lancar(A), await lancar(A), await lancar(A)]
    como(A.m2!)
    const r = await atualizarLancamentosEmMassa({ ids, categoriaId: A.cat2 })
    expect(r).toEqual({ ok: true, dados: { atualizados: 3 } })
    for (const id of ids) expect((await linha(id)).category_id).toBe(A.cat2)
    expect(estado.agendados).toHaveLength(1)
  })

  it('"sem categoria" (null) zera a categoria', async () => {
    const ids = [await lancar(A), await lancar(A)]
    como(A.m1)
    expect(await atualizarLancamentosEmMassa({ ids, categoriaId: null })).toEqual({ ok: true, dados: { atualizados: 2 } })
    for (const id of ids) expect((await linha(id)).category_id).toBeNull()
  })

  it('marcar como pago: quem já estava pago mantém a data; os outros ganham hoje (SP)', async () => {
    const jaPago = await lancar(A, { is_paid: true, paid_date: '2026-09-01' })
    const pendente = await lancar(A)
    como(A.m1)
    const r = await atualizarLancamentosEmMassa({ ids: [jaPago, pendente], estaPago: true })
    expect(r).toEqual({ ok: true, dados: { atualizados: 1 } })
    expect((await linha(jaPago)).paid_date).toBe('2026-09-01')
    expect(await linha(pendente)).toMatchObject({ is_paid: true, paid_date: hojeEmSaoPaulo() })
  })

  it('marcar como pendente zera pago e data', async () => {
    const ids = [await lancar(A, { is_paid: true, paid_date: '2026-09-01' }), await lancar(A)]
    como(A.m1)
    expect(await atualizarLancamentosEmMassa({ ids, estaPago: false })).toEqual({ ok: true, dados: { atualizados: 2 } })
    for (const id of ids) expect(await linha(id)).toMatchObject({ is_paid: false, paid_date: null })
  })

  it('mover para o cartão recalcula a fatura POR LINHA; quem pagou também muda', async () => {
    const antesDoFechamento = await lancar(A, { date: '2026-10-09' })
    const noFechamento = await lancar(A, { date: '2026-10-10' })
    como(A.m1)
    const r = await atualizarLancamentosEmMassa({ ids: [antesDoFechamento, noFechamento], contaId: A.cartao, pagoPorId: A.m2!.id })
    expect(r).toEqual({ ok: true, dados: { atualizados: 2 } })
    expect(await linha(antesDoFechamento)).toMatchObject({ account_id: A.cartao, invoice_month: 10, paid_by_member_id: A.m2!.id })
    expect(await linha(noFechamento)).toMatchObject({ account_id: A.cartao, invoice_month: 11, paid_by_member_id: A.m2!.id })
  })

  it('transferência + categoria: recusa o lote INTEIRO, nada gravado', async () => {
    const despesa = await lancar(A)
    const transf = await lancar(A, { type: 'transferencia', to_account_id: A.conta2, category_id: null })
    const antes = [await linha(despesa), await linha(transf)]
    como(A.m1)
    const r = await atualizarLancamentosEmMassa({ ids: [despesa, transf], categoriaId: A.cat2 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erro).toBe('Transferências não têm categoria. Tire as transferências da seleção.')
    expect([await linha(despesa), await linha(transf)]).toEqual(antes)
  })

  it('validação do lote: nenhum campo, vazio e 51 ids recusados com a mensagem no erro', async () => {
    como(A.m1)
    const id = randomUUID()
    expect(await atualizarLancamentosEmMassa({ ids: [id] }))
      .toEqual({ ok: false, erro: 'Escolha pelo menos um campo para alterar.', camposComErro: { formulario: ['Escolha pelo menos um campo para alterar.'] } })
    const vazio = await atualizarLancamentosEmMassa({ ids: [], estaPago: true })
    expect(!vazio.ok && vazio.erro).toBe('Nenhum lançamento selecionado.')
    const grande = await atualizarLancamentosEmMassa({ ids: Array.from({ length: 51 }, () => randomUUID()), estaPago: true })
    expect(!grande.ok && grande.erro).toBe('Muitos lançamentos de uma vez. Separe em partes.')
  })

  // ------------------------------------------------------ isolamento: lote
  it('B não edita lançamento de A em lote', async () => {
    const id = await lancar(A)
    const antes = await linha(id)
    como(B.m1)
    expect(await atualizarLancamentosEmMassa({ ids: [id], estaPago: true })).toEqual({ ok: false, erro: NAO_ENCONTRADO })
    expect(await linha(id)).toEqual(antes)
  })

  it('lote MISTO (B + A): recusado inteiro — nem a linha de B é gravada', async () => {
    const idA = await lancar(A)
    const idB = await lancar(B)
    const antes = [await linha(idA), await linha(idB)]
    como(B.m1)
    expect(await atualizarLancamentosEmMassa({ ids: [idB, idA], estaPago: true })).toEqual({ ok: false, erro: NAO_ENCONTRADO })
    expect([await linha(idA), await linha(idB)]).toEqual(antes)
    expect(estado.agendados).toHaveLength(0)
  })

  it('B não aponta os próprios lançamentos para conta, categoria ou membro de A em lote', async () => {
    const idB = await lancar(B)
    const antes = await linha(idB)
    como(B.m1)
    const conta = await atualizarLancamentosEmMassa({ ids: [idB], contaId: A.conta1 })
    const categoria = await atualizarLancamentosEmMassa({ ids: [idB], categoriaId: A.cat1 })
    const membro = await atualizarLancamentosEmMassa({ ids: [idB], pagoPorId: A.m1.id })
    expect([conta, categoria, membro].map((r) => !r.ok && r.erro))
      .toEqual(['Conta não encontrada.', 'Categoria não encontrada.', 'Membro não encontrado.'])
    expect(await linha(idB)).toEqual(antes)
  })

  // ------------------------------------------- isolamento: RLS direto
  const intruso = () => (process.env.EDICAO_RLS_MUTANTE === '1' ? admin : B.m1.cli)

  it('RLS: o cliente de B, direto no PostgREST, altera 0 linhas de A (por id e em lote)', async () => {
    const id = await lancar(A)
    const antes = await linha(id)
    const { data: um } = await intruso().from('transactions').update({ description: 'invadido' }).eq('id', id).select('id')
    const { data: lote } = await intruso().from('transactions').update({ is_paid: true, paid_date: '2026-10-01' }).in('id', [id]).select('id')
    expect([um, lote]).toEqual([[], []])
    expect(await linha(id)).toEqual(antes)
  })

  it('RLS: B não move linha própria para a família de A (WITH CHECK)', async () => {
    const idB = await lancar(B)
    const { error } = await intruso().from('transactions').update({ family_id: A.familyId }).eq('id', idB)
    expect(error?.code).toBe('42501')
    expect((await linha(idB)).family_id).toBe(B.familyId)
  })
})
