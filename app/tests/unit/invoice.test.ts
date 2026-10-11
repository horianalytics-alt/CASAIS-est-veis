import { describe, it, expect } from 'vitest'
import { getInvoicePeriod, getInvoiceDueDate, invoicePeriodLabel } from '@/lib/invoice'

describe('getInvoicePeriod', () => {
  it('compra antes do fechamento cai na fatura do mês corrente', () => {
    expect(getInvoicePeriod('2026-10-24', 25)).toEqual({ year: 2026, month: 10 })
  })

  it('compra no dia do fechamento cai na fatura do mês seguinte', () => {
    expect(getInvoicePeriod('2026-10-25', 25)).toEqual({ year: 2026, month: 11 })
  })

  it('compra depois do fechamento cai na fatura do mês seguinte', () => {
    expect(getInvoicePeriod('2026-10-26', 25)).toEqual({ year: 2026, month: 11 })
  })

  it('compra em dezembro depois do fechamento cai em janeiro do ano seguinte', () => {
    expect(getInvoicePeriod('2026-12-26', 25)).toEqual({ year: 2027, month: 1 })
  })

  it('compra em dezembro antes do fechamento permanece em dezembro', () => {
    expect(getInvoicePeriod('2026-12-24', 25)).toEqual({ year: 2026, month: 12 })
  })

  it('primeiro dia do mês cai no mês corrente', () => {
    expect(getInvoicePeriod('2026-10-01', 25)).toEqual({ year: 2026, month: 10 })
  })

  it('fechamento no dia 1 joga todo o mês para o mês seguinte', () => {
    expect(getInvoicePeriod('2026-10-01', 1)).toEqual({ year: 2026, month: 11 })
    expect(getInvoicePeriod('2026-10-15', 1)).toEqual({ year: 2026, month: 11 })
  })

  it('fechamento no dia 31 mantém tudo no mês corrente em fevereiro', () => {
    // Fevereiro nunca alcança o dia 31, então nada transborda.
    expect(getInvoicePeriod('2026-02-28', 31)).toEqual({ year: 2026, month: 2 })
  })

  it('fechamento no dia 31 em mês de 30 dias mantém no mês corrente', () => {
    expect(getInvoicePeriod('2026-04-30', 31)).toEqual({ year: 2026, month: 4 })
  })

  it('último dia de um mês de 31 dias com fechamento 31 vai para o mês seguinte', () => {
    expect(getInvoicePeriod('2026-10-31', 31)).toEqual({ year: 2026, month: 11 })
  })
})

describe('getInvoiceDueDate', () => {
  it('vencimento depois do fechamento cai no mesmo mês da fatura', () => {
    // Fatura de novembro, vence dia 5 → 05/11
    expect(getInvoiceDueDate(2026, 11, 5)).toBe('2026-11-05')
  })

  it('vencimento em fevereiro com dia 30 cai no último dia do mês', () => {
    expect(getInvoiceDueDate(2026, 2, 30)).toBe('2026-02-28')
  })

  it('vencimento em fevereiro de ano bissexto com dia 30', () => {
    expect(getInvoiceDueDate(2028, 2, 30)).toBe('2028-02-29')
  })

  it('vencimento dia 31 em mês de 30 dias cai no dia 30', () => {
    expect(getInvoiceDueDate(2026, 4, 31)).toBe('2026-04-30')
  })
})

describe('invoicePeriodLabel', () => {
  it('monta o rótulo legível da fatura', () => {
    expect(invoicePeriodLabel(2026, 11)).toBe('nov/2026')
  })

  it('monta o rótulo de janeiro', () => {
    expect(invoicePeriodLabel(2027, 1)).toBe('jan/2027')
  })
})
