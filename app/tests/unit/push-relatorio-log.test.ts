// @vitest-environment node
//
// Observabilidade do envio de push. Bug de produção (2026-10-14): o Heitor
// ativou as notificações, a Carol lançou, nada chegou — e os logs da Vercel
// não tinham UMA linha sobre push, porque enviarNotificacao() só escrevia log
// em falha. Com zero inscrições no banco ela retornava { destinos: 0 } calada.
// Estes testes travam: todo envio deixa uma linha de resumo no log, e "zero
// aparelhos" é aviso (warn), não silêncio. Nenhuma linha leva endpoint nem
// chave do aparelho (os dois funcionam como credencial).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const estado = vi.hoisted(() => ({
  inscricoes: [] as Array<{ ids: string[]; endpoint: string; p256dh: string; auth: string }>,
  status: 201,
  corpoDoErro: '',
}))

vi.mock('server-only', () => ({}))
vi.mock('next/server', () => ({ after: vi.fn() }))
vi.mock('@/lib/supabase/servico', () => ({
  inscricoesDosOutrosMembros: async () => estado.inscricoes,
  apagarInscricoes: async (_f: string, ids: string[]) => ids.length,
}))
vi.mock('web-push', () => ({
  default: {
    sendNotification: async () => {
      if (estado.status >= 300)
        throw Object.assign(new Error('recusado'), { statusCode: estado.status, body: estado.corpoDoErro })
      return { statusCode: estado.status, body: '', headers: {} }
    },
  },
}))

import { enviarNotificacao } from '@/lib/push/notificar'

const AUTOR = {
  familyId: '11111111-1111-4111-8111-111111111111',
  memberId: '22222222-2222-4222-8222-222222222222',
  nome: 'Carol',
}
const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/segredo-do-aparelho'
const INSCRICAO = { ids: ['33333333-3333-4333-8333-333333333333'], endpoint: ENDPOINT, p256dh: 'p'.repeat(87), auth: 'a'.repeat(22) }

function linhas(spy: { mock: { calls: unknown[][] } }): string[] {
  return spy.mock.calls.map((c) => c.map(String).join(' '))
}

describe('enviarNotificacao: resumo no log', () => {
  let info: ReturnType<typeof vi.spyOn>
  let warn: ReturnType<typeof vi.spyOn>
  let error: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'BPub'
    process.env.VAPID_PRIVATE_KEY = 'priv'
    estado.inscricoes = []
    estado.status = 201
    estado.corpoDoErro = ''
    info = vi.spyOn(console, 'info').mockImplementation(() => {})
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    error = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => vi.restoreAllMocks())

  it('zero aparelhos inscritos vira AVISO no log, com o evento', async () => {
    const r = await enviarNotificacao(AUTOR, 'lancamento')
    expect(r.destinos).toBe(0)
    expect(linhas(warn)).toEqual([
      '[push] lancamento: nenhum aparelho inscrito nos outros membros da família — nada enviado',
    ])
  })

  it('envio aceito deixa uma linha de resumo com as contagens', async () => {
    estado.inscricoes = [INSCRICAO]
    await enviarNotificacao(AUTOR, 'lancamento')
    expect(linhas(info)).toEqual(['[push] lancamento: destinos=1 enviados=1 apagados=0 pulados=0 falhas=0'])
  })

  it('recusa do serviço de push loga status E o corpo da resposta (é ali que o FCM explica um 403 de VAPID)', async () => {
    estado.inscricoes = [INSCRICAO]
    estado.status = 403
    estado.corpoDoErro = 'the key in the authorization header does not correspond to the sender ID'
    await enviarNotificacao(AUTOR, 'lancamento')
    const tudo = [...linhas(error), ...linhas(info)].join('\n')
    expect(tudo).toContain('status 403')
    expect(tudo).toContain('does not correspond to the sender ID')
    expect(linhas(info)).toEqual(['[push] lancamento: destinos=1 enviados=0 apagados=0 pulados=0 falhas=1'])
  })

  it('nenhuma linha de log carrega endpoint ou chave do aparelho', async () => {
    estado.inscricoes = [INSCRICAO]
    estado.status = 500
    estado.corpoDoErro = 'erro interno'
    await enviarNotificacao(AUTOR, 'lancamento')
    const tudo = [...linhas(error), ...linhas(info), ...linhas(warn)].join('\n')
    expect(tudo).not.toContain('segredo-do-aparelho')
    expect(tudo).not.toContain('p'.repeat(20))
    expect(tudo).not.toContain('a'.repeat(20))
  })
})
