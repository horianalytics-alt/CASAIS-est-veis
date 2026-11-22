import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { luminanciaRelativa, CHAVE_COR_CUSTOM, CHAVE_PALETA } from '@/styles/tema'
import { SeletorTema } from '@/components/ajustes/seletor-tema'
import { MapaDeCalorDias } from '@/components/analises/mapa-de-calor-dias'
import * as OcultarProvider from '@/components/providers/ocultar-valores-provider'

describe('Rodada 15 — F-1: Color Picker Livre & Tema', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-paleta')
    document.documentElement.style.removeProperty('--primary')
    document.documentElement.style.removeProperty('--primary-foreground')
    document.documentElement.style.removeProperty('--ring')
    document.documentElement.style.removeProperty('--accent')

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })
  })

  afterEach(() => {
    cleanup()
  })

  describe('luminanciaRelativa (WCAG)', () => {
    it('calcula 0 para preto e 1 para branco', () => {
      expect(luminanciaRelativa('#000000')).toBeCloseTo(0, 3)
      expect(luminanciaRelativa('#FFFFFF')).toBeCloseTo(1, 3)
    })

    it('suporta formato 3 dígitos (#000 e #FFF)', () => {
      expect(luminanciaRelativa('#000')).toBeCloseTo(0, 3)
      expect(luminanciaRelativa('#FFF')).toBeCloseTo(1, 3)
    })

    it('diferencia tons escuros (luminância < 0.179) e tons claros (>= 0.179)', () => {
      // Cedro claro (#5FD3B2) tem alta luminância -> foreground escuro
      expect(luminanciaRelativa('#5FD3B2')).toBeGreaterThan(0.179)
      // Cedro escuro (#14594A) tem baixa luminância -> foreground branco
      expect(luminanciaRelativa('#14594A')).toBeLessThan(0.179)
      // Azul vivo (#2563EB) tem baixa luminância -> foreground branco
      expect(luminanciaRelativa('#2563EB')).toBeLessThan(0.179)
    })
  })

  describe('SeletorTema', () => {
    it('renderiza as 4 paletas fixas e a opção Personalizada', () => {
      render(<SeletorTema />)
      expect(screen.getByText('Cedro')).toBeInTheDocument()
      expect(screen.getByText('Ardósia')).toBeInTheDocument()
      expect(screen.getByText('Terra')).toBeInTheDocument()
      expect(screen.getByText('Ameixa')).toBeInTheDocument()
      expect(screen.getByText('Personalizada')).toBeInTheDocument()
    })

    it('ao clicar em Personalizada, abre o picker inline', () => {
      render(<SeletorTema />)
      const botaoPersonalizada = screen.getByRole('button', { name: /personalizada/i })
      expect(screen.queryByLabelText(/código hexadecimal da cor/i)).not.toBeInTheDocument()

      fireEvent.click(botaoPersonalizada)
      expect(screen.getByLabelText(/código hexadecimal da cor/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /usar esta cor/i })).toBeInTheDocument()
    })

    it('aplica cor customizada via documentElement e salva no localStorage', () => {
      render(<SeletorTema />)
      const botaoPersonalizada = screen.getByRole('button', { name: /personalizada/i })
      fireEvent.click(botaoPersonalizada)

      const inputHex = screen.getByLabelText(/código hexadecimal da cor/i)
      fireEvent.change(inputHex, { target: { value: '#2563EB' } })

      const botaoUsar = screen.getByRole('button', { name: /usar esta cor/i })
      fireEvent.click(botaoUsar)

      expect(localStorage.getItem(CHAVE_COR_CUSTOM)).toBe('#2563EB')
      expect(localStorage.getItem(CHAVE_PALETA)).toBeNull()
      expect(document.documentElement.style.getPropertyValue('--primary')).toBe('#2563EB')
      expect(document.documentElement.style.getPropertyValue('--primary-foreground')).toBe('#FFFFFF')
      expect(document.documentElement.dataset.paleta).toBeUndefined()
    })

    it('ao selecionar paleta fixa, limpa a cor customizada e remove propriedades inline', () => {
      localStorage.setItem(CHAVE_COR_CUSTOM, '#2563EB')
      render(<SeletorTema />)

      const botaoArdosia = screen.getByText('Ardósia').closest('button')!
      fireEvent.click(botaoArdosia)

      expect(localStorage.getItem(CHAVE_COR_CUSTOM)).toBeNull()
      expect(localStorage.getItem(CHAVE_PALETA)).toBe('ardosia')
      expect(document.documentElement.style.getPropertyValue('--primary')).toBe('')
      expect(document.documentElement.dataset.paleta).toBe('ardosia')
    })

    it('ao clicar em Redefinir no picker, volta para a paleta Cedro', () => {
      render(<SeletorTema />)
      const botaoPersonalizada = screen.getByRole('button', { name: /personalizada/i })
      fireEvent.click(botaoPersonalizada)

      const botaoRedefinir = screen.getByRole('button', { name: /redefinir/i })
      fireEvent.click(botaoRedefinir)

      expect(localStorage.getItem(CHAVE_COR_CUSTOM)).toBeNull()
      expect(localStorage.getItem(CHAVE_PALETA)).toBe('cedro')
      expect(document.documentElement.dataset.paleta).toBeUndefined()
    })
  })
})

