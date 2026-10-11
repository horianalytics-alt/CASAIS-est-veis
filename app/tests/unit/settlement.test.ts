import { describe, it, expect } from 'vitest'
import { calcSettlement, resolveTransfer } from '@/lib/settlement'
import type { SettlementMember, SettlementTransaction } from '@/lib/settlement'

const heitor: SettlementMember = { id: 'h', monthly_income: 6000 }
const carol: SettlementMember = { id: 'c', monthly_income: 4000 }

function sharedExpense(
  amount: number,
  paidBy: string,
  overrides: Partial<SettlementTransaction> = {},
): SettlementTransaction {
  return {
    type: 'despesa',
    amount,
    is_paid: true,
    paid_by_member_id: paidBy,
    owner_member_id: null,
    owner_share: null,
    ...overrides,
  }
}

function balanceOf(result: ReturnType<typeof calcSettlement>, memberId: string): number {
  const row = result.find((r) => r.member_id === memberId)
  if (!row) throw new Error(`membro ${memberId} ausente no resultado`)
  return row.balance
}

describe('calcSettlement — regra igual', () => {
  it('gasto compartilhado pago por um gera crédito de metade', () => {
    const result = calcSettlement([heitor, carol], [sharedExpense(100, 'h')], 'equal')
    expect(balanceOf(result, 'h')).toBeCloseTo(50)
    expect(balanceOf(result, 'c')).toBeCloseTo(-50)
  })

  it('a soma dos saldos é sempre zero', () => {
    const result = calcSettlement(
      [heitor, carol],
      [sharedExpense(100, 'h'), sharedExpense(250, 'c'), sharedExpense(37.5, 'h')],
      'equal',
    )
    const total = result.reduce((sum, r) => sum + r.balance, 0)
    expect(total).toBeCloseTo(0)
  })

  it('gastos equivalentes dos dois zeram o acerto', () => {
    const result = calcSettlement(
      [heitor, carol],
      [sharedExpense(100, 'h'), sharedExpense(100, 'c')],
      'equal',
    )
    expect(balanceOf(result, 'h')).toBeCloseTo(0)
    expect(balanceOf(result, 'c')).toBeCloseTo(0)
  })

  it('lançamento não pago não entra no acerto', () => {
    const result = calcSettlement(
      [heitor, carol],
      [sharedExpense(100, 'h', { is_paid: false })],
      'equal',
    )
    expect(balanceOf(result, 'h')).toBe(0)
    expect(balanceOf(result, 'c')).toBe(0)
  })

  it('receita não entra no acerto', () => {
    const result = calcSettlement(
      [heitor, carol],
      [sharedExpense(100, 'h', { type: 'receita' })],
      'equal',
    )
    expect(balanceOf(result, 'h')).toBe(0)
    expect(balanceOf(result, 'c')).toBe(0)
  })

  it('transferência não entra no acerto (senão o próprio acerto se contaria)', () => {
    const result = calcSettlement(
      [heitor, carol],
      [sharedExpense(100, 'h', { type: 'transferencia' })],
      'equal',
    )
    expect(balanceOf(result, 'h')).toBe(0)
    expect(balanceOf(result, 'c')).toBe(0)
  })

  it('investimento compartilhado entra no acerto', () => {
    const result = calcSettlement(
      [heitor, carol],
      [sharedExpense(200, 'h', { type: 'investimento' })],
      'equal',
    )
    expect(balanceOf(result, 'h')).toBeCloseTo(100)
    expect(balanceOf(result, 'c')).toBeCloseTo(-100)
  })

  it('gasto pessoal pago pelo próprio dono não afeta ninguém', () => {
    const result = calcSettlement(
      [heitor, carol],
      [sharedExpense(80, 'h', { owner_member_id: 'h' })],
      'equal',
    )
    expect(balanceOf(result, 'h')).toBeCloseTo(0)
    expect(balanceOf(result, 'c')).toBeCloseTo(0)
  })

  it('gasto pessoal de um pago pelo outro gera dívida integral', () => {
    // Carol pagou algo que é só do Heitor: ele deve os 80 inteiros.
    const result = calcSettlement(
      [heitor, carol],
      [sharedExpense(80, 'c', { owner_member_id: 'h' })],
      'equal',
    )
    expect(balanceOf(result, 'h')).toBeCloseTo(-80)
    expect(balanceOf(result, 'c')).toBeCloseTo(80)
  })
})

