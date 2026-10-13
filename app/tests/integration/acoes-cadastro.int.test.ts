// @vitest-environment node
//
// As Server Actions de cadastro, de verdade, contra o banco HOSPEDADO.
//
// O que é substituído: só o createClient do servidor (que lê cookie do Next)
// por um cliente supabase-js já autenticado como o usuário do teste, e o
// revalidatePath (que exige o runtime do Next). Todo o resto — Zod, resolução
// da família, consultas, RLS, índices, FKs — é o código e o banco reais.
//
// Sem as chaves no ambiente o arquivo é PULADO, para que `npx vitest run` não
// dependa de rede. Para rodar, de dentro de app/:
//   set -a && . ./.env.local && set +a
//   npx vitest run tests/integration/acoes-cadastro.int.test.ts
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const estado = vi.hoisted(() => ({ cliente: null as unknown }))
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => estado.cliente }))

import {
  adicionarCategorias,
  alterarTipoCategoria,
  arquivarCategoria,
  contarUsoCategoria,
  excluirCategoria,
  renomearCategoria,
} from '@/actions/categorias'
import {
  adicionarFormasPagamento,
  arquivarFormaPagamento,
  contarUsoFormaPagamento,
  excluirFormaPagamento,
  renomearFormaPagamento,
} from '@/actions/formas-pagamento'
import { arquivarConta, criarConta, editarConta } from '@/actions/contas'
import { LIMITE_NOMES } from '@/lib/lista-nomes'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const temAmbiente = Boolean(URL && ANON && SERVICE)

type Cliente = SupabaseClient<Database>
type Usuario = { tag: string; uid: string; cli: Cliente; familyId: string; memberId: string; accountId: string }

const stamp = Date.now()
let admin: Cliente
const usuarios: string[] = []
const familias: string[] = []

async function novaCasa(tag: string): Promise<Usuario> {
  const email = `acoes-${tag}-${stamp}@example.com`
  const pass = 'Senha!Forte123'
  const { data: u, error } = await admin.auth.admin.createUser({ email, password: pass, email_confirm: true })
  if (error || !u.user) throw new Error(`createUser ${tag}: ${error?.message}`)
  usuarios.push(u.user.id)
  const cli = createClient<Database>(URL!, ANON!, { auth: { persistSession: false } })
  const { error: sErr } = await cli.auth.signInWithPassword({ email, password: pass })
  if (sErr) throw new Error(`signIn ${tag}: ${sErr.message}`)
  const { data: fam, error: fErr } = await cli.rpc('create_family', {
    p_family_name: `Casa ${tag}`, p_split_rule: 'equal', p_member_name: `Membro ${tag}`, p_monthly_income: 1000,
  })
  if (fErr || !fam?.[0]) throw new Error(`create_family ${tag}: ${fErr?.message}`)
  familias.push(fam[0].family_id)
  const { data: acc } = await cli.from('accounts').select('id').eq('family_id', fam[0].family_id).limit(1)
  return { tag, uid: u.user.id, cli, familyId: fam[0].family_id, memberId: fam[0].member_id, accountId: acc![0].id }
}

function como(u: Usuario) {
  estado.cliente = u.cli
}

// Filtra por tipo: o mesmo nome pode existir em tipos diferentes (é o que o
// teste 'o mesmo nome em OUTRO tipo' cria de propósito).
async function idDaCategoria(u: Usuario, nome: string, tipo = 'despesa') {
  const { data } = await admin.from('categories').select('id').eq('family_id', u.familyId).eq('name', nome).eq('type', tipo).single()
  return data!.id
}

async function lancar(u: Usuario, extra: Partial<Database['public']['Tables']['transactions']['Insert']>) {
  const { data, error } = await u.cli.from('transactions').insert({
    family_id: u.familyId, account_id: u.accountId,
    created_by_member_id: u.memberId, paid_by_member_id: u.memberId,
    type: 'despesa', description: 'Teste de action', amount: 10, date: '2026-10-10',
    ...extra,
  }).select('id').single()
  if (error) throw new Error(`lancar: ${error.message}`)
  return data.id
}

