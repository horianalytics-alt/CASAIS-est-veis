'use server'

import { revalidatePath } from 'next/cache'
import { chaveDeComparacao } from '@/lib/lista-nomes'
import {
  esquemaAdicionarGrupo,
  esquemaAtribuirGrupo,
  esquemaExcluirGrupo,
  esquemaRenomearGrupo,
} from '@/lib/esquemas-grupos'
import { obterContextoDaFamilia, type ContextoDaFamilia } from './contexto-familia'
import { falha, falhaDeValidacao, sucesso, traduzErroDoBanco, type ResultadoAction } from './resultado'

/*
 * Grupos ("pastas") de categoria da família — migration 00011. Cada categoria
 * fica em no máximo UM grupo (categories.group_id), ou em nenhum.
 *
 * Toda action, nesta ordem (mesmo padrão de categorias.ts):
 *   1. valida a entrada com Zod e usa SÓ o valor parseado;
 *   2. resolve usuário (getUser) e família no servidor;
 *   3. filtra explicitamente por family_id em toda consulta;
 *   4. o RLS de category_groups/categories é a segunda camada, não a única.
 * Um id de outra família cai em 'Grupo não encontrado.' / 'Categoria não
 * encontrada.' — sem revelar que a linha existe.
 *
 * Leitura (lista de grupos, grupo de cada categoria) NÃO tem action: a tela lê
 * direto com o cliente do servidor, como já faz com categories. Ver o contrato
 * em docs/planos/estrutura-grupos-categoria.md.
 */

const GRUPO_NAO_ENCONTRADO = 'Grupo não encontrado.'
const CATEGORIA_NAO_ENCONTRADA = 'Categoria não encontrada.'
const NOME_OCUPADO = 'Já existe um grupo com esse nome.'

function revalidar() {
  for (const rota of ['/ajustes/categorias', '/lancar']) revalidatePath(rota)
}

async function carregarGrupo(ctx: ContextoDaFamilia, id: string) {
  return ctx.supabase
    .from('category_groups')
    .select('id,name')
    .eq('id', id)
    .eq('family_id', ctx.familyId)
    .maybeSingle()
}

/**
 * Há OUTRO grupo da família com o mesmo nome (sem caixa, acento, invisível e
 * espaço extra)? Mesma chave do índice category_groups_nome_unico — esta
 * checagem dá a mensagem por campo; o índice segura gravações simultâneas.
 */
async function nomeOcupado(ctx: ContextoDaFamilia, nome: string, ignorarId?: string) {
  const { data, error } = await ctx.supabase
    .from('category_groups')
    .select('id,name')
    .eq('family_id', ctx.familyId)
  if (error) return { error }
  const chave = chaveDeComparacao(nome)
  return { ocupado: (data ?? []).some((g) => g.id !== ignorarId && chaveDeComparacao(g.name) === chave) }
}

/** 23505 do índice de nome vira erro no campo `nome`; o resto, erro geral. */
function falhaDeGravacao(error: { code?: string }) {
  const mensagem = traduzErroDoBanco(error)
  return error.code === '23505' ? falha(mensagem, { nome: [mensagem] }) : falha(mensagem)
}

