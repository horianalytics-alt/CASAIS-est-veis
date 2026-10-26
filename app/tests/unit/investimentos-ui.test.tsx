import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import * as React from 'react'

// jsdom mocks
Element.prototype.scrollIntoView = vi.fn()
window.HTMLElement.prototype.scrollIntoView = vi.fn()
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
import { DialogoAplicar } from '@/components/carteira/dialogo-aplicar'
import { DialogoCriarCaixinha } from '@/components/carteira/dialogo-criar-caixinha'
import { DialogoAlocar } from '@/components/carteira/dialogo-alocar'
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

  describe('DialogoAplicar — Achado A4 e A7', () => {
    const contas = [
      { id: 'cta-1', name: 'Conta Principal', current_balance: 1000 },
      { id: 'cta-2', name: 'Conta Reserva', current_balance: 5000 },
    ]
    const caixinhas: CaixinhaInvestimento[] = [
      {
        id: 'cx-1',
        family_id: 'fam-1',
        account_id: 'acc-1',
        name: 'Reserva',
        rate_type: 'liquidez_diaria',
        rate_bps: 100,
        rate_defined_at: '2026-01-01',
        resgate_imediato: true,
        data_vencimento: null,
        balance_cents: 10000,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ]

    it('[A4] preserva o valor e o destino ao trocar a conta de origem', () => {
      const { rerender } = render(
        <DialogoAplicar
          aberto={true}
          onOpenChange={vi.fn()}
          contasOrigem={contas}
          caixinhas={caixinhas}
          onAplicar={vi.fn()}
        />,
      )

      const inputValor = screen.getByPlaceholderText('0,00') as HTMLInputElement
      fireEvent.change(inputValor, { target: { value: '250,00' } })
      expect(inputValor.value).toBe('250,00')

      // Trocar a conta de origem selecionando outra conta
      const selectOrigem = screen.getByRole('combobox', { name: /conta de origem/i })
      fireEvent.click(selectOrigem)

      // Rerender com a mesma prop aberto=true (simulando re-render de estado)
      rerender(
        <DialogoAplicar
          aberto={true}
          onOpenChange={vi.fn()}
          contasOrigem={contas}
          caixinhas={caixinhas}
          onAplicar={vi.fn()}
        />,
      )

      expect(inputValor.value).toBe('250,00')
    })

    
    it('[A4] fecha e reabre o diálogo reseta os campos para o estado limpo', () => {
      const { rerender } = render(
        <DialogoAplicar
          aberto={true}
          onOpenChange={vi.fn()}
          contasOrigem={contas}
          caixinhas={caixinhas}
          onAplicar={vi.fn()}
        />,
      )

      const inputValor = screen.getByPlaceholderText('0,00') as HTMLInputElement
      fireEvent.change(inputValor, { target: { value: '250,00' } })
      expect(inputValor.value).toBe('250,00')

      // Fecha o diálogo
      rerender(
        <DialogoAplicar
          aberto={false}
          onOpenChange={vi.fn()}
          contasOrigem={contas}
          caixinhas={caixinhas}
          onAplicar={vi.fn()}
        />,
      )

      // Reabre o diálogo
      rerender(
        <DialogoAplicar
          aberto={true}
          onOpenChange={vi.fn()}
          contasOrigem={contas}
          caixinhas={caixinhas}
          onAplicar={vi.fn()}
        />,
      )

      const inputValorReaberto = screen.getByPlaceholderText('0,00') as HTMLInputElement
      expect(inputValorReaberto.value).toBe('')
    })

    it('[A7] exibe mensagem de erro quando onAplicar retorna { ok: false, erro }', async () => {
      const onAplicar = vi.fn().mockResolvedValue({ ok: false, erro: 'Saldo insuficiente na conta' })
      render(
        <DialogoAplicar
          aberto={true}
          onOpenChange={vi.fn()}
          contasOrigem={contas}
          caixinhas={caixinhas}
          onAplicar={onAplicar}
        />,
      )

      const inputValor = screen.getByPlaceholderText('0,00')
      fireEvent.change(inputValor, { target: { value: '500,00' } })

      const botaoConfirmar = screen.getByRole('button', { name: /confirmar aplicação/i })
      fireEvent.click(botaoConfirmar)

      expect(await screen.findByText('Saldo insuficiente na conta')).toBeDefined()
    })
  })

  describe('DialogoCriarCaixinha — Achado A8 e A7', () => {
    it('[A8] aceita data de vencimento igual a hoje ou no passado', async () => {
      const onSalvar = vi.fn().mockResolvedValue({ ok: true })
      render(
        <DialogoCriarCaixinha
          aberto={true}
          onOpenChange={vi.fn()}
          onSalvar={onSalvar}
        />,
      )

      const inputNome = screen.getByPlaceholderText(/Ex: Reserva de Emergência/i)
      fireEvent.change(inputNome, { target: { value: 'Caixinha Vencida' } })

      // Clica no botão "No vencimento" para carência
      const btnNoVencimento = screen.getByRole('button', { name: /no vencimento/i })
      fireEvent.click(btnNoVencimento)

      // Define data no passado ou hoje
      const inputData = screen.getByLabelText(/Data de Vencimento/i)
      fireEvent.change(inputData, { target: { value: '2025-01-01' } })

      const botaoCriar = screen.getByRole('button', { name: /criar caixinha/i })
      fireEvent.click(botaoCriar)

      expect(onSalvar).toHaveBeenCalledWith(
        expect.objectContaining({
          nome: 'Caixinha Vencida',
          resgateImediato: false,
          dataVencimento: '2025-01-01',
        }),
      )
    })

    it('[A7] exibe mensagem de erro quando onSalvar retorna { ok: false, erro }', async () => {
      const onSalvar = vi.fn().mockResolvedValue({ ok: false, erro: 'Nome já em uso no plano' })
      render(
        <DialogoCriarCaixinha
          aberto={true}
          onOpenChange={vi.fn()}
          onSalvar={onSalvar}
        />,
      )

      const inputNome = screen.getByPlaceholderText(/Ex: Reserva de Emergência/i)
      fireEvent.change(inputNome, { target: { value: 'Minha Caixinha' } })

      const botaoCriar = screen.getByRole('button', { name: /criar caixinha/i })
      fireEvent.click(botaoCriar)

      expect(await screen.findByText('Nome já em uso no plano')).toBeDefined()
    })
  })

  describe('DialogoAlocar — Achado A7', () => {
    it('[A7] exibe erro quando onAlocar retorna { ok: false, erro }', async () => {
      const caixinhas: CaixinhaInvestimento[] = [
        {
          id: 'cx-1',
          family_id: 'fam-1',
          account_id: 'acc-1',
          name: 'Reserva',
          rate_type: 'liquidez_diaria',
          rate_bps: 100,
          rate_defined_at: '2026-01-01',
          resgate_imediato: true,
          data_vencimento: null,
          balance_cents: 10000,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ]
      const onAlocar = vi.fn().mockResolvedValue({ ok: false, erro: 'Saldo não alocado indisponível' })

      render(
        <DialogoAlocar
          aberto={true}
          onOpenChange={vi.fn()}
          saldoNaoAlocadoCents={50000}
          caixinhas={caixinhas}
          onAlocar={onAlocar}
        />,
      )

      const inputValor = screen.getByPlaceholderText('0,00')
      fireEvent.change(inputValor, { target: { value: '100,00' } })

      const botaoConfirmar = screen.getByRole('button', { name: /confirmar alocação/i })
      fireEvent.click(botaoConfirmar)

      expect(await screen.findByText('Saldo não alocado indisponível')).toBeDefined()
    })
  })

})
