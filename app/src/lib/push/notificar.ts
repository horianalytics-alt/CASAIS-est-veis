import 'server-only'

import { after } from 'next/server'
import webpush from 'web-push'
import type { ClienteServidor } from '@/actions/contexto-familia'
import {
  apagarInscricoes,
  inscricoesDosOutrosMembros,
  type InscricaoDeDestino,
} from '@/lib/supabase/servico'
import { ehEndpointDePushAceito } from './endpoints'
import { mensagemDoEvento, type EventoPush, type MensagemPush } from './mensagens'

/**
 * Notificação push para os OUTROS membros da família de quem agiu.
 *
 * Fluxo (plano R-1):
 *   1. a Server Action resolve o autor PELA SESSÃO (resolverAutorDoPush),
 *      em paralelo com a própria gravação;
 *   2. depois da gravação dar certo, agendarNotificacao() chama after(): a
 *      resposta vai para o usuário sem esperar o push (na Vercel, after vira
 *      waitUntil e a função vive até o envio terminar);
 *   3. enviarNotificacao() lê as inscrições pelo servico.ts (service_role,
 *      filtrado pela família do autor e SEM o autor), manda com web-push e
 *      apaga as que o serviço de push declarou mortas (404/410).
 *
 * Push é efeito colateral: nada aqui lança nem muda o ResultadoAction da
 * action. Falha vira log — sem endpoint nem chave no log, porque os dois
 * funcionam como credencial do aparelho de alguém.
 */

export type { EventoPush }

export type AutorDoPush = { familyId: string; memberId: string; nome: string }

export type ChavesVapid = { publicKey: string; privateKey: string; subject: string }

export type RelatorioDeEnvio = {
  /** aparelhos de destino: endpoints distintos dos outros membros, já sem os que também são do autor */
  destinos: number
  /** aceitas pelo serviço de push */
  enviados: number
  /** apagadas por 404/410 */
  apagados: number
  /** puladas por endpoint fora dos serviços de push conhecidos (anti-SSRF) */
  pulados: number
  /** recusadas por outro motivo (ficam no banco) */
  falhas: number
  motivo?: 'sem-vapid' | 'erro'
}

/**
 * RFC 8292 aceita `mailto:` ou URL https. URL do app em vez de e-mail: o
 * subject vai para FCM/Apple/Mozilla em todo envio.
 */
const SUBJECT_PADRAO = 'https://financascasais.vercel.app'
/** Aviso de "registrou um lançamento" com mais de 1 dia de atraso é ruído. */
const TTL_SEGUNDOS = 86_400
const TIMEOUT_MS = 10_000

function chavesVapid(): ChavesVapid | null {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim()
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim()
  if (!publicKey || !privateKey) return null
  return { publicKey, privateKey, subject: process.env.VAPID_SUBJECT?.trim() || SUBJECT_PADRAO }
}

/**
 * Quem agiu, pela SESSÃO dele: a linha de family_members do próprio usuário,
 * lida com o cliente do usuário (RLS ligado). É a mesma consulta que
 * get_user_family_id_self() faz (00006: WHERE user_id = auth.uid()), trazendo
 * também o membro e o nome numa ida só. `userId` vem de getUser() na action.
 *
 * Nunca lança: sem autor resolvido, simplesmente não há notificação.
 */
export async function resolverAutorDoPush(
  supabase: ClienteServidor,
  userId: string,
): Promise<AutorDoPush | null> {
  try {
    const { data, error } = await supabase
      .from('family_members')
      .select('id, family_id, display_name')
      .eq('user_id', userId)
      .maybeSingle()
    if (error || !data) return null
    return { familyId: data.family_id, memberId: data.id, nome: data.display_name }
  } catch {
    return null
  }
}

/** Monta os 3 argumentos de webpush.sendNotification. Exportado para o teste com o web-push real. */
export function montarEnvio(inscricao: InscricaoDeDestino, mensagem: MensagemPush, vapid: ChavesVapid) {
  return {
    assinatura: { endpoint: inscricao.endpoint, keys: { p256dh: inscricao.p256dh, auth: inscricao.auth } },
    corpo: JSON.stringify(mensagem),
    opcoes: {
      vapidDetails: { subject: vapid.subject, publicKey: vapid.publicKey, privateKey: vapid.privateKey },
      TTL: TTL_SEGUNDOS,
      // 'high': com o Android em Doze (tela apagada, app fechado), o FCM só
      // entrega na hora mensagem de alta prioridade; 'normal' pode esperar a
      // próxima janela de manutenção do sistema.
      urgency: 'high' as const,
      timeout: TIMEOUT_MS,
    },
  }
}

