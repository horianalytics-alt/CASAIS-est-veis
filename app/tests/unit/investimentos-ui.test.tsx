import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import * as React from 'react'

// jsdom mocks
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.mock('@/lib/haptics', () => ({
  hapticFeedback: {
    light: vi.fn(),
    medium: vi.fn(),
    heavy: vi.fn(),
    selection: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('@/hooks/use-in-view', () => ({
  useInView: () => ({ ref: { current: null }, inView: true }),
}))

import {
  formatarTaxaMensal,
  type CaixinhaInvestimento,
  type CarteiraInvestimentoResumo,
} from '@/components/carteira/tipos-investimentos'
import { CardCaixinha } from '@/components/carteira/card-caixinha'
import { DialogoResgatar } from '@/components/carteira/dialogo-resgatar'
import { AreaInvestimentos } from '@/components/carteira/area-investimentos'

describe('Investimentos UI — Testes Unitários', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  describe('formatarTaxaMensal', () => {
    it('formata 105 bps como 1,05% a.m.', () => {
      expect(formatarTaxaMensal(105)).toBe('1,05% a.m.')
    })

    it('formata 80 bps como 0,80% a.m.', () => {
      expect(formatarTaxaMensal(80)).toBe('0,80% a.m.')
    })

    it('formata 1200 bps como 12,00% a.m.', () => {
      expect(formatarTaxaMensal(1200)).toBe('12,00% a.m.')
    })
  })

  describe('CardCaixinha', () => {
    const mockCaixinhaImediata: CaixinhaInvestimento = {
      id: 'cx-1',
      family_id: 'fam-1',
      account_id: 'acc-1',
      name: 'Reserva de Emergência',
      rate_type: 'liquidez_diaria',
      rate_bps: 105,
      rate_defined_at: '2026-10-01',
      resgate_imediato: true,
      data_vencimento: null,
      balance_cents: 1250000,
      created_at: '2026-10-01T00:00:00Z',
      updated_at: '2026-10-01T00:00:00Z',
    }

    const mockCaixinhaBloqueada: CaixinhaInvestimento = {
      id: 'cx-2',
      family_id: 'fam-1',
      account_id: 'acc-1',
      name: 'CDB 2028',
      rate_type: 'pos_fixado',
      rate_bps: 120,
      rate_defined_at: '2026-10-01',
      resgate_imediato: false,
      data_vencimento: '2028-12-31',
      balance_cents: 500000,
      created_at: '2026-10-01T00:00:00Z',
      updated_at: '2026-10-01T00:00:00Z',
    }

    const mockCaixinhaVencida: CaixinhaInvestimento = {
      id: 'cx-3',
      family_id: 'fam-1',
      account_id: 'acc-1',
      name: 'LCI 2025',
      rate_type: 'pos_fixado',
      rate_bps: 95,
      rate_defined_at: '2025-01-01',
      resgate_imediato: false,
      data_vencimento: '2025-10-01',
      balance_cents: 300000,
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    }

    it('exibe badge "Resgate imediato" para caixinhas de liquidez diária', () => {
      const aoAlocar = vi.fn()
      const aoResgatar = vi.fn()

      render(
        <CardCaixinha
          caixinha={mockCaixinhaImediata}
          aoAlocar={aoAlocar}
          aoResgatar={aoResgatar}
        />,
      )

      expect(screen.getByText('Reserva de Emergência')).toBeDefined()
      expect(screen.getByText('Resgate imediato')).toBeDefined()
      expect(screen.getByText('1,05% a.m.')).toBeDefined()
    })

    it('exibe badge de bloqueio com data futura quando não possui resgate imediato', () => {
      const aoAlocar = vi.fn()
      const aoResgatar = vi.fn()

      render(
        <CardCaixinha
          caixinha={mockCaixinhaBloqueada}
          aoAlocar={aoAlocar}
          aoResgatar={aoResgatar}
        />,
      )

      expect(screen.getByText('CDB 2028')).toBeDefined()
      expect(screen.getByText(/Até 31\/12/)).toBeDefined()
    })

    it('exibe badge "Vencido · Liberado" com animate-micro-pulso quando prazo já passou', () => {
      const aoAlocar = vi.fn()
      const aoResgatar = vi.fn()

      const { container } = render(
        <CardCaixinha
          caixinha={mockCaixinhaVencida}
          aoAlocar={aoAlocar}
          aoResgatar={aoResgatar}
        />,
      )

      expect(screen.getByText('Vencido · Liberado')).toBeDefined()
      const badgePulso = container.querySelector('.animate-micro-pulso')
      expect(badgePulso).not.toBeNull()
    })

    it('aciona callbacks de alocar e resgatar ao clicar nos botões', () => {
      const aoAlocar = vi.fn()
      const aoResgatar = vi.fn()

      render(
        <CardCaixinha
          caixinha={mockCaixinhaImediata}
          aoAlocar={aoAlocar}
          aoResgatar={aoResgatar}
        />,
      )

      const botaoAlocar = screen.getByRole('button', { name: /alocar/i })
      fireEvent.click(botaoAlocar)
      expect(aoAlocar).toHaveBeenCalledWith(mockCaixinhaImediata)

      const botaoResgatar = screen.getByRole('button', { name: /resgatar/i })
      fireEvent.click(botaoResgatar)
      expect(aoResgatar).toHaveBeenCalledWith(mockCaixinhaImediata)
    })
  })

  describe('DialogoResgatar — Validação de carência', () => {
    it('mostra mensagem clara de carência bloqueada quando não atingiu vencimento', () => {
      const caixinhaBloqueada: CaixinhaInvestimento = {
        id: 'cx-bloq',
        family_id: 'fam-1',
        account_id: 'acc-1',
        name: 'Tesouro Prefixado 2029',
        rate_type: 'pre_fixado',
        rate_bps: 110,
        rate_defined_at: '2026-10-01',
        resgate_imediato: false,
        data_vencimento: '2029-01-01',
        balance_cents: 1000000,
        created_at: '2026-10-01T00:00:00Z',
        updated_at: '2026-10-01T00:00:00Z',
      }

      render(
        <DialogoResgatar
          aberto={true}
          onOpenChange={vi.fn()}
          caixinha={caixinhaBloqueada}
          contasDestino={[]}
          onResgatar={vi.fn()}
        />,
      )

      expect(screen.getByText('Resgate Bloqueado por Carência')).toBeDefined()
      expect(screen.getByText(/Esta caixinha possui carência contratada até/)).toBeDefined()

      const botaoConfirmar = screen.getByRole('button', { name: /confirmar resgate/i })
      expect((botaoConfirmar as HTMLButtonElement).disabled).toBe(true)
    })
  })

  describe('AreaInvestimentos', () => {
    const contasOrigem = [
      { id: 'cta-1', name: 'Nubank Principal', current_balance: 5420.5 },
      { id: 'cta-2', name: 'Itaú Reserva', current_balance: 12000.0 },
    ]

    it('renderiza o hero patrimonial com saldo total e saldo não alocado', () => {
      render(<AreaInvestimentos contasOrigem={contasOrigem} />)

      expect(screen.getByText('Patrimônio Total Investido')).toBeDefined()
      expect(screen.getByText('Saldo não alocado')).toBeDefined()
      expect(screen.getByRole('button', { name: /aplicar na carteira/i })).toBeDefined()
      expect(screen.getByRole('button', { name: /criar caixinha/i })).toBeDefined()
    })

    it('nunca utiliza a palavra "Transferir" nos textos da interface', () => {
      const { container } = render(<AreaInvestimentos contasOrigem={contasOrigem} />)
      const textoCompleto = container.textContent ?? ''

      expect(textoCompleto.toLowerCase()).not.toContain('transferir')
      expect(textoCompleto.toLowerCase()).not.toContain('transferência')
    })
  })
})