describe.skipIf(!temAmbiente)('Server Actions de cadastro contra o banco real', () => {
  let A: Usuario
  let B: Usuario

  beforeAll(async () => {
    admin = createClient<Database>(URL!, SERVICE!, { auth: { persistSession: false } })
    A = await novaCasa('a')
    B = await novaCasa('b')
  }, 60_000)

  // Lançamentos -> famílias -> usuários, contando o que de fato saiu.
  afterAll(async () => {
    const erros: string[] = []
    for (const fid of familias) {
      const { error } = await admin.from('transactions').delete().eq('family_id', fid)
      if (error) erros.push(`transactions: ${error.message}`)
    }
    for (const fid of familias) {
      const { error } = await admin.from('families').delete().eq('id', fid)
      if (error) erros.push(`family: ${error.message}`)
    }
    for (const uid of usuarios) {
      const { error } = await admin.auth.admin.deleteUser(uid)
      if (error) erros.push(`user: ${error.message}`)
    }
    expect(erros).toEqual([])
  }, 60_000)

  // ------------------------------------------------------------------ categorias
  describe('categorias', () => {
    it('lote com duplicata e acento: cria os novos, ignora o que já existe ativo', async () => {
      como(A)
      // "saude" já existe como "Saúde" (padrão da família); "pet" repete "Pet".
      const r = await adicionarCategorias({ nomes: 'Pet, Presentes ,, pet, saude, Viagem', tipo: 'despesa' })
      expect(r.ok).toBe(true)
      if (!r.ok) return
      expect(r.dados.criadas.map((c) => c.nome)).toEqual(['Pet', 'Presentes', 'Viagem'])
      expect(r.dados.ignoradas).toEqual(['saude'])

      const { data } = await admin.from('categories').select('name,sort_order')
        .eq('family_id', A.familyId).in('name', ['Pet', 'Presentes', 'Viagem']).order('sort_order')
      expect(data!.map((c) => c.name)).toEqual(['Pet', 'Presentes', 'Viagem'])
      const { data: padrao } = await admin.from('categories').select('sort_order')
        .eq('family_id', A.familyId).eq('name', 'Outros').single()
      expect(data![0].sort_order).toBeGreaterThan(padrao!.sort_order)
    })

    it('repetir o lote não cria nada e devolve tudo em ignoradas', async () => {
      como(A)
      const r = await adicionarCategorias({ nomes: 'PET, viagem', tipo: 'despesa' })
      expect(r).toEqual({ ok: true, dados: { criadas: [], ignoradas: ['PET', 'viagem'] } })
    })

    it('o mesmo nome em OUTRO tipo é criado', async () => {
      como(A)
      const r = await adicionarCategorias({ nomes: 'Pet', tipo: 'receita' })
      expect(r.ok && r.dados.criadas.map((c) => c.nome)).toEqual(['Pet'])
    })

    it(`lote com ${LIMITE_NOMES + 1} nomes é recusado no campo nomes`, async () => {
      como(A)
      const nomes = Array.from({ length: LIMITE_NOMES + 1 }, (_, i) => `N${i}`).join(',')
      const r = await adicionarCategorias({ nomes, tipo: 'despesa' })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.camposComErro?.nomes?.length).toBe(1)
    })

    it('renomear para nome já ativo (sem acento) é recusado em português', async () => {
      como(A)
      const id = await idDaCategoria(A, 'Presentes')
      const r = await renomearCategoria({ id, nome: 'saúde' })
      expect(r.ok).toBe(false)
      if (!r.ok) {
        expect(r.erro).toBe('Já existe uma categoria ativa com esse nome.')
        expect(r.camposComErro?.nome).toEqual(['Já existe uma categoria ativa com esse nome.'])
      }
    })

    it('renomear para nome livre funciona', async () => {
      como(A)
      const id = await idDaCategoria(A, 'Presentes')
      expect(await renomearCategoria({ id, nome: '  Presentes   de Natal ' })).toEqual({ ok: true, dados: undefined })
      const { data } = await admin.from('categories').select('name').eq('id', id).single()
      expect(data!.name).toBe('Presentes de Natal')
    })

    it('alterar o tipo de categoria EM USO é recusado', async () => {
      como(A)
      const id = await idDaCategoria(A, 'Pet')
      await lancar(A, { category_id: id })
      const r = await alterarTipoCategoria({ id, tipo: 'investimento' })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.erro).toMatch(/1 lançamento/)
      const { data } = await admin.from('categories').select('type').eq('id', id).single()
      expect(data!.type).toBe('despesa')
    })

    it('alterar o tipo de categoria sem uso funciona', async () => {
      como(A)
      const id = await idDaCategoria(A, 'Presentes de Natal')
      expect((await alterarTipoCategoria({ id, tipo: 'todos' })).ok).toBe(true)
      const { data } = await admin.from('categories').select('type').eq('id', id).single()
      expect(data!.type).toBe('todos')
    })

    it('arquivar libera o nome; reativar com nome ocupado é recusado', async () => {
      como(A)
      const velha = await idDaCategoria(A, 'Viagem')
      expect((await arquivarCategoria({ id: velha, arquivar: true })).ok).toBe(true)
      const nova = await adicionarCategorias({ nomes: 'viagem', tipo: 'despesa' })
      expect(nova.ok && nova.dados.criadas).toHaveLength(1)

      const r = await arquivarCategoria({ id: velha, arquivar: false })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.erro).toMatch(/Já existe uma categoria ativa com esse nome/)
    })

    it('contarUso e excluir: lançamento fica sem categoria, orçamento sai junto', async () => {
      como(A)
      const id = await idDaCategoria(A, 'Pet')
      const { data: tx } = await admin.from('transactions').select('id').eq('category_id', id).single()
      await A.cli.from('category_budgets').insert({ family_id: A.familyId, category_id: id, amount: 200, month: '2026-10' })

      expect(await contarUsoCategoria({ id })).toEqual({ ok: true, dados: { lancamentos: 1, orcamentos: 1 } })
      expect(await excluirCategoria({ id })).toEqual({ ok: true, dados: { lancamentosAfetados: 1 } })

      const { data: depois } = await admin.from('transactions').select('family_id,category_id').eq('id', tx!.id).single()
      expect(depois).toEqual({ family_id: A.familyId, category_id: null })
      const { count } = await admin.from('category_budgets').select('*', { count: 'exact', head: true }).eq('category_id', id)
      expect(count).toBe(0)
    })

    it('usuário de OUTRA família não renomeia, não arquiva, não exclui, não conta', async () => {
      const id = await idDaCategoria(A, 'Presentes de Natal', 'todos')
      como(B)
      const esperado = { ok: false, erro: 'Categoria não encontrada.' }
      expect(await renomearCategoria({ id, nome: 'Invadida' })).toEqual(esperado)
      expect(await alterarTipoCategoria({ id, tipo: 'receita' })).toEqual(esperado)
      expect(await arquivarCategoria({ id, arquivar: true })).toEqual(esperado)
      expect(await excluirCategoria({ id })).toEqual(esperado)
      expect(await contarUsoCategoria({ id })).toEqual(esperado)
      const { data } = await admin.from('categories').select('name,type,archived_at').eq('id', id).single()
      expect(data).toEqual({ name: 'Presentes de Natal', type: 'todos', archived_at: null })
    })
  })

  // ------------------------------------------------------- formas de pagamento
  describe('formas de pagamento', () => {
    async function idDaForma(u: Usuario, nome: string) {
      const { data } = await admin.from('payment_methods').select('id').eq('family_id', u.familyId).eq('name', nome).single()
      return data!.id
    }

    it('lote: "Debito" é ignorado (já existe "Débito"), "vr" repete "VR"', async () => {
      como(A)
      const r = await adicionarFormasPagamento({ nomes: 'Debito, VR, vr, Vale' })
      expect(r.ok).toBe(true)
      if (!r.ok) return
      expect(r.dados.criadas.map((f) => f.nome)).toEqual(['VR', 'Vale'])
      expect(r.dados.ignoradas).toEqual(['Debito'])
    })

    it('renomear para nome já ativo é recusado em português', async () => {
      como(A)
      const r = await renomearFormaPagamento({ id: await idDaForma(A, 'VR'), nome: 'PIX' })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.erro).toBe('Já existe uma forma de pagamento ativa com esse nome.')
    })

    it('contarUso e excluir em uso preservam o lançamento', async () => {
      como(A)
      const id = await idDaForma(A, 'VR')
      const txId = await lancar(A, { payment_method_id: id })
      expect(await contarUsoFormaPagamento({ id })).toEqual({ ok: true, dados: { lancamentos: 1 } })
      expect(await excluirFormaPagamento({ id })).toEqual({ ok: true, dados: { lancamentosAfetados: 1 } })
      const { data } = await admin.from('transactions').select('family_id,payment_method_id').eq('id', txId).single()
      expect(data).toEqual({ family_id: A.familyId, payment_method_id: null })
    })

    it('arquivar e reativar', async () => {
      como(A)
      const id = await idDaForma(A, 'Vale')
      expect((await arquivarFormaPagamento({ id, arquivar: true })).ok).toBe(true)
      expect((await arquivarFormaPagamento({ id, arquivar: false })).ok).toBe(true)
      const { data } = await admin.from('payment_methods').select('archived_at').eq('id', id).single()
      expect(data!.archived_at).toBeNull()
    })

    it('usuário de OUTRA família não renomeia, não arquiva, não exclui', async () => {
      const id = await idDaForma(A, 'Vale')
      como(B)
      const esperado = { ok: false, erro: 'Forma de pagamento não encontrada.' }
      expect(await renomearFormaPagamento({ id, nome: 'Invadida' })).toEqual(esperado)
      expect(await arquivarFormaPagamento({ id, arquivar: true })).toEqual(esperado)
      expect(await excluirFormaPagamento({ id })).toEqual(esperado)
      expect(await contarUsoFormaPagamento({ id })).toEqual(esperado)
      const { data } = await admin.from('payment_methods').select('name,archived_at').eq('id', id).single()
      expect(data).toEqual({ name: 'Vale', archived_at: null })
    })
  })

  // ---------------------------------------------------------------------- contas
  describe('contas', () => {
    let cartaoId = ''

    it('cartão sem dias é recusado antes do banco, com erro por campo', async () => {
      como(A)
      const r = await criarConta({ nome: 'Nubank', tipo: 'cartao', saldoInicial: 0 })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(Object.keys(r.camposComErro ?? {}).sort()).toEqual(['diaFechamento', 'diaVencimento'])
    })

    it('cartão com dias é criado na família do usuário', async () => {
      como(A)
      const r = await criarConta({ nome: 'Nubank', tipo: 'cartao', saldoInicial: -50, diaFechamento: 5, diaVencimento: 12 })
      expect(r.ok).toBe(true)
      if (!r.ok) return
      cartaoId = r.dados.id
      const { data } = await admin.from('accounts').select('family_id,type,closing_day,due_day,initial_balance').eq('id', cartaoId).single()
      expect(data).toEqual({ family_id: A.familyId, type: 'cartao', closing_day: 5, due_day: 12, initial_balance: -50 })
    })

    it('editar: tirar o dia de um cartão é recusado no campo', async () => {
      como(A)
      const r = await editarConta({ id: cartaoId, diaFechamento: null })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.camposComErro?.diaFechamento).toHaveLength(1)
    })

    it('editar: nome e dias de um cartão', async () => {
      como(A)
      expect((await editarConta({ id: cartaoId, nome: 'Nubank Roxo', diaVencimento: 15 })).ok).toBe(true)
      const { data } = await admin.from('accounts').select('name,closing_day,due_day').eq('id', cartaoId).single()
      expect(data).toEqual({ name: 'Nubank Roxo', closing_day: 5, due_day: 15 })
    })

    it('editar: conta corrente não recebe dia de fechamento', async () => {
      como(A)
      const r = await editarConta({ id: A.accountId, diaFechamento: 3 })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.camposComErro?.diaFechamento).toEqual(['Só cartão de crédito tem dia de fechamento.'])
    })

    it('arquivar e reativar', async () => {
      como(A)
      expect((await arquivarConta({ id: cartaoId, arquivar: true })).ok).toBe(true)
      const { data } = await admin.from('accounts').select('archived_at').eq('id', cartaoId).single()
      expect(data!.archived_at).not.toBeNull()
      expect((await arquivarConta({ id: cartaoId, arquivar: false })).ok).toBe(true)
    })

    it('usuário de OUTRA família não edita nem arquiva a conta', async () => {
      como(B)
      const esperado = { ok: false, erro: 'Conta não encontrada.' }
      expect(await editarConta({ id: cartaoId, nome: 'Invadida' })).toEqual(esperado)
      expect(await arquivarConta({ id: cartaoId, arquivar: true })).toEqual(esperado)
      const { data } = await admin.from('accounts').select('name,archived_at').eq('id', cartaoId).single()
      expect(data).toEqual({ name: 'Nubank Roxo', archived_at: null })
    })
  })
})
