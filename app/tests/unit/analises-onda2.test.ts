// Lógica pura dos gráficos da Onda 2 em /analises (orçamento, patrimônio,
// simulador). Plano: docs/planos/dash-orcamento-patrimonio-simulador.md.
// Cobertura obrigatória do Dash: base zero, valor negativo, período parcial,
// virada de mês/ano — e nunca NaN/Infinity chegando na tela.
import { describe, expect, it } from 'vitest'
import {
  dominioBonito,
  formatarEixoBRL,
  indicesDeRotulo,
} from '@/components/analises/escala-linear'
import {
  dominioDaRazao,
  percentualInteiro,
  prepararOrcamentos,
  statusDoOrcamento,
} from '@/components/analises/orcamento-logica'
import { janelaPatrimonio, variacaoNaJanela } from '@/components/analises/patrimonio-logica'
import { lerReais, textoParaMeses } from '@/components/analises/simulador-entrada'

const finito = (n: number) => Number.isFinite(n)

describe('dominioBonito', () => {
  it('base zero: tudo zero com incluirZero dá domínio finito e não degenerado', () => {
    const d = dominioBonito([0, 0, 0], { incluirZero: true })
    expect(d.min).toBe(0)
    expect(d.max).toBeGreaterThan(0)
    expect(d.ticks.every(finito)).toBe(true)
  })

  it('valores todos iguais expandem em volta do valor (nunca max == min)', () => {
    const d = dominioBonito([5000, 5000])
    expect(d.min).toBeLessThan(5000)
    expect(d.max).toBeGreaterThan(5000)
  })

  it('cobre os dados com ticks crescentes em passos redondos', () => {
    const d = dominioBonito([1200, 3400])
    expect(d.min).toBeLessThanOrEqual(1200)
    expect(d.max).toBeGreaterThanOrEqual(3400)
    expect(d.ticks[0]).toBe(d.min)
    expect(d.ticks[d.ticks.length - 1]).toBe(d.max)
    for (let i = 1; i < d.ticks.length; i++) expect(d.ticks[i]).toBeGreaterThan(d.ticks[i - 1])
    expect(d.ticks).toEqual([1000, 2000, 3000, 4000])
  })

  it('incluirZero puxa o mínimo para 0', () => {
    expect(dominioBonito([100, 1000], { incluirZero: true }).min).toBe(0)
  })

  it('sem incluirZero não força o zero (linha pode começar acima)', () => {
    expect(dominioBonito([10_000, 12_000]).min).toBeGreaterThan(0)
  })

  it('valor negativo: domínio cruza o zero e o zero vira tick', () => {
    const d = dominioBonito([-1500, 2300])
    expect(d.min).toBeLessThanOrEqual(-1500)
    expect(d.max).toBeGreaterThanOrEqual(2300)
    expect(d.ticks).toContain(0)
  })

  it('lista vazia ou com NaN não devolve NaN', () => {
    const d = dominioBonito([Number.NaN, Number.POSITIVE_INFINITY])
    expect(finito(d.min) && finito(d.max)).toBe(true)
    expect(dominioBonito([]).ticks.every(finito)).toBe(true)
  })

  it('não passa de maxTicks + 1 ticks', () => {
    expect(dominioBonito([3, 987_654], { maxTicks: 4 }).ticks.length).toBeLessThanOrEqual(5)
  })
})

