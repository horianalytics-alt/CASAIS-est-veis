// @vitest-environment node
//
// Server Actions de grupos de categoria (migration 00011), de verdade, contra o
// banco HOSPEDADO — mesmo arranjo de acoes-cadastro.int.test.ts: só o
// createClient do servidor (cookie do Next) é trocado por um cliente supabase-js
// já autenticado como o usuário do teste, e o revalidatePath é neutralizado.
// Zod, resolução da família, consultas, RLS, índices e FKs são os reais.
//
// Duas famílias descartáveis, criadas aqui e APAGADAS no afterAll pela
// limparTeste (lançamentos -> famílias -> usuários), que conta o que saiu de
// fato. Nunca toca na família real.
//
// Sem as chaves no ambiente o arquivo é PULADO. Para rodar, de dentro de app/:
//   set -a && . ./.env.local && set +a
//   npx vitest run tests/integration/grupos-categoria.int.test.ts
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { limparTeste } from './limpeza-utils.mjs'

const estado = vi.hoisted(() => ({ cliente: null as unknown }))
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => estado.cliente }))

import {
  adicionarGrupo,
  atribuirGrupoCategoria,
  excluirGrupo,
  renomearGrupo,
} from '@/actions/grupos-categoria'
import { traduzErroDoBanco } from '@/actions/resultado'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const temAmbiente = Boolean(URL && ANON && SERVICE)
// A família real nunca pode aparecer entre as criadas/apagadas por este teste.
const FAMILIA_REAL = '9969d589-1645-403f-912a-1504bfeebb89'

type Cliente = SupabaseClient<Database>
type Usuario = { tag: string; cli: Cliente; familyId: string }

const stamp = Date.now()
let admin: Cliente
const usuarios: string[] = []
const familias: string[] = []

const NOME_OCUPADO = 'Já existe um grupo com esse nome.'
const GRUPO_NAO_ENCONTRADO = 'Grupo não encontrado.'
const CATEGORIA_NAO_ENCONTRADA = 'Categoria não encontrada.'

async function novaCasa(tag: string): Promise<Usuario> {
  const email = `grupos-${tag}-${stamp}@example.com`
  const pass = 'Senha!Forte123'
  const { data: u, error } = await admin.auth.admin.createUser({ email, password: pass, email_confirm: true })
  if (error || !u.user) throw new Error(`createUser ${tag}: ${error?.message}`)
  usuarios.push(u.user.id)
  const cli = createClient<Database>(URL!, ANON!, { auth: { persistSession: false } })
  const { error: sErr } = await cli.auth.signInWithPassword({ email, password: pass })
  if (sErr) throw new Error(`signIn ${tag}: ${sErr.message}`)
  const { data: fam, error: fErr } = await cli.rpc('create_family', {
    p_family_name: `Casa Grupos ${tag} ${stamp}`, p_split_rule: 'equal', p_member_name: `Membro ${tag}`, p_monthly_income: 1000,
  })
  if (fErr || !fam?.[0]) throw new Error(`create_family ${tag}: ${fErr?.message}`)
  if (fam[0].family_id === FAMILIA_REAL) throw new Error('create_family devolveu a família real — abortando')
  familias.push(fam[0].family_id)
  return { tag, cli, familyId: fam[0].family_id }
}

function como(u: Usuario | null) {
  estado.cliente = u ? u.cli : createClient<Database>(URL!, ANON!, { auth: { persistSession: false } })
}

async function grupoPorNome(u: Usuario, nome: string) {
  const { data } = await admin.from('category_groups').select('id,name,sort_order')
    .eq('family_id', u.familyId).eq('name', nome).maybeSingle()
  return data
}

async function duasCategorias(u: Usuario) {
  const { data } = await admin.from('categories').select('id,name,group_id')
    // Desempate por id: as categorias padrão podem ter sort_order repetido, e
    // sem ele cada chamada podia devolver um par diferente.
    .eq('family_id', u.familyId).order('sort_order').order('id').limit(2)
  if (!data || data.length < 2) throw new Error(`família ${u.tag} sem 2 categorias padrão`)
  return data
}

