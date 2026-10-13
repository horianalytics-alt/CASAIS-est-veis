'use server'

import { revalidatePath } from 'next/cache'
import { chaveDeComparacao } from '@/lib/lista-nomes'
import { esquemaAdicionarFormas, esquemaArquivar, esquemaId, esquemaRenomear } from '@/lib/esquemas-cadastro'
import { obterContextoDaFamilia, type ContextoDaFamilia } from './contexto-familia'
import { falha, falhaDeValidacao, sucesso, traduzErroDoBanco, type ResultadoAction } from './resultado'

/*
 * Formas de pagamento da família. Mesmo protocolo de categorias.ts: Zod
 * primeiro, família resolvida no servidor, family_id explícito em toda
 * consulta, RLS como segunda camada. Id de outra família cai em
 * 'Forma de pagamento não encontrada.'.
 */

const NAO_ENCONTRADA = 'Forma de pagamento não encontrada.'
const NOME_OCUPADO = 'Já existe uma forma de pagamento ativa com esse nome.'

function revalidar() {
  for (const rota of ['/ajustes/formas-pagamento', '/lancar', '/inicio']) revalidatePath(rota)
}

async function carregar(ctx: ContextoDaFamilia, id: string) {
  return ctx.supabase
    .from('payment_methods')
    .select('id,name,archived_at')
    .eq('id', id)
    .eq('family_id', ctx.familyId)
    .maybeSingle()
}

/** Outra forma ativa com o mesmo nome, sem diferenciar caixa nem acento? */
async function nomeOcupado(ctx: ContextoDaFamilia, nome: string, ignorarId?: string) {
  const { data, error } = await ctx.supabase
    .from('payment_methods')
    .select('id,name')
    .eq('family_id', ctx.familyId)
    .is('archived_at', null)
  if (error) return { error }
  const chave = chaveDeComparacao(nome)
  return { ocupado: (data ?? []).some((f) => f.id !== ignorarId && chaveDeComparacao(f.name) === chave) }
}

async function contarLancamentos(ctx: ContextoDaFamilia, id: string) {
  return ctx.supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('family_id', ctx.familyId)
    .eq('payment_method_id', id)
}

export async function adicionarFormasPagamento(input: {
  nomes: string
}): Promise<ResultadoAction<{ criadas: { id: string; nome: string }[]; ignoradas: string[] }>> {
  const analise = esquemaAdicionarFormas.safeParse(input)
  if (!analise.success) return falhaDeValidacao(analise.error)
  const { nomes } = analise.data

  const contexto = await obterContextoDaFamilia()
  if (!contexto.ok) return contexto.resultado
  const { ctx } = contexto

  const { data: existentes, error: erroExistentes } = await ctx.supabase
    .from('payment_methods')
    .select('name')
    .eq('family_id', ctx.familyId)
    .is('archived_at', null)
  if (erroExistentes) return falha(traduzErroDoBanco(erroExistentes))

  const ativas = new Set((existentes ?? []).map((f) => chaveDeComparacao(f.name)))
  const novos = nomes.nomes.filter((nome) => !ativas.has(chaveDeComparacao(nome)))
  const ignoradas = nomes.nomes.filter((nome) => ativas.has(chaveDeComparacao(nome)))

  if (novos.length === 0) return sucesso({ criadas: [], ignoradas })

  const { data: ultima, error: erroOrdem } = await ctx.supabase
    .from('payment_methods')
    .select('sort_order')
    .eq('family_id', ctx.familyId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (erroOrdem) return falha(traduzErroDoBanco(erroOrdem))
  const base = (ultima?.sort_order ?? 0) + 1

  // UM insert só: ou o lote inteiro entra, ou nada entra.
  const { data: criadas, error } = await ctx.supabase
    .from('payment_methods')
    .insert(novos.map((nome, i) => ({ family_id: ctx.familyId, name: nome, sort_order: base + i })))
    .select('id,name,sort_order')
  if (error) {
    const mensagem = traduzErroDoBanco(error)
    return error.code === '23505' ? falha(mensagem, { nomes: [mensagem] }) : falha(mensagem)
  }

  revalidar()
  return sucesso({
    criadas: [...(criadas ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((f) => ({ id: f.id, nome: f.name })),
    ignoradas,
  })
}

export async function renomearFormaPagamento(input: { id: string; nome: string }): Promise<ResultadoAction<void>> {
  const analise = esquemaRenomear.safeParse(input)
  if (!analise.success) return falhaDeValidacao(analise.error)
  const { id, nome } = analise.data

  const contexto = await obterContextoDaFamilia()
  if (!contexto.ok) return contexto.resultado
  const { ctx } = contexto

  const { data: atual, error: erroAtual } = await carregar(ctx, id)
  if (erroAtual) return falha(traduzErroDoBanco(erroAtual))
  if (!atual) return falha(NAO_ENCONTRADA)

  if (atual.archived_at === null) {
    const conflito = await nomeOcupado(ctx, nome, id)
    if ('error' in conflito) return falha(traduzErroDoBanco(conflito.error))
    if (conflito.ocupado) return falha(NOME_OCUPADO, { nome: [NOME_OCUPADO] })
  }

  const { data, error } = await ctx.supabase
    .from('payment_methods')
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

export async function arquivarFormaPagamento(input: {
  id: string
  arquivar: boolean
}): Promise<ResultadoAction<void>> {
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
    const conflito = await nomeOcupado(ctx, atual.name, id)
    if ('error' in conflito) return falha(traduzErroDoBanco(conflito.error))
    if (conflito.ocupado) return falha(`${NOME_OCUPADO} Renomeie esta antes de reativar.`)
  }

  const { data, error } = await ctx.supabase
    .from('payment_methods')
    .update({ archived_at: arquivar ? new Date().toISOString() : null })
    .eq('id', id)
    .eq('family_id', ctx.familyId)
    .select('id')
  if (error) return falha(traduzErroDoBanco(error))
  if ((data ?? []).length === 0) return falha(NAO_ENCONTRADA)

  revalidar()
  return sucesso()
}

/** Exclui de vez. Lançamentos ficam sem forma (FK SET NULL (payment_method_id), 00009). */
export async function excluirFormaPagamento(input: {
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
    .from('payment_methods')
    .delete()
    .eq('id', id)
    .eq('family_id', ctx.familyId)
    .select('id')
  if (error) return falha(traduzErroDoBanco(error))
  if ((data ?? []).length === 0) return falha(NAO_ENCONTRADA)

  revalidar()
  return sucesso({ lancamentosAfetados: count ?? 0 })
}

export async function contarUsoFormaPagamento(input: {
  id: string
}): Promise<ResultadoAction<{ lancamentos: number }>> {
  const analise = esquemaId.safeParse(input)
  if (!analise.success) return falhaDeValidacao(analise.error)
  const { id } = analise.data

  const contexto = await obterContextoDaFamilia()
  if (!contexto.ok) return contexto.resultado
  const { ctx } = contexto

  const { data: atual, error: erroAtual } = await carregar(ctx, id)
  if (erroAtual) return falha(traduzErroDoBanco(erroAtual))
  if (!atual) return falha(NAO_ENCONTRADA)

  const { count, error } = await contarLancamentos(ctx, id)
  if (error) return falha(traduzErroDoBanco(error))

  return sucesso({ lancamentos: count ?? 0 })
}
