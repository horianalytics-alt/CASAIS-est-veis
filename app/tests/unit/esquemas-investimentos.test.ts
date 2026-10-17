import { describe, expect, it } from 'vitest'
import '@/actions/resultado' // registra o mapa de erros em português do Zod
import {
  esquemaAlocar,
  esquemaAplicar,
  esquemaAtualizarTaxa,
  esquemaConfirmarRendimento,
  esquemaCriarCaixinha,
  esquemaResgatar,
} from '@/lib/esquemas-investimentos'

// Mensagens: as mesmas que as RPCs da migration 00016 levantam (a tela mostra a
// mesma frase venha a recusa do Zod ou do banco). Valor: mesmas frases do
// modelo de esquemas-edicao-lancamento.ts.
const VALOR_ZERO = 'O valor precisa ser maior que zero.'
const VALOR_ALTO = 'Esse valor é alto demais.'
const VALOR_CASAS = 'Use no máximo 2 casas decimais.'
const VALOR_INVALIDO = 'Valor inválido.'
const TAXA_FAIXA = 'A taxa precisa estar entre 0% e 100% ao mês.'
const TAXA_INVALIDA = 'Taxa inválida.'
const NOME_VAZIO = 'Informe o nome da caixinha.'
const NOME_LONGO = 'Use no máximo 60 caracteres.'
const VENCIMENTO_FALTA = 'Informe a data de vencimento.'
const VENCIMENTO_INVALIDO = 'Data de vencimento inválida.'
const COMPETENCIA_INVALIDA = 'Mês de competência inválido'

const U1 = '11111111-1111-4111-8111-111111111111'
const U2 = '22222222-2222-4222-8222-222222222222'

type Resultado = { success: boolean; error?: { flatten: () => { fieldErrors: Record<string, string[] | undefined> } } }
function campos(r: Resultado) {
  return r.success ? {} : r.error!.flatten().fieldErrors
}

describe('valor (reais -> centavos)', () => {
  it('converte reais em centavos inteiros', () => {
    expect(esquemaAplicar.safeParse({ contaOrigemId: U1, valor: 1234.56 })).toEqual({
      success: true,
      data: { contaOrigemId: U1, valorCentavos: 123456, caixinhaId: undefined },
    })
  })

  it('0.1 + 0.2 é aceito como 30 centavos (ruído binário de quem TEM 2 casas)', () => {
    const r = esquemaAlocar.safeParse({ caixinhaId: U1, valor: 0.1 + 0.2 })
    expect(r.success && r.data.valorCentavos).toBe(30)
  })

  it('1.005 é recusado, não arredondado (P-009)', () => {
    expect(campos(esquemaAlocar.safeParse({ caixinhaId: U1, valor: 1.005 })).valor).toEqual([VALOR_CASAS])
  })

  // L-016: uma mensagem só por caso, pela primeira regra violada.
  it.each([
    [0, VALOR_ZERO],
    [-5, VALOR_ZERO],
    [-1.234, VALOR_ZERO],
    [100_000_000, VALOR_ALTO],
    [Infinity, VALOR_INVALIDO],
    [-Infinity, VALOR_INVALIDO],
    [NaN, VALOR_INVALIDO],
  ])('valor %s -> exatamente [%s]', (valor, msg) => {
    expect(campos(esquemaAlocar.safeParse({ caixinhaId: U1, valor })).valor).toEqual([msg])
  })

  it('o teto R$ 99.999.999,99 é aceito', () => {
    const r = esquemaAlocar.safeParse({ caixinhaId: U1, valor: 99_999_999.99 })
    expect(r.success && r.data.valorCentavos).toBe(9_999_999_999)
  })
})

describe('esquemaAplicar', () => {
  it('caixinha é opcional (omitida = não alocado)', () => {
    const r = esquemaAplicar.safeParse({ contaOrigemId: U1, valor: 10, caixinhaId: U2 })
    expect(r.success && r.data).toEqual({ contaOrigemId: U1, valorCentavos: 1000, caixinhaId: U2 })
  })

  it('conta de origem precisa ser uuid', () => {
    expect(campos(esquemaAplicar.safeParse({ contaOrigemId: 'x', valor: 10 })).contaOrigemId).toEqual([
      'Conta de origem inválida',
    ])
  })

  it('chave desconhecida é recusada (family_id forjado não passa)', () => {
    const r = esquemaAplicar.safeParse({ contaOrigemId: U1, valor: 10, family_id: U2 })
    expect(r.success).toBe(false)
  })
})

