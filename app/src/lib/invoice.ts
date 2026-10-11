import { monthLabel } from './format'

export interface InvoicePeriod {
  year: number
  month: number
}

/**
 * Em qual fatura uma compra cai. A compra feita no dia do fechamento já
 * pertence ao ciclo seguinte — o fechamento encerra o ciclo anterior.
 */
export function getInvoicePeriod(dateISO: string, closingDay: number): InvoicePeriod {
  const year = Number(dateISO.slice(0, 4))
  const month = Number(dateISO.slice(5, 7))
  const day = Number(dateISO.slice(8, 10))

  if (day < closingDay) {
    return { year, month }
  }

  return month === 12
    ? { year: year + 1, month: 1 }
    : { year, month: month + 1 }
}

/**
 * Data de vencimento da fatura. Se o dia configurado não existe no mês
 * (dia 30 em fevereiro), usa o último dia disponível.
 */
export function getInvoiceDueDate(year: number, month: number, dueDay: number): string {
  const lastDay = new Date(year, month, 0).getDate()
  const day = Math.min(dueDay, lastDay)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function invoicePeriodLabel(year: number, month: number): string {
  return monthLabel(`${year}-${String(month).padStart(2, '0')}-01`)
}
