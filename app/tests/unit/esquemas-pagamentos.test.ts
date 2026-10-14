import { describe, expect, it } from 'vitest'
import '@/actions/resultado' // registra o mapa de erros em português do Zod
import {
  esquemaInscricaoPush,
  esquemaPagarFatura,
  esquemaRegistrarAcerto,
} from '@/lib/esquemas-pagamentos'

const U1 = '11111111-1111-4111-8111-111111111111'
const U2 = '22222222-2222-4222-8222-222222222222'

function campos(r: { success: boolean; error?: { flatten: () => { fieldErrors: Record<string, string[] | undefined> } } }) {
  return r.success ? {} : r.error!.flatten().fieldErrors
}

describe('esquemaPagarFatura', () => {
  const valido = { cartaoId: U1, contaOrigemId: U2, anoFatura: 2026, mesFatura: 10, data: '2026-10-14' }

  it('aceita a entrada que o diálogo de fatura manda hoje', () => {
    expect(esquemaPagarFatura.safeParse(valido)).toEqual({ success: true, data: valido })
  })

  it('mês 13 e ano 1999 são recusados', () => {
    const r = esquemaPagarFatura.safeParse({ ...valido, mesFatura: 13, anoFatura: 1999 })
    expect(campos(r).mesFatura).toEqual(['Fatura inválida.'])
    expect(campos(r).anoFatura).toEqual(['Fatura inválida.'])
  })

  it('mês fracionário é recusado', () => {
    expect(campos(esquemaPagarFatura.safeParse({ ...valido, mesFatura: 10.5 })).mesFatura).toEqual(['Fatura inválida.'])
  })

  it('data é obrigatória (sem ela a RPC usaria o dia em UTC)', () => {
    const { data: _sem, ...semData } = valido
    expect(campos(esquemaPagarFatura.safeParse(semData)).data).toEqual(['Informe a data.'])
  })

  it('data impossível é recusada', () => {
    expect(campos(esquemaPagarFatura.safeParse({ ...valido, data: '2026-02-30' })).data).toEqual(['Data inválida.'])
  })

  it('id que não é uuid é recusado', () => {
    expect(campos(esquemaPagarFatura.safeParse({ ...valido, cartaoId: 'x' })).cartaoId).toEqual(['Escolha uma opção válida.'])
  })

  it('cartão e conta de origem iguais são recusados', () => {
    expect(campos(esquemaPagarFatura.safeParse({ ...valido, contaOrigemId: U1 })).contaOrigemId)
      .toEqual(['Conta de origem inválida'])
  })
})

describe('tipo errado nunca vaza mensagem do Zod em inglês', () => {
  it('fatura, inscrição e remoção com tipos trocados: só português', () => {
    const resultados = [
      esquemaPagarFatura.safeParse({ cartaoId: 5, contaOrigemId: null, anoFatura: '2026', mesFatura: 10, data: 20261014 }),
      esquemaRegistrarAcerto.safeParse({ deMembroId: [], paraMembroId: {}, valor: null, data: true }),
      esquemaInscricaoPush.safeParse({ endpoint: { x: 1 }, keys: { p256dh: 1, auth: [] }, expirationTime: 'x' }),
    ]
    const mensagens = resultados.flatMap((r) => (r.success ? [] : r.error.issues.map((i) => i.message)))
    expect(mensagens.length).toBeGreaterThan(0)
    for (const m of mensagens) expect(m).not.toMatch(/Expected|Required|Invalid|received/)
  })
})

describe('esquemaRegistrarAcerto', () => {
  const valido = { deMembroId: U1, paraMembroId: U2, valor: 546.47, data: '2026-10-14' }

  it('aceita a entrada que o diálogo de acerto manda hoje', () => {
    expect(esquemaRegistrarAcerto.safeParse(valido)).toEqual({ success: true, data: valido })
  })

  it('de = para é recusado no campo paraMembroId com o texto da RPC', () => {
    expect(campos(esquemaRegistrarAcerto.safeParse({ ...valido, paraMembroId: U1 })).paraMembroId)
      .toEqual(['O acerto precisa ser entre duas pessoas diferentes'])
  })

  it('valor zero, negativo, NaN e Infinity são recusados', () => {
    for (const valor of [0, -10, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(esquemaRegistrarAcerto.safeParse({ ...valido, valor }).success).toBe(false)
    }
  })

  it('valor com 3 casas é RECUSADO, não arredondado (P-009)', () => {
    expect(campos(esquemaRegistrarAcerto.safeParse({ ...valido, valor: 1.005 })).valor)
      .toEqual(['Use no máximo 2 casas decimais.'])
  })

  it('ruído de ponto flutuante de um valor de 2 casas é aceito e normalizado', () => {
    const r = esquemaRegistrarAcerto.safeParse({ ...valido, valor: 0.1 + 0.2 })
    expect(r.success && r.data.valor).toBe(0.3)
  })

  it('valor em texto é recusado (o diálogo manda número)', () => {
    expect(campos(esquemaRegistrarAcerto.safeParse({ ...valido, valor: '546,47' })).valor).toEqual(['Valor inválido.'])
  })

  it('valor acima do teto de numeric(14,2) usado no app é recusado', () => {
    expect(campos(esquemaRegistrarAcerto.safeParse({ ...valido, valor: 100_000_000 })).valor)
      .toEqual(['Esse valor é alto demais.'])
  })
})

describe('esquemaInscricaoPush (formato de PushSubscription.toJSON())', () => {
  // 65 bytes começando em 0x04 (ponto P-256 não comprimido) e 16 bytes de auth,
  // em base64url sem padding — o que o navegador entrega.
  const p256dh = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 7)]).toString('base64url')
  const auth = Buffer.alloc(16, 9).toString('base64url')
  const valido = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc:APA91b',
    expirationTime: null,
    keys: { p256dh, auth },
  }

  it('aceita o toJSON() de uma inscrição real e descarta expirationTime', () => {
    const r = esquemaInscricaoPush.safeParse(valido)
    expect(r.success && r.data).toEqual({ endpoint: valido.endpoint, keys: { p256dh, auth } })
  })

  it('endpoint fora dos serviços de push conhecidos é recusado', () => {
    const r = esquemaInscricaoPush.safeParse({ ...valido, endpoint: 'https://evil.example/x' })
    expect(campos(r).endpoint).toEqual(['Serviço de notificação não reconhecido.'])
  })

  it('p256dh com tamanho errado é recusado', () => {
    const r = esquemaInscricaoPush.safeParse({ ...valido, keys: { p256dh: p256dh.slice(0, 40), auth } })
    expect(r.success).toBe(false)
  })

  it('p256dh que não começa com 0x04 é recusado', () => {
    const torto = Buffer.concat([Buffer.from([2]), Buffer.alloc(64, 7)]).toString('base64url')
    expect(esquemaInscricaoPush.safeParse({ ...valido, keys: { p256dh: torto, auth } }).success).toBe(false)
  })

  it('auth com tamanho errado ou caractere fora do base64url é recusado', () => {
    expect(esquemaInscricaoPush.safeParse({ ...valido, keys: { p256dh, auth: 'abc' } }).success).toBe(false)
    expect(esquemaInscricaoPush.safeParse({ ...valido, keys: { p256dh, auth: `${auth.slice(0, 21)}!` } }).success).toBe(false)
  })

  it('sem keys é recusado', () => {
    const { keys: _k, ...semChaves } = valido
    expect(esquemaInscricaoPush.safeParse(semChaves).success).toBe(false)
  })
})
