// @vitest-environment node
//
// excluirLancamento (RPC delete_transactions) contra o banco HOSPEDADO.
// Regressão do achado A-1 do Sentinela R5 (docs/auditoria/r5-sentinela.md):
// "Apenas este lançamento" na 1ª parcela apagava a série inteira, porque
// transactions.recurrence_parent_id tinha ON DELETE CASCADE para a própria
// tabela. E do B-1 (mesma FK): uma linha de A pendurada num id de B sumia
// quando B apagava o próprio lançamento.
//
// Mesmo arranjo de editar-lancamento.int.test.ts: só o createClient do
// servidor é trocado por um supabase-js autenticado como o usuário do teste;
// revalidatePath é neutralizado. Zod, RPC, RLS e FKs são os reais.
//
// Duas famílias descartáveis (A com 1 membro, B com 1 membro), APAGADAS no
// afterAll pela limparTeste (lançamentos -> famílias -> usuários), com sobra
// conferida por id (L-019). Nunca toca na família real.
//
// Para rodar, de dentro de app/:
//   set -a && . ./.env.local && set +a
//   npx vitest run tests/integration/excluir-lancamento.int.test.ts
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { limparTeste } from './limpeza-utils.mjs'

const estado = vi.hoisted(() => ({ cliente: null as unknown }))
vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => estado.cliente }))

import { excluirLancamento } from '@/actions/lancamento'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const temAmbiente = Boolean(URL && ANON && SERVICE)
const FAMILIA_REAL = '9969d589-1645-403f-912a-1504bfeebb89'

type Cliente = SupabaseClient<Database>
type Casa = { familyId: string; memberId: string; cli: Cliente; conta: string }

// Mensagem do RAISE de delete_transactions, repassada por traduzErroDoBanco.
const NAO_ENCONTRADO = 'Lançamento não encontrado'

const stamp = Date.now()
let admin: Cliente
const usuarios: string[] = []
const familias: string[] = []

async function novaCasa(tag: string): Promise<Casa> {
  const email = `excluir-lanc-${tag}-${stamp}@example.com`
  const pass = 'Senha!Forte123'
  const { data: u, error } = await admin.auth.admin.createUser({ email, password: pass, email_confirm: true })
  if (error || !u.user) throw new Error(`createUser ${tag}: ${error?.message}`)
  usuarios.push(u.user.id)
  const cli = createClient<Database>(URL!, ANON!, { auth: { persistSession: false } })
  const { error: sErr } = await cli.auth.signInWithPassword({ email, password: pass })
  if (sErr) throw new Error(`signIn ${tag}: ${sErr.message}`)

  const { data: fam, error: fErr } = await cli.rpc('create_family', {
    p_family_name: `Casa Excluir ${tag} ${stamp}`, p_split_rule: 'equal', p_member_name: `Membro ${tag}`, p_monthly_income: 1000,
  })
  if (fErr || !fam?.[0]) throw new Error(`create_family ${tag}: ${fErr?.message}`)
  const familyId = fam[0].family_id
  if (familyId === FAMILIA_REAL) throw new Error('create_family devolveu a família real — abortando')
  familias.push(familyId)

  // Desempate por id (L-010).
  const { data: contas } = await admin.from('accounts').select('id')
    .eq('family_id', familyId).eq('type', 'corrente').order('id').limit(1)
  return { familyId, memberId: fam[0].member_id, cli, conta: contas![0].id }
}

/** Série de N parcelas pela RPC real; devolve os ids na ordem da parcela. */
async function serie(casa: Casa, n: number, descricao = 'Notebook'): Promise<string[]> {
  const { data, error } = await casa.cli.rpc('save_transactions', {
    p_items: [{
      type: 'despesa', description: descricao, amount: 300, date: '2026-10-05',
      account_id: casa.conta, is_paid: false, paid_date: null, recurrence_months: n,
    }],
  })
  if (error || !data) throw new Error(`save_transactions: ${error?.message}`)
  const ordenadas = [...data].sort((a, b) => (a.recurrence_index ?? 0) - (b.recurrence_index ?? 0))
  // Pré-condição do cenário: a 1ª é a mãe e as outras apontam para ela.
  expect(ordenadas.map((t) => t.recurrence_index)).toEqual(Array.from({ length: n }, (_, i) => (n > 1 ? i + 1 : null)))
  if (n > 1) {
    expect(ordenadas[0].recurrence_parent_id).toBeNull()
    for (const t of ordenadas.slice(1)) expect(t.recurrence_parent_id).toBe(ordenadas[0].id)
  }
  return ordenadas.map((t) => t.id)
}

