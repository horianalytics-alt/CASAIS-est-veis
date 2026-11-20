/**
 * Lógica pura do gráfico de projeção por caixinha.
 * Plano: docs/planos/dash-grafico-projecao-caixinha.md §3, §4.1 e §7.1.
 * Fuso de toda conta: America/Sao_Paulo.
 */
import { describe, expect, it } from 'vitest'
import {
  mesEmSaoPaulo,
  montarProjecaoCaixinha,
  totalPendente,
  valorProjetadoCentavos,
  type CaixinhaParaProjecao,
  type MovimentoCaixinha,
  type RendimentoPendente,
} from '@/components/carteira/projecao-caixinha-logica'
import { projetarValorFuturo } from '@/lib/simulador'

const ID = 'cx-1'

function caixinha(sobre: Partial<CaixinhaParaProjecao> = {}): CaixinhaParaProjecao {
  return {
    id: ID,
    name: 'Reserva',
    rate_bps: 100,
    rate_defined_at: '2026-06-15',
    balance_cents: 0,
    created_at: '2026-06-15T15:00:00Z',
    ...sobre,
  }
}

function mov(tipo: MovimentoCaixinha['tipo'], valorCentavos: number, ocorridoEm: string, caixinhaId = ID): MovimentoCaixinha {
  return { caixinhaId, tipo, valorCentavos, ocorridoEm }
}

function pend(competencia: string, valorCentavos: number, caixinhaId = ID): RendimentoPendente {
  return { caixinhaId, competencia, valorCentavos }
}

// Cenário base: criada em jun/26; R$1.000 em jun; rendimento de jul confirmado
// (R$10, datado no último dia de jul); resgate de R$300 em set; R$50 hoje (out).
const MOVS: MovimentoCaixinha[] = [
  mov('entrada', 100000, '2026-06-20'),
  mov('rendimento', 1000, '2026-07-31'),
  mov('saida', 30000, '2026-09-10'),
  mov('entrada', 5000, '2026-10-26'),
]
const SALDO = 100000 + 1000 - 30000 + 5000 // 76000

describe('mesEmSaoPaulo', () => {
  it('converte o instante para o mês de São Paulo (virada de fuso)', () => {
    expect(mesEmSaoPaulo('2026-09-01T02:00:00Z')).toBe('2026-08') // 23h de 31/08 em SP
    expect(mesEmSaoPaulo('2026-09-01T03:00:00Z')).toBe('2026-09') // 0h de 01/09 em SP
    expect(mesEmSaoPaulo('2026-09-01T02:59:59.999+00:00')).toBe('2026-08')
  })

  it('instante inválido devolve null, sem lançar', () => {
    expect(mesEmSaoPaulo('não é data')).toBeNull()
    expect(mesEmSaoPaulo('')).toBeNull()
  })
})

describe('montarProjecaoCaixinha — série histórica de saldo confirmado', () => {
  it('saldo no fim de cada mês = soma assinada até o último dia do mês; mês sem movimento repete', () => {
    const r = montarProjecaoCaixinha({ caixinha: caixinha({ balance_cents: SALDO }), movimentos: MOVS, pendentes: [], mesAtual: '2026-10' })
    expect(r.tipo).toBe('ok')
    if (r.tipo !== 'ok') return
    const historico = r.pontos.slice(0, r.indiceHoje + 1)
    expect(historico.map((p) => [p.mes, p.valorCentavos, p.situacao])).toEqual([
      ['2026-06', 100000, 'confirmado'],
      ['2026-07', 101000, 'confirmado'], // rendimento de jul conta em JULHO, não no mês em que foi confirmado
      ['2026-08', 101000, 'confirmado'],
      ['2026-09', 71000, 'confirmado'],
      ['2026-10', 76000, 'hoje'],
    ])
  })

  it('o ponto de hoje é o balance_cents (mês corrente nunca é "fim do mês")', () => {
    const r = montarProjecaoCaixinha({ caixinha: caixinha({ balance_cents: SALDO }), movimentos: MOVS, pendentes: [], mesAtual: '2026-10' })
    if (r.tipo !== 'ok') throw new Error(r.tipo)
    expect(r.pontos[r.indiceHoje]).toMatchObject({ mes: '2026-10', valorCentavos: SALDO, situacao: 'hoje' })
  })

  it('ignora movimentos de outra caixinha', () => {
    const r = montarProjecaoCaixinha({
      caixinha: caixinha({ balance_cents: SALDO }),
      movimentos: [...MOVS, mov('entrada', 999999, '2026-07-01', 'outra')],
      pendentes: [],
      mesAtual: '2026-10',
    })
    expect(r.tipo).toBe('ok')
  })

  it('corta a janela nos últimos N meses mantendo a base acumulada', () => {
    const r = montarProjecaoCaixinha({
      caixinha: caixinha({ balance_cents: SALDO }),
      movimentos: MOVS,
      pendentes: [],
      mesAtual: '2026-10',
      mesesHistorico: 2,
    })
    if (r.tipo !== 'ok') throw new Error(r.tipo)
    expect(r.pontos.slice(0, r.indiceHoje + 1).map((p) => [p.mes, p.valorCentavos])).toEqual([
      ['2026-09', 71000],
      ['2026-10', 76000],
    ])
  })

  it('caixinha criada no mês corrente: 1 ponto real (hoje) + 12 simulados', () => {
    const r = montarProjecaoCaixinha({
      caixinha: caixinha({ balance_cents: 5000, created_at: '2026-10-26T13:00:00Z' }),
      movimentos: [mov('entrada', 5000, '2026-10-26')],
      pendentes: [],
      mesAtual: '2026-10',
    })
    if (r.tipo !== 'ok') throw new Error(r.tipo)
    expect(r.indiceHoje).toBe(0)
    expect(r.pontos).toHaveLength(13)
    expect(r.pontos.every((p) => Number.isSafeInteger(p.valorCentavos))).toBe(true)
  })

  it('mês de criação vem de created_at em São Paulo, não em UTC', () => {
    // 01/09 02:00 UTC = 31/08 23:00 em SP: a série começa em AGOSTO.
    const r = montarProjecaoCaixinha({
      caixinha: caixinha({ balance_cents: 1000, created_at: '2026-09-01T02:00:00Z' }),
      movimentos: [mov('entrada', 1000, '2026-08-31')],
      pendentes: [],
      mesAtual: '2026-10',
    })
    if (r.tipo !== 'ok') throw new Error(r.tipo)
    expect(r.pontos[0].mes).toBe('2026-08')
  })
})

