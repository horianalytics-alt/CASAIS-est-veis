export type SplitRule = 'equal' | 'proportional'

export interface SettlementMember {
  id: string
  monthly_income: number | null
}

export interface SettlementTransaction {
  type: string
  amount: number
  is_paid: boolean
  paid_by_member_id: string
  owner_member_id: string | null
  owner_share: number | null
}

export interface SettlementBalance {
  member_id: string
  balance: number
}

export interface SettlementTransfer {
  from_member_id: string
  to_member_id: string
  amount: number
}

const CENTS = 100

function toCents(value: number): number {
  return Math.round(value * CENTS)
}

/**
 * Quanto cada membro deve de um gasto compartilhado.
 * Na regra proporcional sem nenhuma renda informada, cai para divisão igual —
 * dividir por renda total zero não produziria número.
 */
function sharesFor(members: SettlementMember[], rule: SplitRule): Map<string, number> {
  const shares = new Map<string, number>()
  if (members.length === 0) return shares

  const totalIncome = members.reduce((sum, m) => sum + (m.monthly_income ?? 0), 0)
  const useProportional = rule === 'proportional' && totalIncome > 0

  for (const member of members) {
    shares.set(
      member.id,
      useProportional
        ? (member.monthly_income ?? 0) / totalIncome
        : 1 / members.length,
    )
  }

  return shares
}

/**
 * Saldo de cada membro: o que pagou menos a cota que lhe cabia.
 * Positivo = tem crédito a receber. Negativo = deve.
 */
export function calcSettlement(
  members: SettlementMember[],
  transactions: SettlementTransaction[],
  rule: SplitRule,
): SettlementBalance[] {
  const shares = sharesFor(members, rule)
  const cents = new Map<string, number>()
  for (const member of members) cents.set(member.id, 0)

  const credit = (memberId: string, amountCents: number) => {
    if (!cents.has(memberId)) return
    cents.set(memberId, cents.get(memberId)! + amountCents)
  }

  for (const tx of transactions) {
    if (!tx.is_paid) continue
    if (tx.type !== 'despesa' && tx.type !== 'investimento') continue

    const amountCents = toCents(tx.amount)
    credit(tx.paid_by_member_id, amountCents)

    if (tx.owner_member_id === null) {
      for (const member of members) {
        const share = shares.get(member.id) ?? 0
        credit(member.id, -Math.round(amountCents * share))
      }
      continue
    }

    // Responsável nomeado: a cota dele é o override, ou o gasto inteiro.
    const ownerShare = tx.owner_share ?? 1
    const ownerCents = Math.round(amountCents * ownerShare)
    credit(tx.owner_member_id, -ownerCents)

    // O resto fica com quem pagou.
    const remainder = amountCents - ownerCents
    if (remainder !== 0 && tx.paid_by_member_id !== tx.owner_member_id) {
      credit(tx.paid_by_member_id, -remainder)
    }
  }

  return members.map((member) => ({
    member_id: member.id,
    balance: (cents.get(member.id) ?? 0) / CENTS,
  }))
}

/**
 * A transferência única que zera o acerto entre duas pessoas.
 * Devolve null quando a diferença não chega a um centavo.
 */
export function resolveTransfer(balances: SettlementBalance[]): SettlementTransfer | null {
  let debtor: SettlementBalance | null = null
  let creditor: SettlementBalance | null = null

  for (const row of balances) {
    if (!debtor || row.balance < debtor.balance) debtor = row
    if (!creditor || row.balance > creditor.balance) creditor = row
  }

  if (!debtor || !creditor || debtor.member_id === creditor.member_id) return null

  const amount = Math.round(Math.min(-debtor.balance, creditor.balance) * CENTS) / CENTS
  if (amount < 0.01) return null

  return {
    from_member_id: debtor.member_id,
    to_member_id: creditor.member_id,
    amount,
  }
}
