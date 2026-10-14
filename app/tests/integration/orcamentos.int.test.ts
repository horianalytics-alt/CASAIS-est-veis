// @vitest-environment node
//
// Server Actions de orçamento por categoria (definirOrcamento /
// excluirOrcamento, P-010), de verdade, contra o banco HOSPEDADO — mesmo
// arranjo de grupos-categoria.int.test.ts: só o createClient do servidor
// (cookie do Next) é trocado por um cliente supabase-js já autenticado como o
// usuário do teste, e o revalidatePath é neutralizado. Zod, resolução da
// família, consultas, RLS, UNIQUE e FKs são os reais.
//
// Duas camadas de isolamento são provadas separadamente:
//   1. a ACTION recusa categoria/orçamento de outra família antes do banco;
//   2. o RLS de category_budgets (00002, reescrito em 00006) barra o cliente
//      de B mesmo quando ele fala direto com o PostgREST, sem action.
//
// Duas famílias descartáveis, criadas aqui e APAGADAS no afterAll pela
// limparTeste (lançamentos -> famílias -> usuários; a família leva categorias e
// orçamentos por CASCADE). Nunca toca na família real.
//
// Sem as chaves no ambiente o arquivo é PULADO. Para rodar, de dentro de app/:
//   set -a && . ./.env.local && set +a
//   npx vitest run tests/integration/orcamentos.int.test.ts
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { limparTeste } from './limpeza-utils.mjs'

const estado = vi.hoisted(() => ({ cliente: null as unknown }))
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => estado.cliente }))

import { definirOrcamento, excluirOrcamento } from '@/actions/orcamentos'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const temAmbiente = Boolean(URL && ANON && SERVICE)
// A família real nunca pode aparecer entre as criadas/apagadas por este teste.
const FAMILIA_REAL = '9969d589-1645-403f-912a-1504bfeebb89'

type Cliente = SupabaseClient<Database>
type Usuario = { tag: string; cli: Cliente; familyId: string; categoriaId: string }

const stamp = Date.now()
let admin: Cliente
const usuarios: string[] = []
const familias: string[] = []

const CATEGORIA_NAO_ENCONTRADA = 'Categoria não encontrada.'
const ORCAMENTO_NAO_ENCONTRADO = 'Orçamento não encontrado.'
const SESSAO = 'Sua sessão expirou. Entre de novo.'

async function novaCasa(tag: string): Promise<Usuario> {
  const email = `orcamentos-${tag}-${stamp}@example.com`
  const pass = 'Senha!Forte123'
  const { data: u, error } = await admin.auth.admin.createUser({ email, password: pass, email_confirm: true })
  if (error || !u.user) throw new Error(`createUser ${tag}: ${error?.message}`)
  usuarios.push(u.user.id)
  const cli = createClient<Database>(URL!, ANON!, { auth: { persistSession: false } })
  const { error: sErr } = await cli.auth.signInWithPassword({ email, password: pass })
  if (sErr) throw new Error(`signIn ${tag}: ${sErr.message}`)
  const { data: fam, error: fErr } = await cli.rpc('create_family', {
    p_family_name: `Casa Orcamentos ${tag} ${stamp}`, p_split_rule: 'equal', p_member_name: `Membro ${tag}`, p_monthly_income: 1000,
  })
  if (fErr || !fam?.[0]) throw new Error(`create_family ${tag}: ${fErr?.message}`)
  if (fam[0].family_id === FAMILIA_REAL) throw new Error('create_family devolveu a família real — abortando')
  familias.push(fam[0].family_id)
  // Desempate por id (L-010): a mesma categoria em toda chamada.
  const { data: cat } = await admin.from('categories').select('id')
    .eq('family_id', fam[0].family_id).eq('type', 'despesa').order('id').limit(1).single()
  if (!cat) throw new Error(`família ${tag} sem categoria de despesa padrão`)
  return { tag, cli, familyId: fam[0].family_id, categoriaId: cat.id }
}