describe('esquemaCriarCaixinha', () => {
  const valida = { nome: 'Reserva', tipoRendimento: 'liquidez_diaria', taxaMensalBps: 105, resgateImediato: true }

  it('aceita resgate imediato sem data e normaliza a data para null', () => {
    expect(esquemaCriarCaixinha.safeParse({ ...valida, dataVencimento: '2027-01-01' })).toEqual({
      success: true,
      data: { ...valida, dataVencimento: null },
    })
  })

  it('não imediato exige data', () => {
    expect(campos(esquemaCriarCaixinha.safeParse({ ...valida, resgateImediato: false })).dataVencimento).toEqual([
      VENCIMENTO_FALTA,
    ])
    expect(
      campos(esquemaCriarCaixinha.safeParse({ ...valida, resgateImediato: false, dataVencimento: null })).dataVencimento,
    ).toEqual([VENCIMENTO_FALTA])
  })

  it('não imediato com data no passado é aceito (nasce liberada, Review Focus 1)', () => {
    const r = esquemaCriarCaixinha.safeParse({ ...valida, resgateImediato: false, dataVencimento: '2020-01-01' })
    expect(r.success && r.data.dataVencimento).toBe('2020-01-01')
  })

  it.each(['2026-02-30', '1999-12-31', '2101-01-01', 'amanhã'])('data %s -> [%s]', (data) => {
    expect(
      campos(esquemaCriarCaixinha.safeParse({ ...valida, resgateImediato: false, dataVencimento: data })).dataVencimento,
    ).toEqual([VENCIMENTO_INVALIDO])
  })

  it.each([
    [50_000, TAXA_FAIXA],
    [10_001, TAXA_FAIXA],
    [-1, TAXA_FAIXA],
    [1.5, TAXA_INVALIDA],
    [Infinity, TAXA_INVALIDA],
    [NaN, TAXA_INVALIDA],
  ])('taxa %s bps -> exatamente [%s]', (taxa, msg) => {
    expect(campos(esquemaCriarCaixinha.safeParse({ ...valida, taxaMensalBps: taxa })).taxaMensalBps).toEqual([msg])
  })

  it('taxa 0 e 10.000 (100% a.m.) são os limites aceitos', () => {
    expect(esquemaCriarCaixinha.safeParse({ ...valida, taxaMensalBps: 0 }).success).toBe(true)
    expect(esquemaCriarCaixinha.safeParse({ ...valida, taxaMensalBps: 10_000 }).success).toBe(true)
  })

  it('nome vazio ou só invisíveis -> [Informe o nome]', () => {
    expect(campos(esquemaCriarCaixinha.safeParse({ ...valida, nome: '   ' })).nome).toEqual([NOME_VAZIO])
    expect(campos(esquemaCriarCaixinha.safeParse({ ...valida, nome: '\u{200b}' })).nome).toEqual([NOME_VAZIO])
  })

  it('nome conta code points: 59 letras + emoji (60) passa; 60 letras + emoji (61) não (L-015)', () => {
    const r60 = esquemaCriarCaixinha.safeParse({ ...valida, nome: 'a'.repeat(59) + '\u{1F4B0}' })
    expect(r60.success).toBe(true)
    expect(campos(esquemaCriarCaixinha.safeParse({ ...valida, nome: 'a'.repeat(60) + '\u{1F4B0}' })).nome).toEqual([
      NOME_LONGO,
    ])
  })

  it('tipo fora da lista é recusado', () => {
    expect(campos(esquemaCriarCaixinha.safeParse({ ...valida, tipoRendimento: 'cripto' })).tipoRendimento).toEqual([
      'Escolha um tipo de rendimento válido.',
    ])
  })
})

describe('esquemaResgatar', () => {
  it('destino não alocado ou conta', () => {
    expect(esquemaResgatar.safeParse({ caixinhaId: U1, valor: 1, destino: 'nao_alocado' }).success).toBe(true)
    const r = esquemaResgatar.safeParse({ caixinhaId: U1, valor: 1, destino: { contaId: U2 } })
    expect(r.success && r.data).toEqual({ caixinhaId: U1, valorCentavos: 100, contaDestinoId: U2 })
  })

  it('destino inválido -> uma mensagem', () => {
    for (const destino of ['conta', { contaId: 'x' }, { contaId: U2, extra: 1 }, null]) {
      expect(campos(esquemaResgatar.safeParse({ caixinhaId: U1, valor: 1, destino })).destino).toEqual([
        'Escolha para onde vai o resgate.',
      ])
    }
  })
})

describe('esquemaAtualizarTaxa', () => {
  it('mesma regra de taxa', () => {
    expect(campos(esquemaAtualizarTaxa.safeParse({ caixinhaId: U1, taxaMensalBps: 50_000 })).taxaMensalBps).toEqual([
      TAXA_FAIXA,
    ])
    expect(esquemaAtualizarTaxa.safeParse({ caixinhaId: U1, taxaMensalBps: 98 }).success).toBe(true)
  })
})

describe('esquemaConfirmarRendimento', () => {
  it("competência 'YYYY-MM' vira o dia 1 do mês", () => {
    const r = esquemaConfirmarRendimento.safeParse({ caixinhaId: U1, competencia: '2026-09' })
    expect(r.success && r.data).toEqual({ caixinhaId: U1, competencia: '2026-09-01' })
  })

  it.each(['2026-13', '2026-9', '2026-09-01', '1999-12', ''])('competência %s é recusada', (competencia) => {
    expect(campos(esquemaConfirmarRendimento.safeParse({ caixinhaId: U1, competencia })).competencia).toEqual([
      COMPETENCIA_INVALIDA,
    ])
  })
})