describe.skipIf(!temAmbiente)('Server Actions de grupos de categoria contra o banco real', () => {
  let A: Usuario
  let B: Usuario

  beforeAll(async () => {
    admin = createClient<Database>(URL!, SERVICE!, { auth: { persistSession: false } })
    A = await novaCasa('a')
    B = await novaCasa('b')
  }, 60_000)

  afterAll(async () => {
    const erros = await limparTeste(admin, familias, usuarios)
    expect(erros).toEqual([])
  }, 60_000)

  // ------------------------------------------------------------------ adicionar
  it('adicionarGrupo limpa o nome e devolve id e nome gravados', async () => {
    como(A)
    const r = await adicionarGrupo({ nome: '  Compras   online ' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.dados.nome).toBe('Compras online')
    const g = await grupoPorNome(A, 'Compras online')
    expect(g?.id).toBe(r.dados.id)
  })

  it('o segundo grupo entra depois do primeiro (sort_order crescente)', async () => {
    como(A)
    const r = await adicionarGrupo({ nome: 'Casa' })
    expect(r.ok).toBe(true)
    const primeiro = await grupoPorNome(A, 'Compras online')
    const segundo = await grupoPorNome(A, 'Casa')
    expect(segundo!.sort_order).toBeGreaterThan(primeiro!.sort_order)
  })

  it('nome repetido sem diferenciar caixa, acento, espaço e zero-width é recusado no campo nome', async () => {
    como(A)
    const r = await adicionarGrupo({ nome: 'COMPRAS  ONLÍNE\u{200b}' })
    expect(r).toEqual({ ok: false, erro: NOME_OCUPADO, camposComErro: { nome: [NOME_OCUPADO] } })
  })

  it('o mesmo nome em OUTRA família é permitido', async () => {
    como(B)
    const r = await adicionarGrupo({ nome: 'Compras online' })
    expect(r.ok).toBe(true)
  })

  it('nome vazio (ou só invisível) é recusado pelo Zod no campo nome', async () => {
    como(A)
    const r = await adicionarGrupo({ nome: ' \u{200b} ' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.camposComErro?.nome).toEqual(['Informe o nome.'])
  })

  it('nome com mais de 40 caracteres é recusado', async () => {
    como(A)
    const r = await adicionarGrupo({ nome: 'x'.repeat(41) })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.camposComErro?.nome).toEqual(['Use no máximo 40 caracteres.'])
  })

  it('sem sessão: recusa sem tocar no banco', async () => {
    como(null)
    const r = await adicionarGrupo({ nome: 'Fantasma' })
    expect(r).toEqual({ ok: false, erro: 'Sua sessão expirou. Entre de novo.' })
  })

  // ------------------------------------------------------------------ renomear
  it('renomearGrupo para nome livre funciona e grava limpo', async () => {
    como(A)
    const g = await grupoPorNome(A, 'Casa')
    expect(await renomearGrupo({ id: g!.id, nome: ' Casa  e  contas ' })).toEqual({ ok: true, dados: undefined })
    expect((await grupoPorNome(A, 'Casa e contas'))?.id).toBe(g!.id)
  })

  it('renomear mudando só a caixa do PRÓPRIO nome é permitido', async () => {
    como(A)
    const g = await grupoPorNome(A, 'Casa e contas')
    expect((await renomearGrupo({ id: g!.id, nome: 'CASA E CONTAS' })).ok).toBe(true)
    expect((await grupoPorNome(A, 'CASA E CONTAS'))?.id).toBe(g!.id)
  })

  it('renomear para o nome de OUTRO grupo é recusado', async () => {
    como(A)
    const g = await grupoPorNome(A, 'CASA E CONTAS')
    const r = await renomearGrupo({ id: g!.id, nome: 'compras online' })
    expect(r).toEqual({ ok: false, erro: NOME_OCUPADO, camposComErro: { nome: [NOME_OCUPADO] } })
  })

  it('renomear grupo de OUTRA família: "não encontrado" e o grupo dela fica intacto', async () => {
    como(A)
    const deB = await grupoPorNome(B, 'Compras online')
    const r = await renomearGrupo({ id: deB!.id, nome: 'Invadido' })
    expect(r).toEqual({ ok: false, erro: GRUPO_NAO_ENCONTRADO })
    expect((await grupoPorNome(B, 'Compras online'))?.id).toBe(deB!.id)
  })

  it('id que não é uuid é recusado pelo Zod', async () => {
    como(A)
    const r = await renomearGrupo({ id: 'nao-e-uuid', nome: 'X' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.camposComErro?.id).toEqual(['Item inválido.'])
  })

  // ------------------------------------------------------------------ atribuir
  it('atribuir categoria ao grupo e depois tirar do grupo (null)', async () => {
    como(A)
    const [c1] = await duasCategorias(A)
    const g = await grupoPorNome(A, 'Compras online')
    expect(await atribuirGrupoCategoria({ categoriaId: c1.id, grupoId: g!.id })).toEqual({ ok: true, dados: undefined })
    let { data } = await admin.from('categories').select('group_id').eq('id', c1.id).single()
    expect(data!.group_id).toBe(g!.id)

    expect((await atribuirGrupoCategoria({ categoriaId: c1.id, grupoId: null })).ok).toBe(true)
    ;({ data } = await admin.from('categories').select('group_id').eq('id', c1.id).single())
    expect(data!.group_id).toBeNull()
  })

  it('trocar de grupo: a categoria fica em UM grupo só (o último)', async () => {
    como(A)
    const [c1] = await duasCategorias(A)
    const g1 = await grupoPorNome(A, 'Compras online')
    const g2 = await grupoPorNome(A, 'CASA E CONTAS')
    expect((await atribuirGrupoCategoria({ categoriaId: c1.id, grupoId: g1!.id })).ok).toBe(true)
    expect((await atribuirGrupoCategoria({ categoriaId: c1.id, grupoId: g2!.id })).ok).toBe(true)
    const { data } = await admin.from('categories').select('group_id').eq('id', c1.id).single()
    expect(data!.group_id).toBe(g2!.id)
  })

  it('atribuir a grupo de OUTRA família: "Grupo não encontrado." e nada muda', async () => {
    como(A)
    const [c1] = await duasCategorias(A)
    const antes = (await admin.from('categories').select('group_id').eq('id', c1.id).single()).data!.group_id
    const deB = await grupoPorNome(B, 'Compras online')
    expect(await atribuirGrupoCategoria({ categoriaId: c1.id, grupoId: deB!.id }))
      .toEqual({ ok: false, erro: GRUPO_NAO_ENCONTRADO })
    const depois = (await admin.from('categories').select('group_id').eq('id', c1.id).single()).data!.group_id
    expect(depois).toBe(antes)
  })

  it('atribuir categoria de OUTRA família: "Categoria não encontrada." e nada muda', async () => {
    como(A)
    const [cB] = await duasCategorias(B)
    const g = await grupoPorNome(A, 'Compras online')
    expect(await atribuirGrupoCategoria({ categoriaId: cB.id, grupoId: g!.id }))
      .toEqual({ ok: false, erro: CATEGORIA_NAO_ENCONTRADA })
    const { data } = await admin.from('categories').select('group_id').eq('id', cB.id).single()
    expect(data!.group_id).toBeNull()
  })

  it('grupoId ausente (undefined) é recusado: "sem grupo" é null explícito', async () => {
    como(A)
    const [c1] = await duasCategorias(A)
    const r = await atribuirGrupoCategoria({ categoriaId: c1.id } as unknown as { categoriaId: string; grupoId: null })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.camposComErro?.grupoId).toBeDefined()
  })

  // ------------------------------------------------------------------ excluir
  it('excluir grupo de OUTRA família: "não encontrado" e ele continua existindo', async () => {
    como(A)
    const deB = await grupoPorNome(B, 'Compras online')
    expect(await excluirGrupo({ id: deB!.id })).toEqual({ ok: false, erro: GRUPO_NAO_ENCONTRADO })
    expect(await grupoPorNome(B, 'Compras online')).not.toBeNull()
  })

  it('excluir grupo desvincula as categorias dele e NÃO as apaga', async () => {
    como(A)
    const [c1, c2] = await duasCategorias(A)
    const g = await grupoPorNome(A, 'CASA E CONTAS')
    expect((await atribuirGrupoCategoria({ categoriaId: c1.id, grupoId: g!.id })).ok).toBe(true)
    expect((await atribuirGrupoCategoria({ categoriaId: c2.id, grupoId: g!.id })).ok).toBe(true)

    expect(await excluirGrupo({ id: g!.id })).toEqual({ ok: true, dados: { categoriasDesvinculadas: 2 } })

    expect(await grupoPorNome(A, 'CASA E CONTAS')).toBeNull()
    const { data } = await admin.from('categories').select('id,group_id,family_id').in('id', [c1.id, c2.id])
    expect(data).toHaveLength(2)
    for (const c of data!) {
      expect(c.group_id).toBeNull()
      expect(c.family_id).toBe(A.familyId)
    }
  })

  it('excluir grupo vazio devolve 0 desvinculadas', async () => {
    como(A)
    const criado = await adicionarGrupo({ nome: 'Vazio' })
    expect(criado.ok).toBe(true)
    if (!criado.ok) return
    expect(await excluirGrupo({ id: criado.dados.id })).toEqual({ ok: true, dados: { categoriasDesvinculadas: 0 } })
  })

  // ------------------------------------------------------- rede de segurança do banco
  it('gravação DIRETA (sem action) com nome duplicado por zero-width esbarra no índice e vira mensagem em português', async () => {
    const { error } = await A.cli.from('category_groups').insert({ family_id: A.familyId, name: 'Compras\u{200b} online' })
    expect(error?.code).toBe('23505')
    expect(traduzErroDoBanco(error)).toBe(NOME_OCUPADO)
  })

  it('P-008: categoria duplicada por tab/acento/zero-width esbarra no índice de categories', async () => {
    const [c1] = await duasCategorias(A)
    const { data: cat } = await admin.from('categories').select('name,type').eq('id', c1.id).single()
    const variante = `\t${cat!.name.toUpperCase()}\u{200b} `
    const { error } = await A.cli.from('categories').insert({ family_id: A.familyId, name: variante, type: cat!.type })
    expect(error?.code).toBe('23505')
    expect(traduzErroDoBanco(error)).toBe('Já existe uma categoria ativa com esse nome.')
  })

  it('P-008: forma de pagamento duplicada por acento/espaço duplo esbarra no índice de payment_methods', async () => {
    const { data: forma } = await admin.from('payment_methods').select('name')
      .eq('family_id', A.familyId).is('archived_at', null).limit(1).single()
    // Acento decomposto (NFD), caixa trocada, espaço nas pontas e BOM no fim.
    const variante = `  ${forma!.name.toUpperCase().normalize('NFD')}\u{feff} `
    const { error } = await A.cli.from('payment_methods').insert({ family_id: A.familyId, name: variante })
    expect(error?.code).toBe('23505')
    expect(traduzErroDoBanco(error)).toBe('Já existe uma forma de pagamento ativa com esse nome.')
  })
})
