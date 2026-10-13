'use server'

import { revalidatePath } from 'next/cache'
import { chaveDeComparacao } from '@/lib/lista-nomes'
import {
  esquemaAdicionarCategorias,
  esquemaAlterarTipo,
  esquemaArquivar,
  esquemaId,
  esquemaRenomear,
  type TipoCategoria,
} from '@/lib/esquemas-cadastro'
import { obterContextoDaFamilia, type ContextoDaFamilia } from './contexto-familia'
import { falha, falhaDeValidacao, sucesso, traduzErroDoBanco, type ResultadoAction } from './resultado'

export type { TipoCategoria } from '@/lib/esquemas-cadastro'

/*
 * Categorias da família. Toda action, nesta ordem:
 *   1. valida a entrada com Zod e usa SÓ o valor parseado;
 *   2. resolve usuário (getUser) e família no servidor;
 *   3. filtra explicitamente por family_id em toda consulta;
 *   4. o RLS de categories é a segunda camada, não a única.
 * Um id de outra família cai em 'Categoria não encontrada.' — sem revelar que
 * a linha existe.
 */

const NAO_ENCONTRADA = 'Categoria não encontrada.'
const NOME_OCUPADO = 'Já existe uma categoria ativa com esse nome.'

function revalidar() {
  for (const rota of ['/ajustes/categorias', '/lancar', '/inicio', '/analises']) revalidatePath(rota)
}

async function carregar(ctx: ContextoDaFamilia, id: string) {
  return ctx.supabase
    .from('categories')
    .select('id,name,type,archived_at')
    .eq('id', id)
    .eq('family_id', ctx.familyId)
    .maybeSingle()
}

/**
 * Há OUTRA categoria ativa, do mesmo tipo, com o mesmo nome (sem diferenciar
 * caixa nem acento)? O índice categories_nome_ativo_unico só pega caixa;
 * acento é barrado aqui.
 */
async function nomeOcupado(ctx: ContextoDaFamilia, nome: string, tipo: string, ignorarId?: string) {
  const { data, error } = await ctx.supabase
    .from('categories')
    .select('id,name')
    .eq('family_id', ctx.familyId)
    .eq('type', tipo)
    .is('archived_at', null)
  if (error) return { error }
  const chave = chaveDeComparacao(nome)
  return { ocupado: (data ?? []).some((c) => c.id !== ignorarId && chaveDeComparacao(c.name) === chave) }
}

async function contarLancamentos(ctx: ContextoDaFamilia, id: string) {
  return ctx.supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('family_id', ctx.familyId)
    .eq('category_id', id)
}

