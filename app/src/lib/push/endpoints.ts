/**
 * Quais URLs de inscrição push o servidor aceita como destino.
 *
 * POR QUÊ: o endpoint vem do navegador do usuário e o NOSSO servidor faz um
 * POST para ele toda vez que o parceiro lança algo. Sem esta lista, um membro
 * registra `https://qualquer-host/...` e transforma o envio de push em SSRF
 * (o servidor da Vercel batendo onde o atacante quiser). A checagem roda nos
 * DOIS pontos: ao salvar a inscrição (Zod) e na hora de enviar — a policy de
 * INSERT de push_subscriptions deixa o navegador gravar direto pelo REST, sem
 * passar pela action.
 *
 * Serviços cobertos (são os que os navegadores usam de fato):
 *   Chrome, Edge-Chromium, Opera, Samsung, Brave -> fcm.googleapis.com
 *   Firefox                                     -> *.push.services.mozilla.com
 *   Safari / iOS (PWA instalado)                -> web.push.apple.com
 *   Edge legado / Windows                       -> *.notify.windows.com
 * Fica em código (não CHECK no banco) para incluir serviço novo sem migration.
 */
const HOSTS_EXATOS = new Set(['fcm.googleapis.com', 'web.push.apple.com', 'updates.push.services.mozilla.com'])
const SUFIXOS = ['.push.services.mozilla.com', '.notify.windows.com']

export const LIMITE_ENDPOINT = 2048

export function ehEndpointDePushAceito(endpoint: string): boolean {
  if (typeof endpoint !== 'string' || endpoint.length === 0 || endpoint.length > LIMITE_ENDPOINT) return false

  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    return false
  }

  if (url.protocol !== 'https:') return false
  if (url.port !== '') return false // só a porta padrão do https
  if (url.username !== '' || url.password !== '') return false

  const host = url.hostname.toLowerCase()
  return HOSTS_EXATOS.has(host) || SUFIXOS.some((sufixo) => host.endsWith(sufixo))
}