describe('formatarEixoBRL', () => {
  it.each([
    [0, 'R$ 0'],
    [950, 'R$ 950'],
    [1200, 'R$ 1,2 mil'],
    [12_000, 'R$ 12 mil'],
    [-1200, '−R$ 1,2 mil'],
    [1_500_000, 'R$ 1,5 mi'],
    [2_000_000, 'R$ 2 mi'],
    [-0, 'R$ 0'],
  ])('%s -> %s', (valor, esperado) => {
    expect(formatarEixoBRL(valor)).toBe(esperado)
  })

  // As casas decimais vêm do passo do eixo: tick nunca mente nem repete.
  it.each([
    [1250, 250, 'R$ 1,25 mil'],
    [1750, 250, 'R$ 1,75 mil'],
    [12_340, 10, 'R$ 12,34 mil'],
    [12_350, 10, 'R$ 12,35 mil'],
    [12_341, 1, 'R$ 12.341'],
    [1_250_000, 250_000, 'R$ 1,25 mi'],
    [2000, 500, 'R$ 2 mil'],
    [0.25, 0.25, 'R$ 0,25'],
  ])('%s com passo %s -> %s', (valor, passo, esperado) => {
    expect(formatarEixoBRL(valor, passo)).toBe(esperado)
  })

  it('ticks de um domínio estreito saem todos distintos', () => {
    const d = dominioBonito([12_340, 12_380])
    const passo = d.ticks[1] - d.ticks[0]
    const rotulos = d.ticks.map((t) => formatarEixoBRL(t, passo))
    expect(new Set(rotulos).size).toBe(rotulos.length)
  })
})

describe('indicesDeRotulo', () => {
  it('sempre inclui o primeiro e o último, sem passar do máximo', () => {
    const r = indicesDeRotulo(12, 4)
    expect(r.length).toBeLessThanOrEqual(4)
    expect(r[0]).toBe(0)
    expect(r[r.length - 1]).toBe(11)
  })
  it('casos de borda', () => {
    expect(indicesDeRotulo(0, 4)).toEqual([])
    expect(indicesDeRotulo(1, 4)).toEqual([0])
    expect(indicesDeRotulo(5, 1)).toEqual([4])
    expect(indicesDeRotulo(3, 10)).toEqual([0, 1, 2])
  })
})

describe('statusDoOrcamento', () => {
  it.each([
    [0, 'normal'],
    [0.7999, 'normal'],
    [0.8, 'atencao'],
    [1, 'atencao'],
    [1.0001, 'estourado'],
    [Number.NaN, 'normal'],
  ] as const)('%s -> %s', (razao, esperado) => {
    expect(statusDoOrcamento(razao)).toBe(esperado)
  })
})