describe('montarProjecaoCaixinha — base zero, negativos e divergência', () => {
  it('sem movimento e saldo 0 -> vazio', () => {
    expect(montarProjecaoCaixinha({ caixinha: caixinha(), movimentos: [], pendentes: [], mesAtual: '2026-10' })).toEqual({ tipo: 'vazio' })
  })

  it('tudo resgatado (saldo 0 com histórico) -> sem simulação, histórico mantido', () => {
    const r = montarProjecaoCaixinha({
      caixinha: caixinha({ balance_cents: 0 }),
      movimentos: [mov('entrada', 1000, '2026-07-01'), mov('saida', 1000, '2026-09-01')],
      pendentes: [],
      mesAtual: '2026-10',
    })
    expect(r.tipo).toBe('sem_simulacao')
    if (r.tipo !== 'sem_simulacao') return
    expect(r.motivo).toBe('saldo_zero')
    expect(r.pontos.at(-1)).toMatchObject({ mes: '2026-10', valorCentavos: 0, situacao: 'hoje' })
    expect(r.pontos.some((p) => p.situacao === 'simulacao')).toBe(false)
  })

  it('soma dos movimentos diferente de balance_cents -> divergente (nunca plota)', () => {
    expect(
      montarProjecaoCaixinha({ caixinha: caixinha({ balance_cents: SALDO + 1 }), movimentos: MOVS, pendentes: [], mesAtual: '2026-10' }).tipo,
    ).toBe('divergente')
  })

  it('saldo de fim de mês negativo (dado corrompido) -> divergente', () => {
    expect(
      montarProjecaoCaixinha({
        caixinha: caixinha({ balance_cents: 0 }),
        movimentos: [mov('saida', 500, '2026-07-10'), mov('entrada', 500, '2026-08-10')],
        pendentes: [],
        mesAtual: '2026-10',
      }).tipo,
    ).toBe('divergente')
  })

  it('valor não inteiro, zero, negativo ou data malformada -> divergente', () => {
    const base = { caixinha: caixinha({ balance_cents: 100 }), pendentes: [], mesAtual: '2026-10' }
    expect(montarProjecaoCaixinha({ ...base, movimentos: [mov('entrada', 100.5, '2026-07-01')] }).tipo).toBe('divergente')
    expect(montarProjecaoCaixinha({ ...base, movimentos: [mov('entrada', 0, '2026-07-01')] }).tipo).toBe('divergente')
    expect(montarProjecaoCaixinha({ ...base, movimentos: [mov('entrada', -100, '2026-07-01')] }).tipo).toBe('divergente')
    expect(montarProjecaoCaixinha({ ...base, movimentos: [mov('entrada', 100, '01/07/2026')] }).tipo).toBe('divergente')
  })

  it('movimento em mês posterior ao corrente -> divergente', () => {
    expect(
      montarProjecaoCaixinha({
        caixinha: caixinha({ balance_cents: 100 }),
        movimentos: [mov('entrada', 100, '2026-11-01')],
        pendentes: [],
        mesAtual: '2026-10',
      }).tipo,
    ).toBe('divergente')
  })

  it('created_at inválido -> divergente', () => {
    expect(
      montarProjecaoCaixinha({ caixinha: caixinha({ balance_cents: 100, created_at: 'x' }), movimentos: [mov('entrada', 100, '2026-07-01')], pendentes: [], mesAtual: '2026-10' }).tipo,
    ).toBe('divergente')
  })
})

