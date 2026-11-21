import { describe, expect, it } from 'vitest'
import {
  esquemaAlterarValorRecorrencia,
  esquemaCriarRecorrencia,
  esquemaEncerrarRecorrencia,
  esquemaResponderCobranca,
  primeiroDiaDoMes,
  valorEmReais,
} from '@/lib/esquemas-recorrencia'

const ID = '11111111-1111-4111-8111-111111111111'

function mensagens(r: { success: boolean; error?: { issues: { message: string }[] } }) {
  return r.success ? [] : r.error!.issues.map((i) => i.message)
}

describe('valorEmReais', () => {
  it('aceita número e texto com vírgula e devolve reais com 2 casas', () => {
    expect(valorEmReais.parse(55.9)).toBe(55.9)
    expect(valorEmReais.parse('1.234,56')).toBe(1234.56)
    expect(valorEmReais.parse('R$ 21,90')).toBe(21.9)
  })

  it.each([
    [Infinity, 'Valor inválido.'],
    [Number.NaN, 'Valor inválido.'],
    [0, 'O valor precisa ser maior que zero.'],
    [-1.234, 'O valor precisa ser maior que zero.'],
    [100_000_000, 'Esse valor é alto demais.'],
    [10.005, 'Use no máximo 2 casas decimais.'],
    ['', 'Informe o valor.'],
    ['abc', 'Valor inválido.'],
  ])('recusa %s com UMA mensagem: %s', (entrada, msg) => {
    expect(mensagens(valorEmReais.safeParse(entrada))).toEqual([msg])
  })
})

describe('esquemaCriarRecorrencia', () => {
  const base = { tipo: 'despesa', descricao: 'Netflix', valor: '55,90', data: '2026-11-20', contaId: ID }

  it('aceita o mínimo e aplica os padrões', () => {
    const r = esquemaCriarRecorrencia.parse(base)
    expect(r).toMatchObject({ valor: 55.9, estaPago: false, ehBeneficio: false, ehFutil: false })
  })

  it('recusa transferência (recorrência é só entrada ou saída)', () => {
    expect(mensagens(esquemaCriarRecorrencia.safeParse({ ...base, tipo: 'transferencia' }))).toEqual([
      'Repetir todo mês vale só para entrada ou saída.',
    ])
  })

  it('pago exige data do pagamento; não pago recusa data', () => {
    expect(mensagens(esquemaCriarRecorrencia.safeParse({ ...base, estaPago: true }))).toEqual([
      'Informe a data do pagamento.',
    ])
    expect(mensagens(esquemaCriarRecorrencia.safeParse({ ...base, dataDoPagamento: '2026-11-20' }))).toEqual([
      'Só preencha a data do pagamento se já estiver pago.',
    ])
  })

  it('cota exige responsável', () => {
    expect(mensagens(esquemaCriarRecorrencia.safeParse({ ...base, cotaDoResponsavel: 0.5 }))).toEqual([
      'Escolha de quem é a cota.',
    ])
  })

  it('recusa data impossível', () => {
    expect(mensagens(esquemaCriarRecorrencia.safeParse({ ...base, data: '2026-02-30' }))).toEqual(['Data inválida.'])
  })
})

describe('esquemaResponderCobranca', () => {
  it('pago exige dataPagamento', () => {
    expect(mensagens(esquemaResponderCobranca.safeParse({ lancamentoId: ID, resposta: 'pago' }))).toEqual([
      'Informe a data do pagamento.',
    ])
  })

  it('ainda_nao dispensa a data', () => {
    expect(esquemaResponderCobranca.safeParse({ lancamentoId: ID, resposta: 'ainda_nao' }).success).toBe(true)
  })

  it('pago com data passada é aceito (a janela futura é conferida no banco)', () => {
    expect(
      esquemaResponderCobranca.parse({ lancamentoId: ID, resposta: 'pago', dataPagamento: '2026-11-05' }),
    ).toMatchObject({ dataPagamento: '2026-11-05' })
  })

  it('resposta fora da lista', () => {
    expect(mensagens(esquemaResponderCobranca.safeParse({ lancamentoId: ID, resposta: 'talvez' }))).toEqual([
      'Resposta inválida.',
    ])
  })
})

describe('alterar valor e encerrar', () => {
  it('mês em YYYY-MM vira o 1º dia', () => {
    const r = esquemaAlterarValorRecorrencia.parse({ regraId: ID, valor: 59.9, aPartirDe: '2027-02' })
    expect(primeiroDiaDoMes(r.aPartirDe)).toBe('2027-02-01')
  })

  it.each(['2027-13', '2027-2', '27-02', '2027-02-01'])('recusa mês %s', (mes) => {
    expect(mensagens(esquemaEncerrarRecorrencia.safeParse({ regraId: ID, ultimoMes: mes }))).toEqual(['Mês inválido.'])
  })
})