describe('prepararOrcamentos', () => {
  const base = {
    category_archived_at: null,
    remaining_amount: 0,
    tx_count: 1,
  }
  it('descarta linha sem id ou com limite <= 0 e ordena da maior razão para a menor', () => {
    const r = prepararOrcamentos([
      { ...base, budget_id: 'a', category_name: 'Mercado', budget_amount: 300, spent_amount: 230.5, used_ratio: 0.7683 },
      { ...base, budget_id: null, category_name: 'X', budget_amount: 100, spent_amount: 1, used_ratio: 0.01 },
      { ...base, budget_id: 'z', category_name: 'Zero', budget_amount: 0, spent_amount: 5, used_ratio: null },
      { ...base, budget_id: 'b', category_name: 'Lazer', budget_amount: 100, spent_amount: 130, used_ratio: 1.3 },
      { ...base, budget_id: 'c', category_name: 'Água', budget_amount: 100, spent_amount: 0, used_ratio: 0 },
    ])
    expect(r.map((l) => l.id)).toEqual(['b', 'a', 'c'])
    expect(r[0].status).toBe('estourado')
    expect(r[1].status).toBe('normal')
  })

  it('base zero de gasto: gasto nulo vira 0, razão 0, status normal, sem NaN', () => {
    const [l] = prepararOrcamentos([
      { ...base, budget_id: 'a', category_name: 'Mercado', budget_amount: 300, spent_amount: null, used_ratio: null, tx_count: null },
    ])
    expect(l.gasto).toBe(0)
    expect(l.razao).toBe(0)
    expect(l.lancamentos).toBe(0)
    expect(l.restante).toBe(300)
  })

  it('razão ausente é recalculada a partir de gasto/limite', () => {
    const [l] = prepararOrcamentos([
      { ...base, budget_id: 'a', category_name: 'Mercado', budget_amount: 200, spent_amount: 170, used_ratio: null },
    ])
    expect(l.razao).toBeCloseTo(0.85, 10)
    expect(l.status).toBe('atencao')
  })

  it('estouro de centavos: status vem do gasto exato, não da razão arredondada da view', () => {
    const [l] = prepararOrcamentos([
      { ...base, budget_id: 'a', category_name: 'Casa', budget_amount: 2000, spent_amount: 2000.09, used_ratio: 1.0, remaining_amount: -0.09 },
    ])
    expect(l.status).toBe('estourado')
    expect(l.razao).toBeGreaterThan(1)
    expect(l.restante).toBe(-0.09)
  })

  it('exatamente no limite é atenção, não estouro', () => {
    const [l] = prepararOrcamentos([
      { ...base, budget_id: 'a', category_name: 'Casa', budget_amount: 0.3, spent_amount: 0.3, used_ratio: 1 },
    ])
    expect(l.razao).toBe(1)
    expect(l.status).toBe('atencao')
  })

  it('estouro: restante negativo vem do gasto, não do arredondamento da view', () => {
    const [l] = prepararOrcamentos([
      { ...base, budget_id: 'a', category_name: 'Lazer', budget_amount: 100, spent_amount: 130.1, used_ratio: 1.301, remaining_amount: -30.1 },
    ])
    expect(l.restante).toBe(-30.1)
  })

  it('categoria arquivada continua na lista e marcada', () => {
    const [l] = prepararOrcamentos([
      { ...base, budget_id: 'a', category_name: 'Velha', category_archived_at: '2026-01-01T00:00:00Z', budget_amount: 50, spent_amount: 10, used_ratio: 0.2 },
    ])
    expect(l.arquivada).toBe(true)
  })

  it('empate de razão desempata pelo nome em pt-BR', () => {
    const r = prepararOrcamentos([
      { ...base, budget_id: 'b', category_name: 'Lazer', budget_amount: 100, spent_amount: 50, used_ratio: 0.5 },
      { ...base, budget_id: 'a', category_name: 'Água', budget_amount: 100, spent_amount: 50, used_ratio: 0.5 },
    ])
    expect(r.map((l) => l.categoria)).toEqual(['Água', 'Lazer'])
  })
})

describe('dominioDaRazao e percentualInteiro', () => {
  it('domínio é no mínimo 1 (100%) e cresce com o estouro', () => {
    expect(dominioDaRazao([])).toBe(1)
    expect(dominioDaRazao(prepararOrcamentos([
      { budget_id: 'a', category_name: 'A', category_archived_at: null, budget_amount: 10, spent_amount: 5, remaining_amount: 5, used_ratio: 0.5, tx_count: 1 },
    ]))).toBe(1)
    expect(dominioDaRazao(prepararOrcamentos([
      { budget_id: 'a', category_name: 'A', category_archived_at: null, budget_amount: 10, spent_amount: 13, remaining_amount: -3, used_ratio: 1.3, tx_count: 1 },
    ]))).toBe(1.3)
  })
  it.each([
    [0.7683, '77%'],
    [0, '0%'],
    [1.5, '150%'],
    [0.005, '1%'],
    [Number.NaN, '—'],
    [Number.POSITIVE_INFINITY, '—'],
  ])('%s -> %s', (razao, esperado) => {
    expect(percentualInteiro(razao)).toBe(esperado)
  })
})

