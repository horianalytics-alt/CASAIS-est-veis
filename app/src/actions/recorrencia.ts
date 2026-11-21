'use server'

import { revalidatePath } from 'next/cache'
import {
  esquemaAlterarValorRecorrencia,
  esquemaCriarRecorrencia,
  esquemaEncerrarRecorrencia,
  esquemaResponderCobranca,
  primeiroDiaDoMes,
  type EntradaAlterarValorRecorrencia,
  type EntradaCriarRecorrencia,
  type EntradaEncerrarRecorrencia,
  type EntradaResponderCobranca,
} from '@/lib/esquemas-recorrencia'
import { agendarNotificacao, resolverAutorDoPush } from '@/lib/push/notificar'
import { obterContextoDaFamilia } from './contexto-familia'
import { falha, falhaDeValidacao, sucesso, traduzErroDoBanco, type ResultadoAction } from './resultado'

export type {
  EntradaAlterarValorRecorrencia,
  EntradaCriarRecorrencia,
  EntradaEncerrarRecorrencia,
  EntradaResponderCobranca,
}

/*
 * Recorrência mensal (assinaturas e fixos).
 * Plano: docs/planos/estrutura-recorrencia.md. Banco: 00019_recorrencia.sql.
 *
 * Toda action, nesta ordem:
 *   1. Zod; daqui em diante só o valor parseado;
 *   2. usuário (getUser) e família resolvidos no servidor
 *      (obterContextoDaFamilia);
 *   3. RPC recorrencia_*: a autorização do recurso é o filtro
 *      family_id = família da sessão DENTRO da RPC (auth.uid()), e o RLS/grant
 *      de recurring_rules e transactions é a segunda camada.
 * A família nunca vem do cliente.
 */

export type CobrancaPendente = {
  id: string
  regraId: string
  tipo: 'receita' | 'despesa'
  descricao: string
  valor: number
  /** 'YYYY-MM-DD', o dia da cobrança. */
  data: string
  contaId: string
  /** 'YYYY-MM', o mês de competência. */
  competencia: string
}

function revalidar() {
  for (const rota of ['/inicio', '/lancar', '/carteira', '/acerto', '/analises', '/ajustes']) revalidatePath(rota)
}

/**
 * Cria a assinatura (regra) e agenda o mês atual + 11 como pendentes. Se vier
 * "já pago", só o 1º mês nasce pago. Em cartão, "já pago" é recusado pelo banco
 * (o cartão é quitado pela fatura).
 */
export async function criarRecorrencia(
  input: EntradaCriarRecorrencia,
): Promise<ResultadoAction<{ regraId: string; lancamentosGerados: number }>> {
  const analise = esquemaCriarRecorrencia.safeParse(input)
  if (!analise.success) return falhaDeValidacao(analise.error)
  const e = analise.data

  const contexto = await obterContextoDaFamilia()
  if (!contexto.ok) return contexto.resultado
  const { supabase, familyId, userId } = contexto.ctx

  const autor = resolverAutorDoPush(supabase, userId)
  // Benefício e fútil só existem em despesa (mesma regra de montarPatchIndividual).
  const ehDespesa = e.tipo === 'despesa'

  const { data, error } = await supabase.rpc('recorrencia_criar', {
    p_item: {
      type: e.tipo,
      description: e.descricao,
      amount: e.valor,
      date: e.data,
      account_id: e.contaId,
      category_id: e.categoriaId ?? null,
      payment_method_id: e.formaDePagamentoId ?? null,
      owner_member_id: e.responsavelId ?? null,
      owner_share: e.cotaDoResponsavel ?? null,
      paid_by_member_id: e.pagoPorId ?? null,
      is_paid: e.estaPago,
      paid_date: e.estaPago ? (e.dataDoPagamento ?? null) : null,
      notes: e.observacao ? e.observacao : null,
      is_benefit: ehDespesa ? e.ehBeneficio : false,
      is_futile: ehDespesa ? e.ehFutil : false,
      futile_label: ehDespesa && e.ehFutil ? (e.rotuloDoFutil ? e.rotuloDoFutil : null) : null,
    },
  })
  if (error) return falha(traduzErroDoBanco(error))

  const linha = Array.isArray(data) ? data[0] : null
  if (!linha) return falha('Não foi possível concluir. Tente de novo em instantes.')

  revalidar()
  const quem = await autor
  agendarNotificacao(quem?.familyId === familyId ? quem : null, 'lancamento', 1)
  return sucesso({ regraId: linha.regra_id, lancamentosGerados: linha.lancamentos })
}

