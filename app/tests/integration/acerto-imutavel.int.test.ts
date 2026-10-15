// @vitest-environment node
//
// Acerto de contas imutável NO BANCO — achado M-2 do Sentinela R5
// (docs/auditoria/r5-sentinela.md). Antes da migration 00015 a trava
// "acerto não pode ser editado" só existia na Server Action
// (src/lib/esquemas-edicao-lancamento.ts). Com a própria sessão, um membro da
// família gravava direto em `transactions` por PostgREST: alterava valor/data
// de um acerto, desfazia o vínculo (settlement_to_member_id = null) ou forjava
// um acerto novo por INSERT — e a v_settlement mudava sem passar por nada.
//
// Mesmo arranjo de editar-lancamento.int.test.ts: só o createClient do servidor
// é trocado por um supabase-js autenticado como o usuário do teste;
// revalidatePath é neutralizado; after() só ENFILEIRA o push (não envia).
// Zod, RPCs, RLS, CHECKs, FKs e triggers são os reais.
//
// Uma família descartável (2 membros), APAGADA no afterAll pela limparTeste
// (lançamentos -> famílias -> usuários), com sobra conferida por id (L-019).
// Nunca toca na família real.
//
// Para rodar, de dentro de app/:
//   set -a && . ./.env.local && set +a
//   npx vitest run tests/integration/acerto-imutavel.int.test.ts
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { limparTeste } from './limpeza-utils.mjs'

const estado = vi.hoisted(() => ({ cliente: null as unknown, agendados: [] as unknown[] }))
vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }))
vi.mock('next/server', () => ({ after: (cb: unknown) => void estado.agendados.push(cb) }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => estado.cliente }))

import { registrarAcerto } from '@/actions/acerto'
import { excluirLancamento } from '@/actions/lancamento'
import { atualizarLancamento } from '@/actions/editar-lancamento'
import { excluirCategoria } from '@/actions/categorias'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const temAmbiente = Boolean(URL && ANON && SERVICE)
const FAMILIA_REAL = '9969d589-1645-403f-912a-1504bfeebb89'

type Cliente = SupabaseClient<Database>
type Linha = Database['public']['Tables']['transactions']['Row']
type Atualizacao = Database['public']['Tables']['transactions']['Update']
type Membro = { id: string; cli: Cliente }

// Mensagens dos RAISE do trigger da 00015 (fonte: a migration, L-020).
const BANCO_EDITAR = 'Acerto de contas não pode ser editado. Exclua e registre de novo.'
const BANCO_CRIAR = 'Acerto de contas só pode ser registrado pela função settle_up.'
// Mensagem da Server Action (src/lib/esquemas-edicao-lancamento.ts, M.ACERTO).
const ACTION_ACERTO = 'Acerto de contas não pode ser editado. Exclua e registre de novo.'

const stamp = Date.now()
let admin: Cliente
const usuarios: string[] = []
const familias: string[] = []

let familyId: string
let m1: Membro
let m2: Membro
let conta1: string
let conta2: string
let categoria: string

async function entrar(tag: string): Promise<Cliente> {
  const email = `acerto-imutavel-${tag}-${stamp}@example.com`
  const pass = 'Senha!Forte123'
  const { data: u, error } = await admin.auth.admin.createUser({ email, password: pass, email_confirm: true })
  if (error || !u.user) throw new Error(`createUser ${tag}: ${error?.message}`)
  usuarios.push(u.user.id)
  const cli = createClient<Database>(URL!, ANON!, { auth: { persistSession: false } })
  const { error: sErr } = await cli.auth.signInWithPassword({ email, password: pass })
  if (sErr) throw new Error(`signIn ${tag}: ${sErr.message}`)
  return cli
}

function como(m: Membro) {
  estado.cliente = m.cli
}

