// Simulador de gasto fútil (src/lib/simulador.ts) — PLANO.md seção 8.3.
//
// Todo valor esperado aqui foi calculado FORA do código testado, com
// Python fractions.Fraction (aritmética racional exata) + meio-para-cima:
//   floor(v * ((10000 + bps) / 10000) ** n + 1/2)
// Nada é recalculado com o próprio simulador (seria asserção espelho).
import { describe, expect, it } from 'vitest'
import {
  LIMITES_SIMULACAO,
  projetarValorFuturo,
  simularValorFuturo,
  taxaPercentualParaBps,
} from '@/lib/simulador'

function valorFinal(valorCentavos: number, taxaMensalBps: number, meses: number) {
  const r = simularValorFuturo({ valorCentavos, taxaMensalBps, meses })
  if (!r.ok) throw new Error(`esperava ok, veio erro ${r.erro}`)
  return r.valorFinalCentavos
}

function erroDe(valorCentavos: number, taxaMensalBps: number, meses: number) {
  const r = simularValorFuturo({ valorCentavos, taxaMensalBps, meses })
  return r.ok ? `ok:${r.valorFinalCentavos}` : r.erro
}

describe('simularValorFuturo — juros compostos em centavos inteiros', () => {
  it('R$ 100,00 a 1% a.m. por 12 meses vale R$ 112,68 (exato 11268,2503...)', () => {
    const r = simularValorFuturo({ valorCentavos: 10000, taxaMensalBps: 100, meses: 12 })
    expect(r).toEqual({ ok: true, valorFinalCentavos: 11268, rendimentoCentavos: 1268 })
  })

  it('R$ 1.000.000,00 a 1% a.m. por 600 meses (exato 39158339699,93...)', () => {
    expect(valorFinal(100_000_000, 100, 600)).toBe(39_158_339_700)
  })

  it('0 meses devolve o próprio valor, sem rendimento', () => {
    expect(simularValorFuturo({ valorCentavos: 12345, taxaMensalBps: 100, meses: 0 }))
      .toEqual({ ok: true, valorFinalCentavos: 12345, rendimentoCentavos: 0 })
  })

  it('taxa 0 devolve o próprio valor em qualquer prazo', () => {
    expect(valorFinal(12345, 0, 24)).toBe(12345)
  })

  it('valor 0 continua 0', () => {
    expect(simularValorFuturo({ valorCentavos: 0, taxaMensalBps: 100, meses: 12 }))
      .toEqual({ ok: true, valorFinalCentavos: 0, rendimentoCentavos: 0 })
  })

  it('meio centavo exato arredonda para CIMA (1,5 -> 2 e 4,5 -> 5; meio-par daria 4)', () => {
    expect(valorFinal(1, 5000, 1)).toBe(2)
    expect(valorFinal(3, 5000, 1)).toBe(5)
  })

  it('arredonda UMA vez, no fim: 1 centavo a 40% por 2 meses = 1,96 -> 2 (mês a mês daria 1)', () => {
    expect(valorFinal(1, 4000, 2)).toBe(2)
  })

  it('não usa ponto flutuante: Math.round(v * Math.pow(1+i, n)) daria 100 e 101 nestes casos', () => {
    // 100 * 1,005 = 100,5 exato -> 101 ; em float: 100.49999999999999 -> 100
    expect(valorFinal(100, 50, 1)).toBe(101)
    // 100 * 1,015 = 101,5 exato -> 102 ; em float: 101.49999999999999 -> 101
    expect(valorFinal(100, 150, 1)).toBe(102)
  })

  it('aceita os limites exatos de valor, taxa e prazo', () => {
    expect(valorFinal(LIMITES_SIMULACAO.valorMaxCentavos, 0, LIMITES_SIMULACAO.mesesMax))
      .toBe(99_999_999_999_999)
    expect(valorFinal(1, LIMITES_SIMULACAO.taxaMaxBps, 1)).toBe(2)
  })

  it('resultado até Number.MAX_SAFE_INTEGER sai; acima disso é recusado, nunca impreciso', () => {
    // 1 centavo dobrando por mês: 2^52 cabe, 2^53 passa de MAX_SAFE_INTEGER (2^53 - 1)
    expect(valorFinal(1, 10_000, 52)).toBe(4_503_599_627_370_496)
    expect(erroDe(1, 10_000, 53)).toBe('resultado_grande_demais')
    expect(erroDe(99_999_999_999_999, 10_000, 600)).toBe('resultado_grande_demais')
  })
})