describe('calcSettlement — regra proporcional à renda', () => {
  it('divide na proporção da renda de cada um', () => {
    // Heitor 6000 de 10000 = 60%; Carol 40%. Gasto de 1000 pago pelo Heitor.
    const result = calcSettlement([heitor, carol], [sharedExpense(1000, 'h')], 'proportional')
    expect(balanceOf(result, 'h')).toBeCloseTo(400)
    expect(balanceOf(result, 'c')).toBeCloseTo(-400)
  })

  it('renda zero de um membro não divide por zero', () => {
    const semRenda: SettlementMember = { id: 'c', monthly_income: 0 }
    const result = calcSettlement([heitor, semRenda], [sharedExpense(100, 'h')], 'proportional')
    // Heitor tem 100% da renda: a cota dele é tudo, então ninguém deve nada.
    expect(balanceOf(result, 'h')).toBeCloseTo(0)
    expect(balanceOf(result, 'c')).toBeCloseTo(0)
  })

  it('renda nula (não informada) é tratada como zero', () => {
    const semInformar: SettlementMember = { id: 'c', monthly_income: null }
    const result = calcSettlement([heitor, semInformar], [sharedExpense(100, 'h')], 'proportional')
    expect(balanceOf(result, 'h')).toBeCloseTo(0)
    expect(balanceOf(result, 'c')).toBeCloseTo(0)
  })

  it('renda zero de TODOS cai para divisão igual em vez de quebrar', () => {
    const a: SettlementMember = { id: 'h', monthly_income: 0 }
    const b: SettlementMember = { id: 'c', monthly_income: 0 }
    const result = calcSettlement([a, b], [sharedExpense(100, 'h')], 'proportional')
    expect(balanceOf(result, 'h')).toBeCloseTo(50)
    expect(balanceOf(result, 'c')).toBeCloseTo(-50)
  })

  it('a soma dos saldos é zero também na regra proporcional', () => {
    const result = calcSettlement(
      [heitor, carol],
      [sharedExpense(333.33, 'h'), sharedExpense(167.77, 'c')],
      'proportional',
    )
    const total = result.reduce((sum, r) => sum + r.balance, 0)
    expect(total).toBeCloseTo(0)
  })
})

describe('calcSettlement — cota por lançamento', () => {
  it('cota de 70% para um membro ignora a regra da família', () => {
    // Carol pagou 100 e a responsabilidade do Heitor é 70%.
    const result = calcSettlement(
      [heitor, carol],
      [sharedExpense(100, 'c', { owner_member_id: 'h', owner_share: 0.7 })],
      'equal',
    )
    expect(balanceOf(result, 'h')).toBeCloseTo(-70)
    expect(balanceOf(result, 'c')).toBeCloseTo(70)
  })

  it('cota de 100% equivale a gasto pessoal', () => {
    const result = calcSettlement(
      [heitor, carol],
      [sharedExpense(100, 'c', { owner_member_id: 'h', owner_share: 1 })],
      'equal',
    )
    expect(balanceOf(result, 'h')).toBeCloseTo(-100)
    expect(balanceOf(result, 'c')).toBeCloseTo(100)
  })

  it('cota de 0% deixa toda a responsabilidade com o outro', () => {
    const result = calcSettlement(
      [heitor, carol],
      [sharedExpense(100, 'c', { owner_member_id: 'h', owner_share: 0 })],
      'equal',
    )
    expect(balanceOf(result, 'h')).toBeCloseTo(0)
    expect(balanceOf(result, 'c')).toBeCloseTo(0)
  })

  it('a soma continua zero com cota customizada', () => {
    const result = calcSettlement(
      [heitor, carol],
      [sharedExpense(100, 'c', { owner_member_id: 'h', owner_share: 0.35 })],
      'equal',
    )
    const total = result.reduce((sum, r) => sum + r.balance, 0)
    expect(total).toBeCloseTo(0)
  })
})

describe('calcSettlement — casos de borda', () => {
  it('sem lançamentos devolve saldo zero para todos', () => {
    const result = calcSettlement([heitor, carol], [], 'equal')
    expect(result).toHaveLength(2)
    expect(result.every((r) => r.balance === 0)).toBe(true)
  })

  it('família de um membro só nunca gera dívida', () => {
    const result = calcSettlement([heitor], [sharedExpense(100, 'h')], 'equal')
    expect(balanceOf(result, 'h')).toBeCloseTo(0)
  })

  it('pagador fora da lista de membros não corrompe os saldos dos membros', () => {
    // Membro que saiu da família: a soma dos membros atuais não precisa fechar em zero,
    // mas nenhum saldo pode virar NaN.
    const result = calcSettlement(
      [heitor, carol],
      [sharedExpense(100, 'fantasma')],
      'equal',
    )
    expect(Number.isNaN(balanceOf(result, 'h'))).toBe(false)
    expect(Number.isNaN(balanceOf(result, 'c'))).toBe(false)
  })

  it('arredonda para centavos para não gerar dívida de fração de centavo', () => {
    // 100 / 3 não é exato; o resultado precisa ser dinheiro de verdade.
    const tres: SettlementMember[] = [
      { id: 'a', monthly_income: 1000 },
      { id: 'b', monthly_income: 1000 },
      { id: 'd', monthly_income: 1000 },
    ]
    const result = calcSettlement(tres, [sharedExpense(100, 'a')], 'equal')
    for (const row of result) {
      expect(row.balance).toBe(Math.round(row.balance * 100) / 100)
    }
  })
})

describe('resolveTransfer', () => {
  it('indica quem paga quem e quanto', () => {
    const result = calcSettlement([heitor, carol], [sharedExpense(100, 'h')], 'equal')
    const transfer = resolveTransfer(result)
    expect(transfer).toEqual({ from_member_id: 'c', to_member_id: 'h', amount: 50 })
  })

  it('devolve null quando está tudo quitado', () => {
    const result = calcSettlement([heitor, carol], [], 'equal')
    expect(resolveTransfer(result)).toBeNull()
  })

  it('devolve null para diferença abaixo de um centavo', () => {
    const transfer = resolveTransfer([
      { member_id: 'h', balance: 0.004 },
      { member_id: 'c', balance: -0.004 },
    ])
    expect(transfer).toBeNull()
  })

  it('inverte o sentido quando o outro é o credor', () => {
    const result = calcSettlement([heitor, carol], [sharedExpense(100, 'c')], 'equal')
    const transfer = resolveTransfer(result)
    expect(transfer).toEqual({ from_member_id: 'h', to_member_id: 'c', amount: 50 })
  })
})