function statusDoErro(motivo: unknown): number | null {
  const status = (motivo as { statusCode?: unknown } | null)?.statusCode
  return typeof status === 'number' ? status : null
}

/**
 * Corpo da resposta do serviço de push (WebPushError.body). É onde o FCM
 * explica o motivo de um 403 — p.ex. par VAPID que não fecha. Cortado e em
 * uma linha; não contém o endpoint nem as chaves do aparelho.
 */
function corpoDoErro(motivo: unknown): string {
  const corpo = (motivo as { body?: unknown } | null)?.body
  if (typeof corpo !== 'string' || corpo.trim() === '') return ''
  return Array.from(corpo.replace(/\s+/g, ' ').trim()).slice(0, 200).join('')
}

/**
 * Uma linha por envio, SEMPRE. Sem ela, "ninguém inscrito" e "push nunca
 * tentado" eram indistinguíveis nos logs da Vercel (bug de 2026-10-14).
 * Só contagens: nada de endpoint, chave ou id.
 */
function registrarResumo(evento: EventoPush, r: RelatorioDeEnvio): void {
  if (r.destinos === 0) {
    console.warn(`[push] ${evento}: nenhum aparelho inscrito nos outros membros da família — nada enviado`)
    return
  }
  console.info(
    `[push] ${evento}: destinos=${r.destinos} enviados=${r.enviados} apagados=${r.apagados} pulados=${r.pulados} falhas=${r.falhas}`,
  )
}

export async function enviarNotificacao(
  autor: AutorDoPush,
  evento: EventoPush,
  quantidade = 1,
): Promise<RelatorioDeEnvio> {
  const vazio: RelatorioDeEnvio = { destinos: 0, enviados: 0, apagados: 0, pulados: 0, falhas: 0 }
  try {
    const vapid = chavesVapid()
    if (!vapid) {
      console.warn('[push] VAPID não configurado: notificação não enviada.')
      return { ...vazio, motivo: 'sem-vapid' }
    }

    const todas = await inscricoesDosOutrosMembros(autor.familyId, autor.memberId)
    const aceitas = todas.filter((i) => ehEndpointDePushAceito(i.endpoint))
    const mensagem = mensagemDoEvento(evento, autor.nome, quantidade)

    const resultados = await Promise.allSettled(
      aceitas.map((inscricao) => {
        const { assinatura, corpo, opcoes } = montarEnvio(inscricao, mensagem, vapid)
        return webpush.sendNotification(assinatura, corpo, opcoes)
      }),
    )

    const mortas: string[] = []
    let enviados = 0
    let falhas = 0
    resultados.forEach((resultado, k) => {
      if (resultado.status === 'fulfilled') {
        enviados++
        return
      }
      const status = statusDoErro(resultado.reason)
      // 410 Gone (RFC 8030): inscrição expirada/revogada. 404: o serviço não
      // conhece mais a inscrição (autopush da Mozilla). Os dois = token morto.
      if (status === 404 || status === 410) {
        mortas.push(...aceitas[k].ids)
        return
      }
      falhas++
      const corpo = corpoDoErro(resultado.reason)
      console.error(
        `[push] envio recusado (status ${status ?? 'sem status'}) para a inscrição ${aceitas[k].ids[0].slice(0, 8)}${corpo ? `: ${corpo}` : ''}`,
      )
    })

    const apagados = mortas.length > 0 ? await apagarInscricoes(autor.familyId, mortas) : 0
    const relatorio = { destinos: todas.length, enviados, apagados, pulados: todas.length - aceitas.length, falhas }
    registrarResumo(evento, relatorio)
    return relatorio
  } catch (e) {
    console.error('[push] falha no envio:', e instanceof Error ? e.message : 'erro desconhecido')
    return { ...vazio, motivo: 'erro' }
  }
}

/**
 * Agenda o envio para DEPOIS da resposta. Chamar só depois que a gravação
 * deu certo. `autor` nulo (sessão sem membro) = nada a fazer.
 */
export function agendarNotificacao(autor: AutorDoPush | null, evento: EventoPush, quantidade = 1): void {
  if (!autor) return
  after(() => enviarNotificacao(autor, evento, quantidade))
}