async function linha(id: string): Promise<Linha | null> {
  const { data, error } = await admin.from('transactions').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

/** Saldo de acerto por membro, lido COMO membro (security_invoker + RLS). */
async function saldos(): Promise<Record<string, number>> {
  const { data, error } = await m1.cli.from('v_settlement').select('member_id,balance').eq('family_id', familyId)
  if (error) throw new Error(error.message)
  return Object.fromEntries(data.map((r) => [r.member_id!, Number(r.balance)]))
}

/** Acerto real, pelo caminho legítimo (Server Action -> settle_up). m2 paga m1. */
async function acertoReal(valor = 45): Promise<string> {
  como(m2)
  const r = await registrarAcerto({ deMembroId: m2.id, paraMembroId: m1.id, valor, data: '2026-10-10' })
  if (!r.ok) throw new Error(`registrarAcerto: ${r.erro}`)
  return r.dados.acertoId
}

/** Transferência comum (não é acerto) entre as contas dos dois. */
async function transferenciaComum(): Promise<string> {
  const { data, error } = await m1.cli.rpc('save_transactions', {
    p_items: [{
      type: 'transferencia', description: 'Ajuda com o conserto', amount: 80, date: '2026-10-08',
      account_id: conta1, to_account_id: conta2, is_paid: true, paid_date: '2026-10-08',
    }],
  })
  if (error || !data?.[0]) throw new Error(`save_transactions: ${error?.message}`)
  return data[0].id
}

describe.skipIf(!temAmbiente)('acerto de contas imutável no banco (M-2)', () => {
  beforeAll(async () => {
    admin = createClient<Database>(URL!, SERVICE!, { auth: { persistSession: false } })
    const cli1 = await entrar('1')
    const { data: fam, error } = await cli1.rpc('create_family', {
      p_family_name: `Casa Acerto ${stamp}`, p_split_rule: 'equal', p_member_name: 'Membro 1', p_monthly_income: 1000,
    })
    if (error || !fam?.[0]) throw new Error(`create_family: ${error?.message}`)
    familyId = fam[0].family_id
    if (familyId === FAMILIA_REAL) throw new Error('create_family devolveu a família real — abortando')
    familias.push(familyId)
    m1 = { id: fam[0].member_id, cli: cli1 }

    const cli2 = await entrar('2')
    const { data: f } = await admin.from('families').select('join_code').eq('id', familyId).single()
    const { data: j, error: jErr } = await cli2.rpc('join_family', { p_join_code: f!.join_code, p_member_name: 'Membro 2' })
    if (jErr || !j?.[0]) throw new Error(`join_family: ${jErr?.message}`)
    m2 = { id: j[0].member_id, cli: cli2 }

    const { data: contas } = await admin.from('accounts').select('id,owner_member_id')
      .eq('family_id', familyId).eq('type', 'corrente').order('id')
    conta1 = contas!.find((c) => c.owner_member_id === m1.id)!.id
    conta2 = contas!.find((c) => c.owner_member_id === m2.id)!.id

    // Desempate por id (L-010).
    const { data: cats } = await admin.from('categories').select('id')
      .eq('family_id', familyId).eq('type', 'despesa').order('id').limit(1)
    categoria = cats![0].id
  }, 90_000)

  beforeEach(() => {
    estado.agendados.length = 0
  })

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

  // ------------------------------------------------------------ o achado: UPDATE direto
  // Cada patch é um jeito de mexer no saldo (ou de apagar o rastro) sem passar
  // pela Action. Todos têm de ser recusados pelo banco, com a linha intacta.
  const patches: [string, (m: { m1: Membro; m2: Membro }) => Atualizacao][] = [
    ['amount (valor)', () => ({ amount: 999 })],
    ['description', () => ({ description: 'outra coisa' })],
    ['date', () => ({ date: '2026-01-01' })],
    ['is_paid = false (tira da v_settlement)', () => ({ is_paid: false, paid_date: null })],
    ['settlement_to_member_id = null (desfaz o acerto)', () => ({ settlement_to_member_id: null })],
    ['paid_by_member_id / settlement_to_member_id invertidos', (m) => ({ paid_by_member_id: m.m1.id, settlement_to_member_id: m.m2.id })],
  ]

  for (const [nome, patch] of patches) {
    it(`UPDATE direto por REST em acerto (${nome}) é recusado pelo banco; linha e saldo intactos`, async () => {
      const id = await acertoReal()
      const antes = await linha(id)
      const saldoAntes = await saldos()
      // Quem recebe é quem teria motivo para "desfazer"; quem paga, para inflar.
      for (const quem of [m1, m2]) {
        const { data, error } = await quem.cli.from('transactions').update(patch({ m1, m2 })).eq('id', id).select('id')
        expect({ code: error?.code, message: error?.message, data }).toEqual({ code: '42501', message: BANCO_EDITAR, data: null })
      }
      expect(await linha(id)).toEqual(antes)
      expect(await saldos()).toEqual(saldoAntes)
    })
  }

  it('INSERT direto por REST de um acerto forjado é recusado; v_settlement intacta', async () => {
    const saldoAntes = await saldos()
    const { data, error } = await m1.cli.from('transactions').insert({
      family_id: familyId, type: 'transferencia', description: 'Acerto de contas', amount: 999, date: '2026-10-10',
      account_id: conta1, to_account_id: conta2, created_by_member_id: m1.id, paid_by_member_id: m1.id,
      settlement_to_member_id: m2.id, is_paid: true, paid_date: '2026-10-10',
    }).select('id')
    expect({ code: error?.code, message: error?.message, data }).toEqual({ code: '42501', message: BANCO_CRIAR, data: null })
    expect(await saldos()).toEqual(saldoAntes)
  })

  it('UPDATE direto que transforma uma transferência comum em acerto é recusado', async () => {
    const id = await transferenciaComum()
    const antes = await linha(id)
    const saldoAntes = await saldos()
    const { data, error } = await m1.cli.from('transactions')
      .update({ settlement_to_member_id: m2.id }).eq('id', id).select('id')
    expect({ code: error?.code, message: error?.message, data }).toEqual({ code: '42501', message: BANCO_CRIAR, data: null })
    expect(await linha(id)).toEqual(antes)
    expect(await saldos()).toEqual(saldoAntes)
  })

  // ------------------------------------------------------------ o que continua funcionando
  it('registrarAcerto (Action -> settle_up) continua gravando o acerto e abatendo o saldo', async () => {
    const antes = await saldos()
    const id = await acertoReal(30)
    expect(await linha(id)).toMatchObject({
      type: 'transferencia', amount: 30, paid_by_member_id: m2.id, settlement_to_member_id: m1.id, is_paid: true,
    })
    const depois = await saldos()
    // m2 pagou 30 a m1: m2 sobe 30, m1 desce 30.
    expect(Math.round((depois[m2.id] - antes[m2.id]) * 100)).toBe(3000)
    expect(Math.round((depois[m1.id] - antes[m1.id]) * 100)).toBe(-3000)
    expect(estado.agendados).toHaveLength(1)
  })

  it('excluirLancamento de um acerto continua permitido: "single" apaga 1 linha e o saldo volta', async () => {
    const saldoAntes = await saldos()
    const id = await acertoReal(20)
    como(m1)
    expect(await excluirLancamento(id, 'single')).toEqual({ ok: true, dados: { excluidos: 1 } })
    expect(await linha(id)).toBeNull()
    expect(await saldos()).toEqual(saldoAntes)
  })

  it('DELETE direto por REST de um acerto continua permitido (apaga 1 linha)', async () => {
    const id = await acertoReal(10)
    const { data, error } = await m2.cli.from('transactions').delete().eq('id', id).select('id')
    expect(error).toBeNull()
    expect(data).toEqual([{ id }])
    expect(await linha(id)).toBeNull()
  })

  it('atualizarLancamento recusa acerto na Action (antes do banco) e segue editando lançamento comum', async () => {
    const acerto = await acertoReal()
    const antes = await linha(acerto)
    como(m1)
    const recusa = await atualizarLancamento({
      id: acerto, tipo: 'transferencia', descricao: 'editado', valor: 1, data: '2026-10-10',
      contaId: conta2, contaDestinoId: conta1, pagoPorId: m2.id, estaPago: true, dataDoPagamento: '2026-10-10',
    })
    expect(recusa).toEqual({ ok: false, erro: ACTION_ACERTO, camposComErro: { formulario: [ACTION_ACERTO] } })
    expect(await linha(acerto)).toEqual(antes)

    const { data: d, error } = await m1.cli.rpc('save_transactions', {
      p_items: [{ type: 'despesa', description: 'Mercado', amount: 100, date: '2026-10-05', account_id: conta1, category_id: categoria, is_paid: false }],
    })
    if (error || !d?.[0]) throw new Error(`save_transactions: ${error?.message}`)
    const ok = await atualizarLancamento({
      id: d[0].id, tipo: 'despesa', descricao: 'Mercado editado', valor: 123.45, data: '2026-10-05',
      contaId: conta1, categoriaId: categoria, pagoPorId: m1.id, estaPago: false, dataDoPagamento: null,
    })
    expect(ok).toEqual({ ok: true, dados: undefined })
    expect(await linha(d[0].id)).toMatchObject({ description: 'Mercado editado', amount: 123.45 })
  })

  it('UPDATE direto por REST em transferência comum continua permitido (o trigger só olha acerto)', async () => {
    const id = await transferenciaComum()
    const { data, error } = await m1.cli.from('transactions').update({ description: 'Conserto do carro' }).eq('id', id).select('id')
    expect(error).toBeNull()
    expect(data).toEqual([{ id }])
    expect(await linha(id)).toMatchObject({ description: 'Conserto do carro', settlement_to_member_id: null })
  })

  it('excluirCategoria funciona mesmo com acerto apontando para ela (o SET NULL da FK não é barrado)', async () => {
    const acerto = await acertoReal()
    // Só o service_role consegue pôr categoria num acerto: é o cenário de um
    // acerto antigo que ganhou categoria antes desta trava.
    const { error: eCat } = await admin.from('categories').insert({ family_id: familyId, name: `Cat acerto ${stamp}`, type: 'despesa' })
    if (eCat) throw new Error(eCat.message)
    const { data: cat } = await admin.from('categories').select('id').eq('family_id', familyId).eq('name', `Cat acerto ${stamp}`).single()
    const { error: eUp } = await admin.from('transactions').update({ category_id: cat!.id }).eq('id', acerto)
    expect(eUp).toBeNull()
    como(m1)
    expect(await excluirCategoria({ id: cat!.id })).toEqual({ ok: true, dados: { lancamentosAfetados: 1 } })
    expect(await linha(acerto)).toMatchObject({ category_id: null, settlement_to_member_id: m1.id, amount: 45 })
  })
})