describe('janelaPatrimonio', () => {
  // 2025-01 .. 2026-10 (22 meses), em ordem DECRESCENTE como a consulta devolve.
  const linhas = Array.from({ length: 22 }, (_, i) => {
    const total = 2025 * 12 + i
    const mes = `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
    return { month: mes, total_balance: 1000 + i * 10, net_change: 10 }
  }).reverse()

  it('12 meses terminando no mês pedido, em ordem crescente, atravessando a virada de ano', () => {
    const p = janelaPatrimonio(linhas, '2026-10', '2026-10')
    expect(p).toHaveLength(12)
    expect(p[0].mes).toBe('2025-11')
    expect(p[1].mes).toBe('2025-12')
    expect(p[2].mes).toBe('2026-01')
    expect(p[11].mes).toBe('2026-10')
  })

  it('período parcial: só o mês corrente é marcado parcial', () => {
    const p = janelaPatrimonio(linhas, '2026-10', '2026-10')
    expect(p.filter((x) => x.parcial).map((x) => x.mes)).toEqual(['2026-10'])
    expect(janelaPatrimonio(linhas, '2026-03', '2026-10').some((x) => x.parcial)).toBe(false)
  })

  it('mês posterior ao pedido nunca entra (paid_date futuro)', () => {
    const p = janelaPatrimonio(linhas, '2025-06', '2026-10')
    expect(p[p.length - 1].mes).toBe('2025-06')
    expect(p).toHaveLength(6)
  })

  it('descarta linha com mês ou saldo nulo; vazio dá vazio', () => {
    expect(janelaPatrimonio([{ month: null, total_balance: 1, net_change: 0 }, { month: '2026-01', total_balance: null, net_change: 0 }], '2026-10', '2026-10')).toEqual([])
    expect(janelaPatrimonio([], '2026-10', '2026-10')).toEqual([])
  })

  it('patrimônio negativo é preservado', () => {
    const [p] = janelaPatrimonio([{ month: '2026-10', total_balance: -250.75, net_change: -300 }], '2026-10', '2026-10')
    expect(p.valor).toBe(-250.75)
    expect(p.variacaoMes).toBe(-300)
  })
})

describe('variacaoNaJanela', () => {
  const ponto = (valor: number) => ({ mes: '2026-01', valor, variacaoMes: 0, parcial: false })
  it('menos de 2 pontos não tem variação (null, não 0 nem NaN)', () => {
    expect(variacaoNaJanela([])).toBeNull()
    expect(variacaoNaJanela([ponto(10)])).toBeNull()
  })
  it('em centavos exatos, inclusive negativa', () => {
    expect(variacaoNaJanela([ponto(100.1), ponto(100.3)])).toBe(0.2)
    expect(variacaoNaJanela([ponto(1000), ponto(800)])).toBe(-200)
  })
})

describe('lerReais', () => {
  it.each([
    ['1.234,56', 123456],
    ['1234,56', 123456],
    ['1234.56', 123456],
    ['1234', 123400],
    ['R$ 50', 5000],
    [' 0,5 ', 50],
    ['0,05', 5],
    ['1.234', 123400],
    ['12.5', 1250],
    ['1.234.567,89', 123456789],
    ['0', 0],
  ])('%s -> %s', (texto, esperado) => {
    expect(lerReais(texto)).toEqual({ ok: true, centavos: esperado })
  })

  it.each(['', '   ', 'abc', '-5', '1,005', '1,234.56', '1.23.4', '12,', ',5'])(
    'formato inválido: %j',
    (texto) => {
      expect(lerReais(texto)).toEqual({ ok: false, motivo: 'formato' })
    },
  )

  it.each(['99999999999999', '999999999999999', '99999999999999999999', '1.000.000.000.000,00'])(
    'bem formatado mas grande demais: %j',
    (texto) => {
      expect(lerReais(texto)).toEqual({ ok: false, motivo: 'grande_demais' })
    },
  )

  it('o maior valor aceito pelo simulador ainda é lido', () => {
    expect(lerReais('999.999.999.999,99')).toEqual({ ok: true, centavos: 99_999_999_999_999 })
  })
})

describe('textoParaMeses', () => {
  it.each([
    ['12', 12],
    ['0', 0],
    [' 600 ', 600],
    ['1000', 1000],
  ])('%s -> %s', (texto, esperado) => {
    expect(textoParaMeses(texto)).toBe(esperado)
  })
  it.each(['', '1,5', '-1', '12a', '10000'])('inválido: %j -> null', (texto) => {
    expect(textoParaMeses(texto)).toBeNull()
  })
})
