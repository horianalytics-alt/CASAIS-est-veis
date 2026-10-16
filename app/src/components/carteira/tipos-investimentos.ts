export type TipoRendimento = 'liquidez_diaria' | 'pos_fixado' | 'pre_fixado'

export interface CaixinhaInvestimento {
  id: string
  family_id: string
  account_id: string
  name: string
  rate_type: TipoRendimento
  rate_bps: number // pontos-base mensal (ex: 105 bps = 1,05% a.m.)
  rate_defined_at: string // ISO date
  resgate_imediato: boolean
  data_vencimento: string | null // ISO date se resgate_imediato === false
  balance_cents: number // centavos inteiros
  created_at: string
  updated_at: string
}

export interface CarteiraInvestimentoResumo {
  saldoTotalCents: number
  saldoNaoAlocadoCents: number
  caixinhas: CaixinhaInvestimento[]
}

export const ROTULOS_TIPO_RENDIMENTO: Record<TipoRendimento, string> = {
  liquidez_diaria: 'Liquidez Diária',
  pos_fixado: 'Pós-fixado (CDI)',
  pre_fixado: 'Pré-fixado',
}

/** Formata taxa em bps para string amigável (ex: 105 bps -> 1,05% a.m.) */
export function formatarTaxaMensal(rateBps: number): string {
  const taxaPercentual = rateBps / 100
  return `${taxaPercentual.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}% a.m.`
}

/** Dados mockados para desenvolvimento e validação visual enquanto Estrutura finaliza o backend */
export const MOCK_CARTEIRA_INVESTIMENTO: CarteiraInvestimentoResumo = {
  saldoTotalCents: 4585000, // R$ 45.850,00
  saldoNaoAlocadoCents: 350000, // R$ 3.500,00
  caixinhas: [
    {
      id: 'caixinha-1',
      family_id: 'fam-1',
      account_id: 'acc-inv-1',
      name: 'Reserva de Emergência',
      rate_type: 'liquidez_diaria',
      rate_bps: 102, // 1,02% a.m.
      rate_defined_at: '2026-10-01',
      resgate_imediato: true,
      data_vencimento: null,
      balance_cents: 2500000, // R$ 25.000,00
      created_at: '2026-09-01T10:00:00Z',
      updated_at: '2026-10-15T12:00:00Z',
    },
    {
      id: 'caixinha-2',
      family_id: 'fam-1',
      account_id: 'acc-inv-1',
      name: 'CDB Pré-fixado 2027',
      rate_type: 'pre_fixado',
      rate_bps: 115, // 1,15% a.m.
      rate_defined_at: '2026-09-15',
      resgate_imediato: false,
      data_vencimento: '2027-12-15',
      balance_cents: 1200000, // R$ 12.000,00
      created_at: '2026-09-15T14:30:00Z',
      updated_at: '2026-10-10T09:00:00Z',
    },
    {
      id: 'caixinha-3',
      family_id: 'fam-1',
      account_id: 'acc-inv-1',
      name: 'LCI Imobiliária',
      rate_type: 'pos_fixado',
      rate_bps: 98, // 0,98% a.m.
      rate_defined_at: '2026-08-20',
      resgate_imediato: false,
      data_vencimento: '2026-10-10', // Vencimento já passou: resgate liberado!
      balance_cents: 535000, // R$ 5.350,00
      created_at: '2026-08-20T11:00:00Z',
      updated_at: '2026-10-11T16:00:00Z',
    },
  ],
}