function como(u: Usuario | null) {
  estado.cliente = u ? u.cli : createClient<Database>(URL!, ANON!, { auth: { persistSession: false } })
}

async function orcamentosDa(u: Usuario) {
  const { data, error } = await admin.from('category_budgets')
    .select('id,family_id,category_id,month,amount').eq('family_id', u.familyId).order('month').order('id')
  if (error) throw new Error(error.message)
  return data
}

describe.skipIf(!temAmbiente)('Server Actions de orçamento contra o banco real', () => {
  let A: Usuario
  let B: Usuario
  let idOutubroA = ''

  beforeAll(async () => {
    admin = createClient<Database>(URL!, SERVICE!, { auth: { persistSession: false } })
    A = await novaCasa('a')
    B = await novaCasa('b')
  }, 60_000)

  afterAll(async () => {
    const erros = await limparTeste(admin, familias, usuarios)
    expect(erros).toEqual([])
    // Nada destas famílias pode sobrar, em nenhuma tabela que o teste tocou.
    const { count: sobraFam } = await admin.from('families').select('id', { count: 'exact', head: true }).in('id', familias)
    const { count: sobraOrc } = await admin.from('category_budgets').select('id', { count: 'exact', head: true }).in('family_id', familias)
    console.log(`sobras após limpeza: ${sobraFam} família(s), ${sobraOrc} orçamento(s)`)
    expect([sobraFam, sobraOrc]).toEqual([0, 0])
  }, 60_000)

  // -------------------------------------------------------------- definir
  it('cria o orçamento na família de quem chama e devolve o que foi gravado', async () => {
    como(A)
    const r = await definirOrcamento({ categoriaId: A.categoriaId, mes: '2026-10', valor: 450.5 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    idOutubroA = r.dados.id
    expect(r.dados).toEqual({ id: idOutubroA, categoriaId: A.categoriaId, mes: '2026-10', valor: 450.5 })
    expect(await orcamentosDa(A)).toEqual([
      { id: idOutubroA, family_id: A.familyId, category_id: A.categoriaId, month: '2026-10', amount: 450.5 },
    ])
  })

  it('definir de novo a mesma categoria e mês ATUALIZA a mesma linha (mesmo id, sem duplicar)', async () => {
    como(A)
    const r = await definirOrcamento({ categoriaId: A.categoriaId, mes: '2026-10', valor: 600 })
    expect(r).toEqual({ ok: true, dados: { id: idOutubroA, categoriaId: A.categoriaId, mes: '2026-10', valor: 600 } })
    const linhas = await orcamentosDa(A)
    expect(linhas).toHaveLength(1)
    expect(linhas[0]).toMatchObject({ id: idOutubroA, amount: 600 })
  })

  it('outro mês da mesma categoria é OUTRA linha', async () => {
    como(A)
    const r = await definirOrcamento({ categoriaId: A.categoriaId, mes: '2026-11', valor: 19.99 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.dados.id).not.toBe(idOutubroA)
    expect((await orcamentosDa(A)).map((l) => [l.month, l.amount])).toEqual([['2026-10', 600], ['2026-11', 19.99]])
  })

  it('valor com ruído binário de 2 casas (0.1 + 0.2) grava 0.3, não é recusado', async () => {
    como(A)
    const r = await definirOrcamento({ categoriaId: A.categoriaId, mes: '2026-12', valor: 0.1 + 0.2 })
    expect(r.ok && r.dados.valor).toBe(0.3)
    const linha = (await orcamentosDa(A)).find((l) => l.month === '2026-12')
    expect(linha?.amount).toBe(0.3)
  })

  // ------------------------------------------------------------ validação
  const valoresInvalidos: [string, unknown, string][] = [
    ['zero', 0, 'O valor precisa ser maior que zero.'],
    ['negativo', -10, 'O valor precisa ser maior que zero.'],
    ['negativo com 3 casas', -1.005, 'O valor precisa ser maior que zero.'],
    ['3 casas (1.005, borda do P-009)', 1.005, 'Use no máximo 2 casas decimais.'],
    ['3 casas (10.075)', 10.075, 'Use no máximo 2 casas decimais.'],
    ['NaN', Number.NaN, 'Valor inválido.'],
    ['Infinity', Number.POSITIVE_INFINITY, 'Valor inválido.'],
    ['acima do teto', 100_000_000, 'Esse valor é alto demais.'],
    ['texto', '100', 'Valor inválido.'],
    ['ausente', undefined, 'Informe o valor.'],
  ]
  for (const [rotulo, valor, mensagem] of valoresInvalidos) {
    it(`valor ${rotulo} é recusado no campo valor com UMA mensagem, sem gravar`, async () => {
      como(A)
      const antes = await orcamentosDa(A)
      const r = await definirOrcamento({ categoriaId: A.categoriaId, mes: '2027-01', valor: valor as number })
      expect(r.ok).toBe(false)
      if (!r.ok) {
        expect(r.erro).toBe('Confira os campos destacados.')
        expect(r.camposComErro?.valor).toEqual([mensagem])
      }
      expect(await orcamentosDa(A)).toEqual(antes)
    })
  }

  it('o teto exato (99.999.999,99) é aceito', async () => {
    como(A)
    const r = await definirOrcamento({ categoriaId: A.categoriaId, mes: '2027-02', valor: 99_999_999.99 })
    expect(r.ok && r.dados.valor).toBe(99_999_999.99)
  })

  const mesesInvalidos = ['2026-13', '2026-00', '2026-1', '1999-12', '2200-01', '2026-10-01', '10/2026', '', 'abc']
  for (const mes of mesesInvalidos) {
    it(`mês "${mes}" é recusado no campo mes`, async () => {
      como(A)
      const r = await definirOrcamento({ categoriaId: A.categoriaId, mes, valor: 10 })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.camposComErro?.mes).toEqual(['Mês inválido.'])
    })
  }

  it('meses válidos nas bordas (2000-01 e 2199-12) são aceitos', async () => {
    como(A)
    expect((await definirOrcamento({ categoriaId: A.categoriaId, mes: '2000-01', valor: 1 })).ok).toBe(true)
    expect((await definirOrcamento({ categoriaId: A.categoriaId, mes: ' 2199-12 ', valor: 1 })).ok).toBe(true)
    const meses = (await orcamentosDa(A)).map((l) => l.month)
    expect(meses).toContain('2000-01')
    expect(meses).toContain('2199-12')
  })

  it('categoriaId que não é uuid é recusado no campo categoriaId', async () => {
    como(A)
    const r = await definirOrcamento({ categoriaId: 'nao-e-uuid', mes: '2026-10', valor: 10 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.camposComErro?.categoriaId).toEqual(['Escolha uma categoria.'])
  })

  it('categoria inexistente (uuid válido) cai em "Categoria não encontrada."', async () => {
    como(A)
    expect(await definirOrcamento({ categoriaId: randomUUID(), mes: '2026-10', valor: 10 }))
      .toEqual({ ok: false, erro: CATEGORIA_NAO_ENCONTRADA })
  })

  it('sem sessão: as duas actions pedem login', async () => {
    como(null)
    expect(await definirOrcamento({ categoriaId: A.categoriaId, mes: '2026-10', valor: 10 })).toEqual({ ok: false, erro: SESSAO })
    expect(await excluirOrcamento({ id: idOutubroA })).toEqual({ ok: false, erro: SESSAO })
  })

  // ------------------------------------------- isolamento — camada 1: action
  it('B não define orçamento numa categoria de A (nem cria na própria família apontando para ela)', async () => {
    como(B)
    const antesA = await orcamentosDa(A)
    expect(await definirOrcamento({ categoriaId: A.categoriaId, mes: '2026-10', valor: 1 }))
      .toEqual({ ok: false, erro: CATEGORIA_NAO_ENCONTRADA })
    expect(await orcamentosDa(A)).toEqual(antesA)
    expect(await orcamentosDa(B)).toEqual([])
  })

  it('B não exclui orçamento de A; a linha continua lá', async () => {
    como(B)
    expect(await excluirOrcamento({ id: idOutubroA })).toEqual({ ok: false, erro: ORCAMENTO_NAO_ENCONTRADO })
    const linha = (await orcamentosDa(A)).find((l) => l.id === idOutubroA)
    expect(linha).toMatchObject({ amount: 600, month: '2026-10' })
  })

  it('B define na PRÓPRIA categoria normalmente, e A não enxerga', async () => {
    como(B)
    const r = await definirOrcamento({ categoriaId: B.categoriaId, mes: '2026-10', valor: 75 })
    expect(r.ok).toBe(true)
    const { data: vistoPorA } = await A.cli.from('category_budgets').select('id').eq('family_id', B.familyId)
    expect(vistoPorA).toEqual([])
  })

  // ---------------------------------------- isolamento — camada 2: RLS direto
  //
  // ORCAMENTO_RLS_MUTANTE=1 troca o cliente de B pelo service_role (que ignora
  // RLS). Os dois testes abaixo TÊM de ficar vermelhos nesse modo — é a prova de
  // que eles detectam um bypass, já que a policy é anterior a este teste.
  const intruso = () => (process.env.ORCAMENTO_RLS_MUTANTE === '1' ? admin : B.cli)

  it('RLS: o cliente de B, direto no PostgREST, não lê, não altera e não apaga a linha de A', async () => {
    const { data: lida } = await intruso().from('category_budgets').select('id').eq('id', idOutubroA)
    expect(lida).toEqual([])
    const { data: alterada } = await intruso().from('category_budgets').update({ amount: 1 }).eq('id', idOutubroA).select('id')
    expect(alterada).toEqual([])
    const { data: apagada } = await intruso().from('category_budgets').delete().eq('id', idOutubroA).select('id')
    expect(apagada).toEqual([])
    const linha = (await orcamentosDa(A)).find((l) => l.id === idOutubroA)
    expect(linha).toMatchObject({ amount: 600 })
  })

  it('RLS: o cliente de B não insere nem faz upsert com family_id de A (42501)', async () => {
    const { error: eIns } = await intruso().from('category_budgets')
      .insert({ family_id: A.familyId, category_id: A.categoriaId, month: '2030-01', amount: 1 })
    expect(eIns?.code).toBe('42501')
    const { error: eUps } = await intruso().from('category_budgets')
      .upsert({ family_id: A.familyId, category_id: A.categoriaId, month: '2026-10', amount: 1 },
        { onConflict: 'family_id,category_id,month' })
    expect(eUps?.code).toBe('42501')
    const linha = (await orcamentosDa(A)).find((l) => l.id === idOutubroA)
    expect(linha).toMatchObject({ amount: 600 })
  })

  // -------------------------------------------------------------- excluir
  it('excluirOrcamento com id que não é uuid é recusado no campo id', async () => {
    como(A)
    const r = await excluirOrcamento({ id: 'x' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.camposComErro?.id).toEqual(['Item inválido.'])
  })

  it('A exclui o próprio orçamento; os outros ficam; repetir cai em "não encontrado"', async () => {
    como(A)
    const antes = await orcamentosDa(A)
    expect(await excluirOrcamento({ id: idOutubroA })).toEqual({ ok: true, dados: undefined })
    const depois = await orcamentosDa(A)
    expect(depois.map((l) => l.id)).toEqual(antes.map((l) => l.id).filter((id) => id !== idOutubroA))
    expect(await excluirOrcamento({ id: idOutubroA })).toEqual({ ok: false, erro: ORCAMENTO_NAO_ENCONTRADO })
    // A categoria não é afetada.
    const { count } = await admin.from('categories').select('id', { count: 'exact', head: true }).eq('id', A.categoriaId)
    expect(count).toBe(1)
  })
})