describe('simularValorFuturo — entrada inválida vira código de erro, nunca exceção', () => {
  it.each([
    ['negativo', -1],
    ['fração de centavo', 12.5],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['acima do teto', 100_000_000_000_000],
  ])('valor %s -> valor_invalido', (_rotulo, valor) => {
    expect(erroDe(valor, 100, 12)).toBe('valor_invalido')
  })

  it.each([
    ['negativa', -1],
    ['fracionária', 1.5],
    ['NaN', Number.NaN],
    ['acima de 100% a.m.', 10_001],
  ])('taxa %s -> taxa_invalida', (_rotulo, taxa) => {
    expect(erroDe(10000, taxa, 12)).toBe('taxa_invalida')
  })

  it.each([
    ['negativo', -1],
    ['fracionário', 1.5],
    ['NaN', Number.NaN],
    ['acima de 600', 601],
  ])('prazo %s -> meses_invalido', (_rotulo, meses) => {
    expect(erroDe(10000, 100, meses)).toBe('meses_invalido')
  })
})

describe('projetarValorFuturo — série mês a mês para o gráfico de linha', () => {
  it('devolve meses + 1 pontos, do mês 0 ao último, cada um arredondado sozinho', () => {
    expect(projetarValorFuturo({ valorCentavos: 10000, taxaMensalBps: 100, meses: 3 })).toEqual({
      ok: true,
      pontos: [
        { mes: 0, valorCentavos: 10000 },
        { mes: 1, valorCentavos: 10100 },
        { mes: 2, valorCentavos: 10201 },
        { mes: 3, valorCentavos: 10303 }, // exato 10303,01
      ],
    })
  })

  it('o último ponto é o mesmo número da simulação direta (12 meses -> 11268)', () => {
    const r = projetarValorFuturo({ valorCentavos: 10000, taxaMensalBps: 100, meses: 12 })
    if (!r.ok) throw new Error(r.erro)
    expect(r.pontos).toHaveLength(13)
    expect(r.pontos[12]).toEqual({ mes: 12, valorCentavos: 11268 })
  })

  it('não acumula arredondamento: 1 centavo a 40% -> [1, 1, 2] (1 ; 1,4 ; 1,96)', () => {
    const r = projetarValorFuturo({ valorCentavos: 1, taxaMensalBps: 4000, meses: 2 })
    expect(r).toEqual({
      ok: true,
      pontos: [
        { mes: 0, valorCentavos: 1 },
        { mes: 1, valorCentavos: 1 },
        { mes: 2, valorCentavos: 2 },
      ],
    })
  })

  it('0 meses devolve só o ponto inicial', () => {
    expect(projetarValorFuturo({ valorCentavos: 500, taxaMensalBps: 100, meses: 0 }))
      .toEqual({ ok: true, pontos: [{ mes: 0, valorCentavos: 500 }] })
  })

  it('entrada inválida e estouro devolvem o mesmo código de erro da simulação', () => {
    expect(projetarValorFuturo({ valorCentavos: -1, taxaMensalBps: 100, meses: 3 }))
      .toEqual({ ok: false, erro: 'valor_invalido' })
    expect(projetarValorFuturo({ valorCentavos: 1, taxaMensalBps: 10_000, meses: 53 }))
      .toEqual({ ok: false, erro: 'resultado_grande_demais' })
  })
})

describe('taxaPercentualParaBps — texto digitado -> pontos-base, sem parseFloat', () => {
  it.each([
    ['1,07', 107],
    ['1.07', 107],
    ['1', 100],
    ['0,5', 50],
    ['0,05', 5],
    ['1,0', 100],
    ['0', 0],
    ['10', 1000],
    ['100', 10_000],
    [' 1,07 ', 107],
  ])('%j -> %i', (texto, bps) => {
    expect(taxaPercentualParaBps(texto)).toBe(bps)
  })

  it.each([
    [''],
    ['   '],
    ['abc'],
    ['-1'],
    ['+1'],
    ['1,005'], // 3 casas: o caso que Math.round(parseFloat(x) * 100) erra (P-009)
    [','],
    ['1,'],
    [',5'],
    ['1.2.3'],
    ['1,2,3'],
    ['1e2'],
    ['90071992547409910'], // passaria de Number.MAX_SAFE_INTEGER em pontos-base
  ])('%j -> null', (texto) => {
    expect(taxaPercentualParaBps(texto)).toBeNull()
  })
})
