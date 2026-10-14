'use server'

import { revalidatePath } from 'next/cache'
import { esquemaPagarFatura, type EntradaPagarFatura } from '@/lib/esquemas-pagamentos'
import { agendarNotificacao, resolverAutorDoPush } from '@/lib/push/notificar'
import { obterContextoDaFamilia } from './contexto-familia'
import {
  falha,
  falhaDeValidacao,
  sucesso,
  traduzErroDoBanco,
  type ResultadoAction,
} from './resultado'

export type { EntradaPagarFatura }

// Mesmos textos que pay_invoice levanta (00003): a tela mostra a mesma frase
// venha a recusa daqui ou do banco.
const CARTAO_NAO_ENCONTRADO = 'Cartão não encontrado nesta família'
const ORIGEM_INVALIDA = 'Conta de origem inválida'
const FALHA_GENERICA = 'Não foi possível concluir. Tente de novo em instantes.'

/**
 * Paga a fatura de um cartão pela RPC pay_invoice (R-13: antes o navegador
 * chamava a RPC direto, sem Zod, sem erro tratado e sem push).
 *
 * Ordem: Zod -> sessão + família (getUser, get_user_family_id_self) ->
 * autorização do RECURSO (o cartão e a conta de origem são desta família,
 * lidos pela sessão com RLS) -> RPC, que refaz a mesma checagem por dentro ->
 * push para o parceiro, depois da resposta.
 */
export async function pagarFatura(
  input: EntradaPagarFatura,
): Promise<ResultadoAction<{ pagamentoId: string }>> {
  const analise = esquemaPagarFatura.safeParse(input)
  if (!analise.success) return falhaDeValidacao(analise.error)
  const entrada = analise.data

  const contexto = await obterContextoDaFamilia()
  if (!contexto.ok) return contexto.resultado
  const { supabase, familyId, userId } = contexto.ctx

  const [contas, autor] = await Promise.all([
    supabase
      .from('accounts')
      .select('id, type')
      .eq('family_id', familyId)
      .in('id', [entrada.cartaoId, entrada.contaOrigemId]),
    resolverAutorDoPush(supabase, userId),
  ])
  if (contas.error) return falha(traduzErroDoBanco(contas.error))

  const cartao = contas.data.find((c) => c.id === entrada.cartaoId)
  if (!cartao || cartao.type !== 'cartao') {
    return falha(CARTAO_NAO_ENCONTRADO, { cartaoId: [CARTAO_NAO_ENCONTRADO] })
  }
  const origem = contas.data.find((c) => c.id === entrada.contaOrigemId)
  if (!origem || origem.type === 'cartao') {
    return falha(ORIGEM_INVALIDA, { contaOrigemId: [ORIGEM_INVALIDA] })
  }

  const { data: pagamentoId, error } = await supabase.rpc('pay_invoice', {
    p_card_account_id: entrada.cartaoId,
    p_from_account_id: entrada.contaOrigemId,
    p_invoice_year: entrada.anoFatura,
    p_invoice_month: entrada.mesFatura,
    p_date: entrada.data,
  })
  if (error) return falha(traduzErroDoBanco(error))
  if (!pagamentoId) return falha(FALHA_GENERICA)

  revalidatePath('/carteira')
  revalidatePath('/inicio')
  revalidatePath('/acerto')

  // Autor de outra família que a sessão do contexto (nunca deveria
  // acontecer): sem push, em vez de notificar a casa errada.
  agendarNotificacao(autor?.familyId === familyId ? autor : null, 'fatura')

  return sucesso({ pagamentoId })
}