/**
 * A fila do pop-up, em ordem: vencidas, não pagas, não adiadas, fora as de
 * cartão e as de conta arquivada. Também renova o horizonte de 12 meses.
 */
export async function carregarCobrancasPendentes(): Promise<ResultadoAction<CobrancaPendente[]>> {
  const contexto = await obterContextoDaFamilia()
  if (!contexto.ok) return contexto.resultado
  const { supabase } = contexto.ctx

  const { data, error } = await supabase.rpc('recorrencia_fila_de_cobranca')
  if (error) return falha(traduzErroDoBanco(error))

  const fila: CobrancaPendente[] = (data ?? []).map((l) => ({
    id: l.id,
    regraId: l.recurring_rule_id,
    tipo: l.type === 'receita' ? 'receita' : 'despesa',
    descricao: l.description,
    valor: Number(l.amount),
    data: l.date,
    contaId: l.account_id,
    competencia: l.recurring_period.slice(0, 7),
  }))
  return sucesso(fila)
}

/**
 * Resposta ao pop-up. 'ja_respondida' é SUCESSO: o outro membro respondeu
 * antes (ou a cobrança já não está na fila) — o front só tira da fila.
 */
export async function responderCobranca(
  input: EntradaResponderCobranca,
): Promise<ResultadoAction<{ estado: 'pago' | 'adiado' | 'ja_respondida' }>> {
  const analise = esquemaResponderCobranca.safeParse(input)
  if (!analise.success) return falhaDeValidacao(analise.error)
  const e = analise.data

  const contexto = await obterContextoDaFamilia()
  if (!contexto.ok) return contexto.resultado
  const { supabase } = contexto.ctx

  const { data, error } = await supabase.rpc('recorrencia_responder', {
    p_lancamento_id: e.lancamentoId,
    p_resposta: e.resposta,
    // 'ainda_nao' ignora a data.
    p_data_pagamento: e.resposta === 'pago' ? (e.dataPagamento ?? undefined) : undefined,
  })
  if (error) {
    const mensagem = traduzErroDoBanco(error)
    return mensagem.startsWith('A data do pagamento') || mensagem.startsWith('Data do pagamento')
      ? falha(mensagem, { dataPagamento: [mensagem] })
      : falha(mensagem)
  }
  if (data !== 'pago' && data !== 'adiado' && data !== 'ja_respondida') {
    return falha('Não foi possível concluir. Tente de novo em instantes.')
  }

  if (data === 'pago') revalidar()
  return sucesso({ estado: data })
}

/** "Deste mês em diante": muda o valor da assinatura e dos pendentes a partir do mês. */
export async function alterarValorRecorrencia(
  input: EntradaAlterarValorRecorrencia,
): Promise<ResultadoAction<{ atualizados: number }>> {
  const analise = esquemaAlterarValorRecorrencia.safeParse(input)
  if (!analise.success) return falhaDeValidacao(analise.error)
  const e = analise.data

  const contexto = await obterContextoDaFamilia()
  if (!contexto.ok) return contexto.resultado
  const { supabase } = contexto.ctx

  const { data, error } = await supabase.rpc('recorrencia_alterar_valor', {
    p_regra_id: e.regraId,
    p_valor: e.valor,
    p_a_partir: primeiroDiaDoMes(e.aPartirDe),
  })
  if (error) return falha(traduzErroDoBanco(error))

  revalidar()
  return sucesso({ atualizados: data ?? 0 })
}

/** Encerra a assinatura: o último mês cobrado é `ultimoMes`; pendentes depois dele somem. */
export async function encerrarRecorrencia(
  input: EntradaEncerrarRecorrencia,
): Promise<ResultadoAction<{ removidos: number }>> {
  const analise = esquemaEncerrarRecorrencia.safeParse(input)
  if (!analise.success) return falhaDeValidacao(analise.error)
  const e = analise.data

  const contexto = await obterContextoDaFamilia()
  if (!contexto.ok) return contexto.resultado
  const { supabase } = contexto.ctx

  const { data, error } = await supabase.rpc('recorrencia_encerrar', {
    p_regra_id: e.regraId,
    p_ultimo_mes: primeiroDiaDoMes(e.ultimoMes),
  })
  if (error) return falha(traduzErroDoBanco(error))

  revalidar()
  return sucesso({ removidos: data ?? 0 })
}
