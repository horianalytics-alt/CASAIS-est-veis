'use server'

import { revalidatePath } from 'next/cache'
import { esquemaRegistrarAcerto, type EntradaRegistrarAcerto } from '@/lib/esquemas-pagamentos'
import { agendarNotificacao, resolverAutorDoPush } from '@/lib/push/notificar'
import { obterContextoDaFamilia } from './contexto-familia'
import {
  falha,
  falhaDeValidacao,
  sucesso,
  traduzErroDoBanco,
  type ResultadoAction,
} from './resultado'

export type { EntradaRegistrarAcerto }

const MEMBRO_NAO_ENCONTRADO = 'Membro não encontrado nesta família'
const FALHA_GENERICA = 'Não foi possível concluir. Tente de novo em instantes.'

/**
 * Registra um acerto de contas pela RPC settle_up (R-13: antes o navegador
 * chamava a RPC direto).
 *
 * settle_up é a versão da 00010: grava `settlement_to_member_id =
 * p_to_member_id`, e é essa coluna que faz a v_settlement abater a dívida.
 * O mapeamento é fixo — deMembroId -> p_from_member_id (quem PAGA),
 * paraMembroId -> p_to_member_id (quem RECEBE). Trocar os dois inverteria a
 * dívida em vez de quitá-la.
 *
 * Ordem: Zod -> sessão + família -> autorização do RECURSO (os dois membros
 * são desta família, lidos pela sessão) -> RPC (que só acha conta corrente
 * dentro da família de quem chama) -> push, depois da resposta.
 */
export async function registrarAcerto(
  input: EntradaRegistrarAcerto,
): Promise<ResultadoAction<{ acertoId: string }>> {
  const analise = esquemaRegistrarAcerto.safeParse(input)
  if (!analise.success) return falhaDeValidacao(analise.error)
  const entrada = analise.data

  const contexto = await obterContextoDaFamilia()
  if (!contexto.ok) return contexto.resultado
  const { supabase, familyId, userId } = contexto.ctx

  const [membros, autor] = await Promise.all([
    supabase
      .from('family_members')
      .select('id')
      .eq('family_id', familyId)
      .in('id', [entrada.deMembroId, entrada.paraMembroId]),
    resolverAutorDoPush(supabase, userId),
  ])
  if (membros.error) return falha(traduzErroDoBanco(membros.error))

  const ids = new Set(membros.data.map((m) => m.id))
  if (!ids.has(entrada.deMembroId)) {
    return falha(MEMBRO_NAO_ENCONTRADO, { deMembroId: [MEMBRO_NAO_ENCONTRADO] })
  }
  if (!ids.has(entrada.paraMembroId)) {
    return falha(MEMBRO_NAO_ENCONTRADO, { paraMembroId: [MEMBRO_NAO_ENCONTRADO] })
  }

  const { data: acertoId, error } = await supabase.rpc('settle_up', {
    p_from_member_id: entrada.deMembroId,
    p_to_member_id: entrada.paraMembroId,
    p_amount: entrada.valor,
    p_date: entrada.data,
  })
  if (error) return falha(traduzErroDoBanco(error))
  if (!acertoId) return falha(FALHA_GENERICA)

  revalidatePath('/acerto')
  revalidatePath('/inicio')
  revalidatePath('/carteira')

  agendarNotificacao(autor?.familyId === familyId ? autor : null, 'acerto')

  return sucesso({ acertoId })
}