export async function adicionarGrupo(input: {
  nome: string
}): Promise<ResultadoAction<{ id: string; nome: string }>> {
  const analise = esquemaAdicionarGrupo.safeParse(input)
  if (!analise.success) return falhaDeValidacao(analise.error)
  const { nome } = analise.data

  const contexto = await obterContextoDaFamilia()
  if (!contexto.ok) return contexto.resultado
  const { ctx } = contexto

  const conflito = await nomeOcupado(ctx, nome)
  if ('error' in conflito) return falha(traduzErroDoBanco(conflito.error))
  if (conflito.ocupado) return falha(NOME_OCUPADO, { nome: [NOME_OCUPADO] })

  const { data: ultimo, error: erroOrdem } = await ctx.supabase
    .from('category_groups')
    .select('sort_order')
    .eq('family_id', ctx.familyId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (erroOrdem) return falha(traduzErroDoBanco(erroOrdem))

  const { data, error } = await ctx.supabase
    .from('category_groups')
    .insert({ family_id: ctx.familyId, name: nome, sort_order: (ultimo?.sort_order ?? 0) + 1 })
    .select('id,name')
    .single()
  if (error) return falhaDeGravacao(error)

  revalidar()
  return sucesso({ id: data.id, nome: data.name })
}

export async function renomearGrupo(input: { id: string; nome: string }): Promise<ResultadoAction<void>> {
  const analise = esquemaRenomearGrupo.safeParse(input)
  if (!analise.success) return falhaDeValidacao(analise.error)
  const { id, nome } = analise.data

  const contexto = await obterContextoDaFamilia()
  if (!contexto.ok) return contexto.resultado
  const { ctx } = contexto

  const { data: atual, error: erroAtual } = await carregarGrupo(ctx, id)
  if (erroAtual) return falha(traduzErroDoBanco(erroAtual))
  if (!atual) return falha(GRUPO_NAO_ENCONTRADO)

  const conflito = await nomeOcupado(ctx, nome, id)
  if ('error' in conflito) return falha(traduzErroDoBanco(conflito.error))
  if (conflito.ocupado) return falha(NOME_OCUPADO, { nome: [NOME_OCUPADO] })

  const { data, error } = await ctx.supabase
    .from('category_groups')
    .update({ name: nome })
    .eq('id', id)
    .eq('family_id', ctx.familyId)
    .select('id')
  if (error) return falhaDeGravacao(error)
  if ((data ?? []).length === 0) return falha(GRUPO_NAO_ENCONTRADO)

  revalidar()
  return sucesso()
}

/**
 * Exclui o grupo. As categorias dele NÃO são excluídas: ficam sem grupo, pela
 * FK categories_family_id_group_id_fkey ON DELETE SET NULL (group_id) da 00011.
 * Nunca é bloqueado por ter categorias.
 *
 * `categoriasDesvinculadas` é contado ANTES do delete (a própria FK zera o
 * group_id depois); serve para a tela dizer "3 categorias ficaram sem grupo".
 */
export async function excluirGrupo(input: {
  id: string
}): Promise<ResultadoAction<{ categoriasDesvinculadas: number }>> {
  const analise = esquemaExcluirGrupo.safeParse(input)
  if (!analise.success) return falhaDeValidacao(analise.error)
  const { id } = analise.data

  const contexto = await obterContextoDaFamilia()
  if (!contexto.ok) return contexto.resultado
  const { ctx } = contexto

  const { data: atual, error: erroAtual } = await carregarGrupo(ctx, id)
  if (erroAtual) return falha(traduzErroDoBanco(erroAtual))
  if (!atual) return falha(GRUPO_NAO_ENCONTRADO)

  const { count, error: erroUso } = await ctx.supabase
    .from('categories')
    .select('id', { count: 'exact', head: true })
    .eq('family_id', ctx.familyId)
    .eq('group_id', id)
  if (erroUso) return falha(traduzErroDoBanco(erroUso))

  const { data, error } = await ctx.supabase
    .from('category_groups')
    .delete()
    .eq('id', id)
    .eq('family_id', ctx.familyId)
    .select('id')
  if (error) return falha(traduzErroDoBanco(error))
  if ((data ?? []).length === 0) return falha(GRUPO_NAO_ENCONTRADO)

  revalidar()
  return sucesso({ categoriasDesvinculadas: count ?? 0 })
}

/**
 * Põe a categoria num grupo, troca de grupo, ou tira de qualquer grupo
 * (`grupoId: null`). Vale para categoria ativa ou arquivada.
 *
 * O grupo é conferido na família ANTES de gravar, para a mensagem certa; a FK
 * composta (family_id, group_id) recusaria um grupo de outra família de
 * qualquer jeito (23503).
 */
export async function atribuirGrupoCategoria(input: {
  categoriaId: string
  grupoId: string | null
}): Promise<ResultadoAction<void>> {
  const analise = esquemaAtribuirGrupo.safeParse(input)
  if (!analise.success) return falhaDeValidacao(analise.error)
  const { categoriaId, grupoId } = analise.data

  const contexto = await obterContextoDaFamilia()
  if (!contexto.ok) return contexto.resultado
  const { ctx } = contexto

  const { data: categoria, error: erroCategoria } = await ctx.supabase
    .from('categories')
    .select('id')
    .eq('id', categoriaId)
    .eq('family_id', ctx.familyId)
    .maybeSingle()
  if (erroCategoria) return falha(traduzErroDoBanco(erroCategoria))
  if (!categoria) return falha(CATEGORIA_NAO_ENCONTRADA)

  if (grupoId !== null) {
    const { data: grupo, error: erroGrupo } = await carregarGrupo(ctx, grupoId)
    if (erroGrupo) return falha(traduzErroDoBanco(erroGrupo))
    if (!grupo) return falha(GRUPO_NAO_ENCONTRADO)
  }

  const { data, error } = await ctx.supabase
    .from('categories')
    .update({ group_id: grupoId })
    .eq('id', categoriaId)
    .eq('family_id', ctx.familyId)
    .select('id')
  if (error) {
    // Grupo excluído entre a conferência e o update: a FK composta recusa.
    return error.code === '23503' ? falha(GRUPO_NAO_ENCONTRADO) : falha(traduzErroDoBanco(error))
  }
  if ((data ?? []).length === 0) return falha(CATEGORIA_NAO_ENCONTRADA)

  revalidar()
  return sucesso()
}
