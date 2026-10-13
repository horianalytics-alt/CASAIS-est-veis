'use server'

import { revalidatePath } from 'next/cache'
import {
  TIPOS_CONTA,
  esquemaArquivar,
  esquemaCriarConta,
  esquemaEditarConta,
  validarCicloDoCartao,
  type TipoConta,
} from '@/lib/esquemas-cadastro'
import { obterContextoDaFamilia } from './contexto-familia'
import { falha, falhaDeValidacao, sucesso, traduzErroDoBanco, type ResultadoAction } from './resultado'

export type { TipoConta } from '@/lib/esquemas-cadastro'

/*
 * Contas da família. Substitui a gravação direta do navegador em
 * dialogo-conta.tsx: aqui a regra do cartão (CHECK accounts_cartao_tem_ciclo)
 * é validada ANTES do banco e volta com erro por campo, em português.
 *
 * O tipo da conta não muda depois de criada: um cartão com faturas não pode
 * virar conta corrente. editarConta nem aceita o campo.
 */

const NAO_ENCONTRADA = 'Conta não encontrada.'

function revalidar() {
  for (const rota of ['/ajustes/contas', '/lancar', '/inicio', '/carteira', '/acerto']) revalidatePath(rota)
}

function errosPorCampo(erros: Record<string, string>): Record<string, string[]> {
  return Object.fromEntries(Object.entries(erros).map(([campo, msg]) => [campo, [msg]]))
}

export async function criarConta(input: {
  nome: string
  tipo: TipoConta
  saldoInicial: number
  diaFechamento?: number | null
  diaVencimento?: number | null
}): Promise<ResultadoAction<{ id: string }>> {
  const analise = esquemaCriarConta.safeParse(input)
  if (!analise.success) return falhaDeValidacao(analise.error)
  const conta = analise.data

  const contexto = await obterContextoDaFamilia()
  if (!contexto.ok) return contexto.resultado
  const { ctx } = contexto

  const { data: ultima, error: erroOrdem } = await ctx.supabase
    .from('accounts')
    .select('sort_order')
    .eq('family_id', ctx.familyId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (erroOrdem) return falha(traduzErroDoBanco(erroOrdem))

  const { data, error } = await ctx.supabase
    .from('accounts')
    .insert({
      family_id: ctx.familyId,
      name: conta.nome,
      type: conta.tipo,
      initial_balance: conta.saldoInicial,
      closing_day: conta.diaFechamento ?? null,
      due_day: conta.diaVencimento ?? null,
      sort_order: (ultima?.sort_order ?? 0) + 1,
    })
    .select('id')
    .single()
  if (error) return falha(traduzErroDoBanco(error))

  revalidar()
  return sucesso({ id: data.id })
}

export async function editarConta(input: {
  id: string
  nome?: string
  diaFechamento?: number | null
  diaVencimento?: number | null
}): Promise<ResultadoAction<void>> {
  const analise = esquemaEditarConta.safeParse(input)
  if (!analise.success) return falhaDeValidacao(analise.error)
  const { id, nome, diaFechamento, diaVencimento } = analise.data

  const contexto = await obterContextoDaFamilia()
  if (!contexto.ok) return contexto.resultado
  const { ctx } = contexto

  const { data: atual, error: erroAtual } = await ctx.supabase
    .from('accounts')
    .select('id,type,closing_day,due_day')
    .eq('id', id)
    .eq('family_id', ctx.familyId)
    .maybeSingle()
  if (erroAtual) return falha(traduzErroDoBanco(erroAtual))
  if (!atual) return falha(NAO_ENCONTRADA)

  const tipo = TIPOS_CONTA.find((t) => t === atual.type)
  if (!tipo) return falha('Não foi possível concluir. Tente de novo em instantes.')

  // Campo ausente = mantém o que está no banco; null = apagar.
  const fechamentoFinal = diaFechamento === undefined ? atual.closing_day : diaFechamento
  const vencimentoFinal = diaVencimento === undefined ? atual.due_day : diaVencimento
  const erros = validarCicloDoCartao(tipo, fechamentoFinal, vencimentoFinal)
  if (Object.keys(erros).length > 0) return falha('Confira os campos destacados.', errosPorCampo(erros))

  const alteracao: { name?: string; closing_day?: number | null; due_day?: number | null } = {}
  if (nome !== undefined) alteracao.name = nome
  if (diaFechamento !== undefined) alteracao.closing_day = diaFechamento
  if (diaVencimento !== undefined) alteracao.due_day = diaVencimento
  if (Object.keys(alteracao).length === 0) return sucesso()

  const { data, error } = await ctx.supabase
    .from('accounts')
    .update(alteracao)
    .eq('id', id)
    .eq('family_id', ctx.familyId)
    .select('id')
  if (error) return falha(traduzErroDoBanco(error))
  if ((data ?? []).length === 0) return falha(NAO_ENCONTRADA)

  revalidar()
  return sucesso()
}

export async function arquivarConta(input: { id: string; arquivar: boolean }): Promise<ResultadoAction<void>> {
  const analise = esquemaArquivar.safeParse(input)
  if (!analise.success) return falhaDeValidacao(analise.error)
  const { id, arquivar } = analise.data

  const contexto = await obterContextoDaFamilia()
  if (!contexto.ok) return contexto.resultado
  const { ctx } = contexto

  const { data, error } = await ctx.supabase
    .from('accounts')
    .update({ archived_at: arquivar ? new Date().toISOString() : null })
    .eq('id', id)
    .eq('family_id', ctx.familyId)
    .select('id')
  if (error) return falha(traduzErroDoBanco(error))
  if ((data ?? []).length === 0) return falha(NAO_ENCONTRADA)

  revalidar()
  return sucesso()
}
