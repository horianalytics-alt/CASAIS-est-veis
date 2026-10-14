'use server'

import {
  esquemaInscricaoPush,
  esquemaRemoverInscricaoPush,
  type EntradaInscricaoPush,
} from '@/lib/esquemas-pagamentos'
import { obterContextoDaFamilia } from './contexto-familia'
import {
  falha,
  falhaDeValidacao,
  sucesso,
  traduzErroDoBanco,
  type ResultadoAction,
} from './resultado'

export type { EntradaInscricaoPush }

/**
 * Inscrição de push do PRÓPRIO aparelho (botão "Ativar notificações").
 *
 * Sem estas actions o front gravaria direto do navegador em
 * push_subscriptions — o padrão que o R-13 está tirando do app. Aqui o
 * endpoint passa pela lista de serviços de push conhecidos (anti-SSRF) e as
 * chaves têm o tamanho conferido.
 *
 * Família e membro vêm da SESSÃO (get_user_family_id_self /
 * get_user_member_id_self); as policies push_insert_own/push_delete_own
 * conferem de novo. Tudo com o cliente do usuário: nenhuma service_role aqui.
 */
async function membroDaSessao() {
  const contexto = await obterContextoDaFamilia()
  if (!contexto.ok) return contexto
  const { supabase } = contexto.ctx
  const { data: memberId, error } = await supabase.rpc('get_user_member_id_self')
  if (error) return { ok: false as const, resultado: falha(traduzErroDoBanco(error)) }
  if (!memberId) return { ok: false as const, resultado: falha('Você não faz parte de nenhuma família.') }
  return { ok: true as const, ctx: { ...contexto.ctx, memberId } }
}

/**
 * Grava (ou regrava) a inscrição deste aparelho. Idempotente: chamar duas
 * vezes com o mesmo endpoint deixa UMA linha, com as chaves mais recentes, e
 * com as mesmas chaves não toca na linha existente.
 * Recebe o formato de PushSubscription.toJSON() — o front passa direto.
 */
export async function salvarInscricaoPush(input: EntradaInscricaoPush): Promise<ResultadoAction<void>> {
  const analise = esquemaInscricaoPush.safeParse(input)
  if (!analise.success) return falhaDeValidacao(analise.error)
  const { endpoint, keys } = analise.data

  const sessao = await membroDaSessao()
  if (!sessao.ok) return sessao.resultado
  const { supabase, familyId, memberId } = sessao.ctx

  const linha = { family_id: familyId, member_id: memberId, endpoint, p256dh: keys.p256dh, auth: keys.auth }

  // Inserir PRIMEIRO. Apagar antes e o insert falhar (rede, timeout) deixaria
  // o aparelho sem a inscrição que funcionava.
  const { error } = await supabase.from('push_subscriptions').insert(linha)
  if (!error) return sucesso()
  if (error.code !== '23505') return falha(traduzErroDoBanco(error))

  // 23505: este membro já tem este endpoint. Com as mesmas chaves, nada a
  // fazer. Com chaves diferentes, a linha antiga já não decifra nada neste
  // aparelho — trocá-la não perde inscrição viva. Não há policy de UPDATE
  // (de propósito), então a troca é apagar a do PRÓPRIO membro e inserir.
  const { data: atual, error: erroLer } = await supabase
    .from('push_subscriptions')
    .select('id, p256dh, auth')
    .eq('member_id', memberId)
    .eq('endpoint', endpoint)
    .maybeSingle()
  if (erroLer) return falha(traduzErroDoBanco(erroLer))
  if (!atual || (atual.p256dh === keys.p256dh && atual.auth === keys.auth)) return sucesso()

  const { error: erroApagar } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('id', atual.id)
    .eq('member_id', memberId)
  if (erroApagar) return falha(traduzErroDoBanco(erroApagar))

  const { error: erroInserir } = await supabase.from('push_subscriptions').insert(linha)
  // 23505 aqui = outra chamada do mesmo aparelho regravou no meio: existe.
  if (erroInserir && erroInserir.code !== '23505') return falha(traduzErroDoBanco(erroInserir))

  return sucesso()
}

/** Tira a inscrição deste aparelho (desativar notificações). Idempotente. */
export async function removerInscricaoPush(input: { endpoint: string }): Promise<ResultadoAction<void>> {
  const analise = esquemaRemoverInscricaoPush.safeParse(input)
  if (!analise.success) return falhaDeValidacao(analise.error)

  const sessao = await membroDaSessao()
  if (!sessao.ok) return sessao.resultado
  const { supabase, memberId } = sessao.ctx

  const { error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('member_id', memberId)
    .eq('endpoint', analise.data.endpoint)
  if (error) return falha(traduzErroDoBanco(error))

  return sucesso()
}
