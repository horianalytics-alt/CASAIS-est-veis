// @vitest-environment node
//
// A biblioteca web-push DE VERDADE (sem mock): monta a requisição que o nosso
// código mandaria ao serviço de push, e o teste DECRIPTA o corpo com a chave
// privada do "aparelho" — como o navegador faria. Prova que a criptografia
// aes128gcm (RFC 8291), o VAPID (RFC 8292) e o payload do sw.js
// ({ titulo, corpo, url }) estão certos, sem precisar de um celular.
import { createECDH, randomBytes } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import webpush from 'web-push'
// http_ece vem com o web-push (dependência dele); é o mesmo decriptador do
// lado receptor que o web-push usa nos próprios testes.
// @ts-expect-error -- pacote sem tipos
import ece from 'http_ece'

vi.mock('server-only', () => ({}))
vi.mock('next/server', () => ({ after: vi.fn() }))

import { montarEnvio } from '@/lib/push/notificar'
import { mensagemDoEvento } from '@/lib/push/mensagens'

function aparelhoDeTeste() {
  const ecdh = createECDH('prime256v1')
  ecdh.generateKeys()
  const authSecret = randomBytes(16)
  return {
    ecdh,
    authSecret,
    inscricao: {
      ids: ['33333333-3333-4333-8333-333333333333'],
      endpoint: 'https://fcm.googleapis.com/fcm/send/teste-real',
      p256dh: ecdh.getPublicKey().toString('base64url'),
      auth: authSecret.toString('base64url'),
    },
  }
}

describe('envio real com web-push (requisição montada, sem rede)', () => {
  const vapid = { ...webpush.generateVAPIDKeys(), subject: 'https://financascasais.vercel.app' }
  const mensagem = mensagemDoEvento('lancamento', 'Carol')

  it('o corpo decriptado pelo aparelho é exatamente o payload do sw.js', () => {
    const { ecdh, authSecret, inscricao } = aparelhoDeTeste()
    const { assinatura, corpo, opcoes } = montarEnvio(inscricao, mensagem, vapid)
    const req = webpush.generateRequestDetails(assinatura, corpo, opcoes)

    const claro = ece.decrypt(req.body, { version: 'aes128gcm', privateKey: ecdh, authSecret })
    expect(JSON.parse(claro.toString('utf8'))).toEqual({
      titulo: 'Finanças a Dois',
      corpo: 'Carol registrou um lançamento',
      url: '/inicio',
    })
  })

  it('cabeçalhos: VAPID com a chave pública, aes128gcm, TTL de 24h, urgência normal', () => {
    const { inscricao } = aparelhoDeTeste()
    const { assinatura, corpo, opcoes } = montarEnvio(inscricao, mensagem, vapid)
    const req = webpush.generateRequestDetails(assinatura, corpo, opcoes)

    expect(req.method).toBe('POST')
    expect(req.endpoint).toBe(inscricao.endpoint)
    expect(req.headers['Content-Encoding']).toBe('aes128gcm')
    expect(String(req.headers.TTL)).toBe('86400')
    expect(req.headers.Urgency).toBe('normal')
    expect(req.headers.Authorization).toMatch(new RegExp(`^vapid t=[\\w-]+\\.[\\w-]+\\.[\\w-]+, k=${vapid.publicKey}$`))
  })

  it('o JWT do VAPID aponta para a origem do serviço de push e traz o subject do app', () => {
    const { inscricao } = aparelhoDeTeste()
    const { assinatura, corpo, opcoes } = montarEnvio(inscricao, mensagem, vapid)
    const auth = String(webpush.generateRequestDetails(assinatura, corpo, opcoes).headers.Authorization)
    const jwt = auth.slice('vapid t='.length, auth.indexOf(','))
    const claims = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'))
    expect(claims.aud).toBe('https://fcm.googleapis.com')
    expect(claims.sub).toBe('https://financascasais.vercel.app')
    expect(claims.exp).toBeGreaterThan(Date.now() / 1000)
  })

  it('o corpo cifrado não contém o texto em claro', () => {
    const { inscricao } = aparelhoDeTeste()
    const { assinatura, corpo, opcoes } = montarEnvio(inscricao, mensagem, vapid)
    const req = webpush.generateRequestDetails(assinatura, corpo, opcoes)
    expect(Buffer.from(req.body).includes(Buffer.from('Carol'))).toBe(false)
  })
})