describe('montarProjecaoCaixinha — simulação', () => {
  it('começa no mês seguinte e é exatamente projetarValorFuturo a partir do saldo confirmado', () => {
    const r = montarProjecaoCaixinha({ caixinha: caixinha({ balance_cents: SALDO }), movimentos: MOVS, pendentes: [], mesAtual: '2026-10' })
    if (r.tipo !== 'ok') throw new Error(r.tipo)
    const esperado = projetarValorFuturo({ valorCentavos: SALDO, taxaMensalBps: 100, meses: 12 })
    if (!esperado.ok) throw new Error('simulador')
    const simulados = r.pontos.slice(r.indiceHoje + 1)
    expect(simulados).toHaveLength(12)
    expect(simulados[0].mes).toBe('2026-11')
    expect(simulados[11].mes).toBe('2027-10')
    simulados.forEach((p, i) => {
      expect(p.situacao).toBe('simulacao')
      expect(p.valorCentavos).toBe(esperado.pontos[i + 1].valorCentavos)
    })
    expect(r.valorFinalCentavos).toBe(esperado.pontos[12].valorCentavos)
  })

  it('pendentes NÃO entram na simulação nem na linha confirmada (spec 4b)', () => {
    const r = montarProjecaoCaixinha({
      caixinha: caixinha({ balance_cents: SALDO }),
      movimentos: MOVS,
      pendentes: [pend('2026-08-01', 1010), pend('2026-09-01', 710)],
      mesAtual: '2026-10',
    })
    if (r.tipo !== 'ok') throw new Error(r.tipo)
    expect(r.pontos[r.indiceHoje].valorCentavos).toBe(SALDO)
    expect(r.valorFinalCentavos).toBe(valorProjetadoCentavos(SALDO, 100, 12))
  })

  it('taxa 0 -> simulação plana igual ao saldo, sem NaN', () => {
    const r = montarProjecaoCaixinha({ caixinha: caixinha({ balance_cents: SALDO, rate_bps: 0 }), movimentos: MOVS, pendentes: [], mesAtual: '2026-10' })
    if (r.tipo !== 'ok') throw new Error(r.tipo)
    expect(r.pontos.slice(r.indiceHoje).every((p) => p.valorCentavos === SALDO)).toBe(true)
  })

  it('resultado grande demais -> sem simulação, sem exceção', () => {
    const grande = 99_999_999_999_999
    const r = montarProjecaoCaixinha({
      caixinha: caixinha({ balance_cents: grande, rate_bps: 10_000 }),
      movimentos: [mov('entrada', grande, '2026-07-01')],
      pendentes: [],
      mesAtual: '2026-10',
    })
    expect(r.tipo).toBe('sem_simulacao')
    if (r.tipo === 'sem_simulacao') expect(r.motivo).toBe('resultado_grande_demais')
  })

  it('taxa fora da faixa -> divergente', () => {
    expect(
      montarProjecaoCaixinha({ caixinha: caixinha({ balance_cents: SALDO, rate_bps: 10_001 }), movimentos: MOVS, pendentes: [], mesAtual: '2026-10' }).tipo,
    ).toBe('divergente')
  })
})

describe('pendentes', () => {
  it('marcam só os meses dentro da janela; somam em centavos inteiros', () => {
    const r = montarProjecaoCaixinha({
      caixinha: caixinha({ balance_cents: SALDO }),
      movimentos: MOVS,
      pendentes: [pend('2026-08-01', 1010), pend('2026-09-01', 710), pend('2026-08-01', 5, 'outra')],
      mesAtual: '2026-10',
      mesesHistorico: 2,
    })
    if (r.tipo !== 'ok') throw new Error(r.tipo)
    expect(r.pontos.map((p) => [p.mes, p.pendenteCentavos]).slice(0, 2)).toEqual([
      ['2026-09', 710],
      ['2026-10', 0],
    ])
  })

  it('totalPendente inclui meses fora da janela e ignora outra caixinha e valores inválidos', () => {
    expect(
      totalPendente([pend('2026-03-01', 101), pend('2026-08-01', 1010), pend('2026-08-01', 5, 'outra'), pend('2026-09-01', 0), pend('2026-09-01', 1.5)], ID),
    ).toEqual({ meses: 2, centavos: 1111 })
    expect(totalPendente([], ID)).toEqual({ meses: 0, centavos: 0 })
  })
})

describe('valorProjetadoCentavos', () => {
  it('é o mesmo número do fim do gráfico', () => {
    const r = montarProjecaoCaixinha({ caixinha: caixinha({ balance_cents: SALDO }), movimentos: MOVS, pendentes: [], mesAtual: '2026-10' })
    if (r.tipo !== 'ok') throw new Error(r.tipo)
    expect(valorProjetadoCentavos(SALDO, 100, 12)).toBe(r.valorFinalCentavos)
  })

  it('entrada inválida ou estouro -> null', () => {
    expect(valorProjetadoCentavos(-1, 100, 12)).toBeNull()
    expect(valorProjetadoCentavos(99_999_999_999_999, 10_000, 12)).toBeNull()
  })
})