export async function adicionarCategorias(input: {
  nomes: string
  tipo: TipoCategoria
}): Promise<ResultadoAction<{ criadas: { id: string; nome: string }[]; ignoradas: string[] }>> {
  const analise = esquemaAdicionarCategorias.safeParse(input)
  if (!analise.success) return falhaDeValidacao(analise.error)
  const { nomes, tipo } = analise.data

  const contexto = await obterContextoDaFamilia()
  if (!contexto.ok) return contexto.resultado
  const { ctx } = contexto

  const { data: existentes, error: erroExistentes } = await ctx.supabase
    .from('categories')
    .select('name')
    .eq('family_id', ctx.familyId)
    .eq('type', tipo)
    .is('archived_at', null)
  if (erroExistentes) return falha(traduzErroDoBanco(erroExistentes))

  const ativas = new Set((existentes ?? []).map((c) => chaveDeComparacao(c.name)))
  const novos = nomes.nomes.filter((nome) => !ativas.has(chaveDeComparacao(nome)))
  const ignoradas = nomes.nomes.filter((nome) => ativas.has(chaveDeComparacao(nome)))

  if (novos.length === 0) return sucesso({ criadas: [], ignoradas })

  const { data: ultima, error: erroOrdem } = await ctx.supabase
    .from('categories')
    .select('sort_order')
    .eq('family_id', ctx.familyId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (erroOrdem) return falha(traduzErroDoBanco(erroOrdem))
  const base = (ultima?.sort_order ?? 0) + 1

  // UM insert só: ou o lote inteiro entra, ou nada entra.
  const { data: criadas, error } = await ctx.supabase
    .from('categories')
    .insert(novos.map((nome, i) => ({ family_id: ctx.familyId, name: nome, type: tipo, sort_order: base + i })))
    .select('id,name,sort_order')
  if (error) {
    const mensagem = traduzErroDoBanco(error)
    return error.code === '23505' ? falha(mensagem, { nomes: [mensagem] }) : falha(mensagem)
  }

  revalidar()
  return sucesso({
    criadas: [...(criadas ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((c) => ({ id: c.id, nome: c.name })),
    ignoradas,
  })
}

export async function renomearCategoria(input: { id: string; nome: string }): Promise<ResultadoAction<void>> {
  const analise = esquemaRenomear.safeParse(input)
  if (!analise.success) return falhaDeValidacao(analise.error)
  const { id, nome } = analise.data

  const contexto = await obterContextoDaFamilia()
  if (!contexto.ok) return contexto.resultado
  const { ctx } = contexto

  const { data: atual, error: erroAtual } = await carregar(ctx, id)
  if (erroAtual) return falha(traduzErroDoBanco(erroAtual))
  if (!atual) return falha(NAO_ENCONTRADA)

  // Arquivada não ocupa nome; o conflito dela é checado ao reativar.
  if (atual.archived_at === null) {
    const conflito = await nomeOcupado(ctx, nome, atual.type, id)
    if ('error' in conflito) return falha(traduzErroDoBanco(conflito.error))
    if (conflito.ocupado) return falha(NOME_OCUPADO, { nome: [NOME_OCUPADO] })
  }

  const { data, error } = await ctx.supabase
    .from('categories')
    .update({ name: nome })
    .eq('id', id)
    .eq('family_id', ctx.familyId)
    .select('id')
  if (error) {
    const mensagem = traduzErroDoBanco(error)
    return error.code === '23505' ? falha(mensagem, { nome: [mensagem] }) : falha(mensagem)
  }
  if ((data ?? []).length === 0) return falha(NAO_ENCONTRADA)

  revalidar()
  return sucesso()
}

/**
 * Mudar o tipo só é permitido sem lançamentos: um lançamento de despesa
 * classificado numa categoria de receita deixaria as análises incoerentes.
 * Orçamento não bloqueia (orçamento não tem tipo).
 */
export async function alterarTipoCategoria(input: {
  id: string
  tipo: TipoCategoria
}): Promise<ResultadoAction<void>> {
  const analise = esquemaAlterarTipo.safeParse(input)
  if (!analise.success) return falhaDeValidacao(analise.error)
  const { id, tipo } = analise.data

  const contexto = await obterContextoDaFamilia()
  if (!contexto.ok) return contexto.resultado
  const { ctx } = contexto

  const { data: atual, error: erroAtual } = await carregar(ctx, id)
  if (erroAtual) return falha(traduzErroDoBanco(erroAtual))
  if (!atual) return falha(NAO_ENCONTRADA)
  if (atual.type === tipo) return sucesso()

  const { count, error: erroUso } = await contarLancamentos(ctx, id)
  if (erroUso) return falha(traduzErroDoBanco(erroUso))
  const emUso = count ?? 0
  if (emUso > 0) {
    return falha(
      `Esta categoria está em ${emUso} ${emUso === 1 ? 'lançamento' : 'lançamentos'}. ` +
        'Para mudar o tipo, crie uma categoria nova e arquive esta.',
    )
  }

  if (atual.archived_at === null) {
    const conflito = await nomeOcupado(ctx, atual.name, tipo, id)
    if ('error' in conflito) return falha(traduzErroDoBanco(conflito.error))
    if (conflito.ocupado) return falha(NOME_OCUPADO)
  }

  const { data, error } = await ctx.supabase
    .from('categories')
    .update({ type: tipo })
    .eq('id', id)
    .eq('family_id', ctx.familyId)
    .select('id')
  if (error) return falha(traduzErroDoBanco(error))
  if ((data ?? []).length === 0) return falha(NAO_ENCONTRADA)

  revalidar()
  return sucesso()
}

export async function arquivarCategoria(input: { id: string; arquivar: boolean }): Promise<ResultadoAction<void>> {
  const analise = esquemaArquivar.safeParse(input)
  if (!analise.success) return falhaDeValidacao(analise.error)
  const { id, arquivar } = analise.data

  const contexto = await obterContextoDaFamilia()
  if (!contexto.ok) return contexto.resultado
  const { ctx } = contexto

  const { data: atual, error: erroAtual } = await carregar(ctx, id)
  if (erroAtual) return falha(traduzErroDoBanco(erroAtual))
  if (!atual) return falha(NAO_ENCONTRADA)

  const jaArquivada = atual.archived_at !== null
  if (arquivar === jaArquivada) return sucesso()

  if (!arquivar) {
    const conflito = await nomeOcupado(ctx, atual.name, atual.type, id)
    if ('error' in conflito) return falha(traduzErroDoBanco(conflito.error))
    if (conflito.ocupado) return falha(`${NOME_OCUPADO} Renomeie esta antes de reativar.`)
  }

  const { data, error } = await ctx.supabase
    .from('categories')
    .update({ archived_at: arquivar ? new Date().toISOString() : null })
    .eq('id', id)
    .eq('family_id', ctx.familyId)
    .select('id')
  if (error) return falha(traduzErroDoBanco(error))
  if ((data ?? []).length === 0) return falha(NAO_ENCONTRADA)

  revalidar()
  return sucesso()
}

/**
 * Exclui de vez. Lançamentos ficam "Sem categoria" (FK SET NULL (category_id),
 * migration 00009) e os orçamentos da categoria são APAGADOS junto
 * (category_budgets ON DELETE CASCADE, 00001).
 */
export async function excluirCategoria(input: {
  id: string
}): Promise<ResultadoAction<{ lancamentosAfetados: number }>> {
  const analise = esquemaId.safeParse(input)
  if (!analise.success) return falhaDeValidacao(analise.error)
  const { id } = analise.data

  const contexto = await obterContextoDaFamilia()
  if (!contexto.ok) return contexto.resultado
  const { ctx } = contexto

  const { data: atual, error: erroAtual } = await carregar(ctx, id)
  if (erroAtual) return falha(traduzErroDoBanco(erroAtual))
  if (!atual) return falha(NAO_ENCONTRADA)

  const { count, error: erroUso } = await contarLancamentos(ctx, id)
  if (erroUso) return falha(traduzErroDoBanco(erroUso))

  const { data, error } = await ctx.supabase
    .from('categories')
    .delete()
    .eq('id', id)
    .eq('family_id', ctx.familyId)
    .select('id')
  if (error) return falha(traduzErroDoBanco(error))
  if ((data ?? []).length === 0) return falha(NAO_ENCONTRADA)

  revalidar()
  return sucesso({ lancamentosAfetados: count ?? 0 })
}

export async function contarUsoCategoria(input: {
  id: string
}): Promise<ResultadoAction<{ lancamentos: number; orcamentos: number }>> {
  const analise = esquemaId.safeParse(input)
  if (!analise.success) return falhaDeValidacao(analise.error)
  const { id } = analise.data

  const contexto = await obterContextoDaFamilia()
  if (!contexto.ok) return contexto.resultado
  const { ctx } = contexto

  const { data: atual, error: erroAtual } = await carregar(ctx, id)
  if (erroAtual) return falha(traduzErroDoBanco(erroAtual))
  if (!atual) return falha(NAO_ENCONTRADA)

  const [lancamentos, orcamentos] = await Promise.all([
    contarLancamentos(ctx, id),
    ctx.supabase
      .from('category_budgets')
      .select('id', { count: 'exact', head: true })
      .eq('family_id', ctx.familyId)
      .eq('category_id', id),
  ])
  if (lancamentos.error) return falha(traduzErroDoBanco(lancamentos.error))
  if (orcamentos.error) return falha(traduzErroDoBanco(orcamentos.error))

  return sucesso({ lancamentos: lancamentos.count ?? 0, orcamentos: orcamentos.count ?? 0 })
}