/** Quais destes ids ainda existem no banco (visão do service_role), na ordem dada. */
async function vivos(ids: string[]): Promise<string[]> {
  const { data, error } = await admin.from('transactions').select('id').in('id', ids)
  if (error) throw new Error(error.message)
  const existe = new Set(data.map((r) => r.id))
  return ids.filter((id) => existe.has(id))
}

function como(casa: Casa) {
  estado.cliente = casa.cli
}

describe.skipIf(!temAmbiente)('excluir lançamento contra o banco real', () => {
  let A: Casa
  let B: Casa

  beforeAll(async () => {
    admin = createClient<Database>(URL!, SERVICE!, { auth: { persistSession: false } })
    A = await novaCasa('a')
    B = await novaCasa('b')
  }, 90_000)

  afterAll(async () => {
    const erros = await limparTeste(admin, familias, usuarios)
    expect(erros).toEqual([])
    const { count: sobraFam } = await admin.from('families').select('id', { count: 'exact', head: true }).in('id', familias)
    const { count: sobraTx } = await admin.from('transactions').select('id', { count: 'exact', head: true }).in('family_id', familias)
    console.log(`sobras após limpeza: ${sobraFam} família(s), ${sobraTx} lançamento(s)`)
    expect([sobraFam, sobraTx]).toEqual([0, 0])
    for (const uid of usuarios) {
      const { data } = await admin.auth.admin.getUserById(uid)
      expect(data.user).toBeNull()
    }
  }, 90_000)

  // ------------------------------------------------------------ A-1
  it('A-1: "single" na 1ª parcela (mãe) apaga SÓ ela; as parcelas 2 e 3 ficam', async () => {
    const [p1, p2, p3] = await serie(A, 3)
    como(A)
    const r = await excluirLancamento(p1, 'single')
    expect(r).toEqual({ ok: true, dados: { excluidos: 1 } })
    expect(await vivos([p1, p2, p3])).toEqual([p2, p3])
  })

  it('depois de apagar a mãe, "series" a partir da parcela 2 ainda apaga o resto da série', async () => {
    const [p1, p2, p3] = await serie(A, 3)
    como(A)
    expect(await excluirLancamento(p1, 'single')).toEqual({ ok: true, dados: { excluidos: 1 } })
    expect(await excluirLancamento(p2, 'series')).toEqual({ ok: true, dados: { excluidos: 2 } })
    expect(await vivos([p1, p2, p3])).toEqual([])
  })

  it('lote (como a barra de ações): "single" na parcela 1 e depois na 2 deixa só a 3', async () => {
    const [p1, p2, p3] = await serie(A, 3)
    como(A)
    expect(await excluirLancamento(p1, 'single')).toEqual({ ok: true, dados: { excluidos: 1 } })
    expect(await excluirLancamento(p2, 'single')).toEqual({ ok: true, dados: { excluidos: 1 } })
    expect(await vivos([p1, p2, p3])).toEqual([p3])
  })

  it('DELETE direto por REST na mãe (sem a RPC) também só apaga a mãe', async () => {
    const [p1, p2, p3] = await serie(A, 3)
    const { data, error } = await A.cli.from('transactions').delete().eq('id', p1).select('id')
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(await vivos([p1, p2, p3])).toEqual([p2, p3])
  })

  // ------------------------------------------------------------ comportamento que já existia
  it('"series" a partir da mãe apaga as 3', async () => {
    const ids = await serie(A, 3)
    como(A)
    expect(await excluirLancamento(ids[0], 'series')).toEqual({ ok: true, dados: { excluidos: 3 } })
    expect(await vivos(ids)).toEqual([])
  })

  it('"series" a partir da parcela do meio apaga as 3', async () => {
    const ids = await serie(A, 3)
    como(A)
    expect(await excluirLancamento(ids[1], 'series')).toEqual({ ok: true, dados: { excluidos: 3 } })
    expect(await vivos(ids)).toEqual([])
  })

  it('"single" na parcela do meio apaga só ela', async () => {
    const [p1, p2, p3] = await serie(A, 3)
    como(A)
    expect(await excluirLancamento(p2, 'single')).toEqual({ ok: true, dados: { excluidos: 1 } })
    expect(await vivos([p1, p2, p3])).toEqual([p1, p3])
  })

  it('"single" na última parcela apaga só ela', async () => {
    const [p1, p2, p3] = await serie(A, 3)
    como(A)
    expect(await excluirLancamento(p3, 'single')).toEqual({ ok: true, dados: { excluidos: 1 } })
    expect(await vivos([p1, p2, p3])).toEqual([p1, p2])
  })

  it('lançamento avulso: "single" e "series" apagam só ele', async () => {
    const [x] = await serie(A, 1, 'Avulso 1')
    const [y] = await serie(A, 1, 'Avulso 2')
    como(A)
    expect(await excluirLancamento(x, 'single')).toEqual({ ok: true, dados: { excluidos: 1 } })
    expect(await excluirLancamento(y, 'series')).toEqual({ ok: true, dados: { excluidos: 1 } })
    expect(await vivos([x, y])).toEqual([])
  })

  it('id inexistente e escopo inválido continuam recusados', async () => {
    como(A)
    expect(await excluirLancamento('00000000-0000-4000-8000-000000000001', 'single'))
      .toMatchObject({ ok: false, erro: NAO_ENCONTRADO })
    expect((await excluirLancamento('nao-e-uuid')).ok).toBe(false)
    const [x] = await serie(A, 1, 'Escopo inválido')
    // Escopo fora do enum: o Zod recusa antes de chegar à RPC; a linha fica.
    expect((await excluirLancamento(x, 'tudo' as unknown as 'single')).ok).toBe(false)
    expect(await vivos([x])).toEqual([x])
  })

  // ------------------------------------------------------------ isolamento
  it('B não apaga parcela de A, nem "single" nem "series" (mãe e meio)', async () => {
    const ids = await serie(A, 3)
    como(B)
    for (const [id, escopo] of [[ids[0], 'single'], [ids[0], 'series'], [ids[1], 'series']] as const) {
      expect(await excluirLancamento(id, escopo)).toMatchObject({ ok: false, erro: NAO_ENCONTRADO })
    }
    expect(await vivos(ids)).toEqual(ids)
  })

  it('B-1: linha de A pendurada no id de B não some quando B apaga o próprio lançamento', async () => {
    const [txB] = await serie(B, 1, 'Lançamento de B')
    const { data: pendurada, error } = await A.cli.from('transactions').insert({
      family_id: A.familyId, type: 'despesa', description: 'pendurada em B', amount: 1, date: '2026-10-12',
      account_id: A.conta, created_by_member_id: A.memberId, paid_by_member_id: A.memberId,
      recurrence_parent_id: txB,
    }).select('id').single()
    expect(error).toBeNull()
    como(B)
    expect(await excluirLancamento(txB, 'single')).toEqual({ ok: true, dados: { excluidos: 1 } })
    expect(await vivos([pendurada!.id])).toEqual([pendurada!.id])
  })

  it('"series" de A partindo de linha pendurada no id de B nunca apaga a linha de B', async () => {
    const [txB] = await serie(B, 1, 'Outro de B')
    const { data: pendurada, error } = await A.cli.from('transactions').insert({
      family_id: A.familyId, type: 'despesa', description: 'pendurada em B 2', amount: 1, date: '2026-10-12',
      account_id: A.conta, created_by_member_id: A.memberId, paid_by_member_id: A.memberId,
      recurrence_parent_id: txB,
    }).select('id').single()
    expect(error).toBeNull()
    como(A)
    expect(await excluirLancamento(pendurada!.id, 'series')).toEqual({ ok: true, dados: { excluidos: 1 } })
    expect(await vivos([txB, pendurada!.id])).toEqual([txB])
  })
})