describe('Rodada 15 — F-2: Heatmap de Dias Clicável', () => {
  const transacoesExemplo = [
    {
      id: 'tx-1',
      date: '2026-11-05',
      amount: 120.5,
      type: 'despesa',
      description: 'Supermercado Central',
      account_id: 'acc-1',
      is_paid: true,
      is_benefit: false,
      is_futile: false,
    },
    {
      id: 'tx-2',
      date: '2026-11-05',
      amount: 35.0,
      type: 'despesa',
      description: 'Cafeteria Especial',
      account_id: 'acc-1',
      is_paid: false,
      is_benefit: true,
      is_futile: true,
      futile_label: 'Café gourmet',
    },
    {
      id: 'tx-3',
      date: '2026-11-10',
      amount: 800.0,
      type: 'receita', // Receitas não entram na soma de gastos nem no modal
      description: 'Salário Freelance',
      account_id: 'acc-2',
      is_paid: true,
    },
  ]

  const contasExemplo = [
    { id: 'acc-1', nome: 'Nubank Corrente' },
    { id: 'acc-2', nome: 'Itaú Salário' },
  ]

  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('dias sem gasto são renderizados como div e dias com gasto como button', () => {
    render(<MapaDeCalorDias anoMes="2026-11" transacoes={transacoesExemplo} contas={contasExemplo} />)

    // Dia 5 tem gasto -> deve ser botão
    const dia5 = screen.getByRole('button', { name: /Dia 5: despesa/i })
    expect(dia5).toBeInTheDocument()

    // Dia 1 não tem gasto -> não deve ser botão
    const dia1 = screen.getByLabelText(/Dia 1: sem gastos/i)
    expect(dia1.tagName).toBe('DIV')
  })

  it('ao clicar num dia com gasto, abre o modal de detalhe com a lista de transações', () => {
    render(<MapaDeCalorDias anoMes="2026-11" transacoes={transacoesExemplo} contas={contasExemplo} />)

    const dia5 = screen.getByRole('button', { name: /Dia 5: despesa/i })
    fireEvent.click(dia5)

    // Modal deve estar visível
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Dia 5' })).toBeInTheDocument()

    // Mostra as duas transações do dia 5
    expect(screen.getByText('Supermercado Central')).toBeInTheDocument()
    expect(screen.getByText('Cafeteria Especial')).toBeInTheDocument()
    expect(screen.getAllByText('Nubank Corrente')).toHaveLength(2)

    // Mostra badges de status e tags
    expect(screen.getByText('Pago')).toBeInTheDocument()
    expect(screen.getByText('Pendente')).toBeInTheDocument()
    expect(screen.getByText('Benefício')).toBeInTheDocument()
    expect(screen.getByText('Café gourmet')).toBeInTheDocument()

    // Receita de outro dia não aparece
    expect(screen.queryByText('Salário Freelance')).not.toBeInTheDocument()
  })

  it('respeita o modo privacidade ao exibir valores no modal', () => {
    vi.spyOn(OcultarProvider, 'useOcultarValores').mockReturnValue({
      oculto: true,
      alternar: vi.fn(),
    })

    render(<MapaDeCalorDias anoMes="2026-11" transacoes={transacoesExemplo} contas={contasExemplo} />)
    const dia5 = screen.getByRole('button', { name: /Dia 5/i })
    fireEvent.click(dia5)

    // Valores devem estar mascarados
    expect(screen.getAllByText(/R\$\s*••••/).length).toBeGreaterThan(0)
    expect(screen.queryByText('120,50')).not.toBeInTheDocument()

    vi.restoreAllMocks()
  })
})
