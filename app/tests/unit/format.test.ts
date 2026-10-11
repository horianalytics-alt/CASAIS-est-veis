import { describe, it, expect } from 'vitest'
import {
  formatBRL,
  parseBRLInput,
  isoToBR,
  brToISO,
  addMonthsISO,
  monthKeyFromISO,
  monthLabel,
  isValidISODate,
  diffDaysISO,
  daysInMonthISO,
} from '@/lib/format'

describe('formatBRL', () => {
  it('formata valor como moeda brasileira', () => {
    // Intl usa espaço não separável (U+00A0) entre R$ e o número
    expect(formatBRL(1234.56)).toBe('R$ 1.234,56')
  })

  it('formata zero', () => {
    expect(formatBRL(0)).toBe('R$ 0,00')
  })

  it('formata valor negativo', () => {
    expect(formatBRL(-50.5)).toBe('-R$ 50,50')
  })

  it('oculta o valor quando hideValues=true', () => {
    expect(formatBRL(1234.56, true)).toBe('R$ ••••')
  })

  it('oculta também valor negativo (não vaza o sinal)', () => {
    expect(formatBRL(-1234.56, true)).toBe('R$ ••••')
  })
})

describe('parseBRLInput', () => {
  it('interpreta formato brasileiro com ponto de milhar e vírgula decimal', () => {
    expect(parseBRLInput('1.234,56')).toBe(1234.56)
  })

  it('interpreta decimal com ponto', () => {
    expect(parseBRLInput('1234.56')).toBe(1234.56)
  })

  it('interpreta vírgula com uma casa decimal', () => {
    expect(parseBRLInput('1234,5')).toBe(1234.5)
  })

  it('interpreta número inteiro sem separador', () => {
    expect(parseBRLInput('1234')).toBe(1234)
  })

  it('ignora prefixo R$ e espaços', () => {
    expect(parseBRLInput('R$ 1.234,56')).toBe(1234.56)
  })

  it('interpreta múltiplos pontos de milhar', () => {
    expect(parseBRLInput('1.234.567,89')).toBe(1234567.89)
  })

  it('devolve NaN para entrada vazia', () => {
    expect(parseBRLInput('')).toBeNaN()
  })

  it('devolve NaN para texto sem número', () => {
    expect(parseBRLInput('abc')).toBeNaN()
  })
})

describe('isoToBR e brToISO', () => {
  it('converte ISO para formato brasileiro', () => {
    expect(isoToBR('2026-10-11')).toBe('11/10/2026')
  })

  it('converte formato brasileiro para ISO', () => {
    expect(brToISO('11/10/2026')).toBe('2026-10-11')
  })

  it('ida e volta preserva a data', () => {
    expect(brToISO(isoToBR('2026-02-29'))).toBe('2026-02-29')
  })
})

describe('addMonthsISO', () => {
  it('soma um mês simples', () => {
    expect(addMonthsISO('2026-10-11', 1)).toBe('2026-11-11')
  })

  it('31 de janeiro + 1 mês vira 28 de fevereiro (ano comum)', () => {
    expect(addMonthsISO('2026-01-31', 1)).toBe('2026-02-28')
  })

  it('31 de janeiro + 1 mês vira 29 de fevereiro (ano bissexto)', () => {
    expect(addMonthsISO('2028-01-31', 1)).toBe('2028-02-29')
  })

  it('atravessa a virada do ano', () => {
    expect(addMonthsISO('2026-12-15', 1)).toBe('2027-01-15')
  })

  it('soma 12 meses mantendo o dia', () => {
    expect(addMonthsISO('2026-03-10', 12)).toBe('2027-03-10')
  })

  it('soma zero mês devolve a mesma data', () => {
    expect(addMonthsISO('2026-10-11', 0)).toBe('2026-10-11')
  })

  it('soma 120 meses (parcelamento máximo)', () => {
    expect(addMonthsISO('2026-01-15', 120)).toBe('2036-01-15')
  })

  it('31 de maio + 1 mês vira 30 de junho', () => {
    expect(addMonthsISO('2026-05-31', 1)).toBe('2026-06-30')
  })
})

describe('monthKeyFromISO e monthLabel', () => {
  it('extrai a chave do mês', () => {
    expect(monthKeyFromISO('2026-10-11')).toBe('2026-10')
  })

  it('monta o rótulo do mês', () => {
    expect(monthLabel('2026-10-01')).toBe('out/2026')
  })

  it('monta o rótulo de janeiro', () => {
    expect(monthLabel('2026-01-01')).toBe('jan/2026')
  })

  it('monta o rótulo de dezembro', () => {
    expect(monthLabel('2026-12-31')).toBe('dez/2026')
  })
})

describe('isValidISODate', () => {
  it('aceita data válida', () => {
    expect(isValidISODate('2026-10-11')).toBe(true)
  })

  it('rejeita 30 de fevereiro', () => {
    expect(isValidISODate('2026-02-30')).toBe(false)
  })

  it('aceita 29 de fevereiro em ano bissexto', () => {
    expect(isValidISODate('2028-02-29')).toBe(true)
  })

  it('rejeita 29 de fevereiro em ano comum', () => {
    expect(isValidISODate('2026-02-29')).toBe(false)
  })

  it('rejeita mês 13', () => {
    expect(isValidISODate('2026-13-01')).toBe(false)
  })

  it('rejeita formato errado', () => {
    expect(isValidISODate('11/10/2026')).toBe(false)
  })
})

describe('diffDaysISO', () => {
  it('conta dias entre datas do mesmo mês', () => {
    expect(diffDaysISO('2026-10-01', '2026-10-11')).toBe(10)
  })

  it('conta dias atravessando mês', () => {
    expect(diffDaysISO('2026-01-31', '2026-02-01')).toBe(1)
  })

  it('devolve negativo quando a segunda data é anterior', () => {
    expect(diffDaysISO('2026-10-11', '2026-10-01')).toBe(-10)
  })

  it('devolve zero para a mesma data', () => {
    expect(diffDaysISO('2026-10-11', '2026-10-11')).toBe(0)
  })
})

describe('daysInMonthISO', () => {
  it('fevereiro de ano comum tem 28 dias', () => {
    expect(daysInMonthISO('2026-02-01')).toBe(28)
  })

  it('fevereiro de ano bissexto tem 29 dias', () => {
    expect(daysInMonthISO('2028-02-01')).toBe(29)
  })

  it('outubro tem 31 dias', () => {
    expect(daysInMonthISO('2026-10-11')).toBe(31)
  })
})
