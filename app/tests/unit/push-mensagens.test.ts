import { describe, expect, it } from 'vitest'
import { mensagemDoEvento } from '@/lib/push/mensagens'
import { ehEndpointDePushAceito } from '@/lib/push/endpoints'

describe('mensagemDoEvento — texto da notificação, nunca com valor', () => {
  it('lançamento único', () => {
    expect(mensagemDoEvento('lancamento', 'Carol')).toEqual({
      titulo: 'Finanças a Dois',
      corpo: 'Carol registrou um lançamento',
      url: '/inicio',
    })
  })

  it('lote de lançamentos diz a QUANTIDADE de itens, não o valor', () => {
    expect(mensagemDoEvento('lancamento', 'Carol', 3).corpo).toBe('Carol registrou 3 lançamentos')
  })

  it('fatura paga leva para a carteira', () => {
    expect(mensagemDoEvento('fatura', 'Heitor')).toEqual({
      titulo: 'Finanças a Dois',
      corpo: 'Heitor pagou uma fatura do cartão',
      url: '/carteira',
    })
  })

  it('acerto leva para /acerto', () => {
    expect(mensagemDoEvento('acerto', 'Heitor')).toEqual({
      titulo: 'Finanças a Dois',
      corpo: 'Heitor registrou um acerto de contas',
      url: '/acerto',
    })
  })

  it('nome aparado e cortado em 40 caracteres', () => {
    const corpo = mensagemDoEvento('lancamento', `  ${'x'.repeat(60)}  `).corpo
    expect(corpo).toBe(`${'x'.repeat(40)} registrou um lançamento`)
  })

  it('o corte em 40 não parte um emoji ao meio (conta caracteres, não unidades UTF-16)', () => {
    const corpo = mensagemDoEvento('lancamento', `${'x'.repeat(39)}\u{1F600}yyy`).corpo
    expect(corpo).toBe(`${'x'.repeat(39)}\u{1F600} registrou um lançamento`)
    expect(corpo).not.toMatch(/[\u{D800}-\u{DFFF}]/u) // nenhum surrogate solto
  })

  it('nome vazio vira "Alguém da sua casa"', () => {
    expect(mensagemDoEvento('acerto', '   ').corpo).toBe('Alguém da sua casa registrou um acerto de contas')
  })

  it('edição de um lançamento diz "editou", não "registrou"', () => {
    expect(mensagemDoEvento('edicao', 'Carol')).toEqual({
      titulo: 'Finanças a Dois',
      corpo: 'Carol editou um lançamento',
      url: '/inicio',
    })
  })

  it('edição em lote diz a quantidade', () => {
    expect(mensagemDoEvento('edicao', 'Heitor', 4).corpo).toBe('Heitor editou 4 lançamentos')
  })

  it('nenhum texto de nenhum evento tem R$ ou número de valor', () => {
    for (const evento of ['lancamento', 'fatura', 'acerto', 'edicao'] as const) {
      const { titulo, corpo } = mensagemDoEvento(evento, 'Carol')
      expect(`${titulo} ${corpo}`).not.toMatch(/R\$|\d/)
    }
  })
})

describe('ehEndpointDePushAceito — só serviços de push conhecidos (anti-SSRF)', () => {
  const aceitos = [
    'https://fcm.googleapis.com/fcm/send/abc123:APA91b',
    'https://updates.push.services.mozilla.com/wpush/v2/gAAAAAB',
    'https://web.push.apple.com/QGfT8lbt',
    'https://wns2-by3p.notify.windows.com/w/?token=BQYAAA',
  ]
  const recusados = [
    'http://fcm.googleapis.com/fcm/send/abc', // sem TLS
    'https://fcm.googleapis.com:8443/fcm/send/abc', // porta fora do padrão
    'https://fcm.googleapis.com.evil.example/fcm/send/abc', // sufixo enganoso
    'https://fcm.googleapis.com@evil.example/x', // credencial na URL: o host real é evil.example
    'https://evil.example/fcm.googleapis.com', // host errado, nome no caminho
    'https://evilnotify.windows.com/w', // não é subdomínio de notify.windows.com
    'https://localhost/x',
    'https://169.254.169.254/latest/meta-data', // metadado de nuvem
    'https://[::1]/x',
    'não é url',
    '',
    `https://fcm.googleapis.com/fcm/send/${'a'.repeat(2100)}`, // longo demais
  ]

  for (const url of aceitos) {
    it(`aceita ${url.slice(0, 45)}`, () => expect(ehEndpointDePushAceito(url)).toBe(true))
  }
  for (const url of recusados) {
    it(`recusa ${url.slice(0, 45) || '(vazio)'}`, () => expect(ehEndpointDePushAceito(url)).toBe(false))
  }
})
