/**
 * GraficoProjecaoCaixinha: estados e modo privacidade (L-003).
 * Plano: docs/planos/dash-grafico-projecao-caixinha.md §6 e §7.3.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import * as React from 'react'

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 600, height: 220, top: 0, left: 0, right: 600, bottom: 220, x: 0, y: 0, toJSON: () => ({}),
  } as DOMRect)
})

vi.mock('@/hooks/use-in-view', () => ({
  useInView: () => ({ ref: { current: null }, inView: true }),
}))

import {
  GraficoProjecaoCaixinha,
  GraficoProjecaoCaixinhaSkeleton,
  ALTURA_GRAFICO_PROJECAO,
} from '@/components/carteira/grafico-projecao-caixinha'
import { OcultarValoresProvider } from '@/components/providers/ocultar-valores-provider'
import type { MovimentoCaixinha, RendimentoPendente } from '@/components/carteira/projecao-caixinha-logica'

const CAIXINHA = {
  id: 'cx-1',
  name: 'Reserva',
  rate_bps: 100,
  rate_defined_at: '2026-06-15',
  balance_cents: 76000,
  created_at: '2026-06-15T15:00:00Z',
}
const MOVS: MovimentoCaixinha[] = [
  { caixinhaId: 'cx-1', tipo: 'entrada', valorCentavos: 100000, ocorridoEm: '2026-06-20' },
  { caixinhaId: 'cx-1', tipo: 'rendimento', valorCentavos: 1000, ocorridoEm: '2026-07-31' },
  { caixinhaId: 'cx-1', tipo: 'saida', valorCentavos: 30000, ocorridoEm: '2026-09-10' },
  { caixinhaId: 'cx-1', tipo: 'entrada', valorCentavos: 5000, ocorridoEm: '2026-10-26' },
]
const PEND: RendimentoPendente[] = [
  { caixinhaId: 'cx-1', competencia: '2026-08-01', valorCentavos: 1010 },
  { caixinhaId: 'cx-1', competencia: '2026-09-01', valorCentavos: 710 },
]

function renderizar(props: Partial<React.ComponentProps<typeof GraficoProjecaoCaixinha>> = {}) {
  return render(
    <OcultarValoresProvider>
      <GraficoProjecaoCaixinha
        caixinha={CAIXINHA}
        movimentos={MOVS}
        pendentes={PEND}
        mesAtual="2026-10"
        atualizadoEm="26/10/2026 12:00"
        {...props}
      />
    </OcultarValoresProvider>,
  )
}

beforeEach(() => localStorage.clear())
afterEach(() => cleanup())

describe('GraficoProjecaoCaixinha — estados', () => {
  it('ok: chave de traço, linha sólida + tracejada, losangos dos pendentes, aviso com total', () => {
    const { container } = renderizar()
    const legenda = screen.getByRole('list', { name: 'Legenda do gráfico' })
    expect(Array.from(legenda.querySelectorAll('li')).map((li) => li.textContent)).toEqual([
      'Saldo confirmado',
      'Simulação',
      'Rendimento a confirmar',
    ])
    const linhas = Array.from(container.querySelectorAll('svg[aria-hidden="true"] path[fill="none"]'))
    expect(linhas.map((l) => l.getAttribute('stroke-dasharray'))).toEqual(['1', '4 6'])
    expect(container.querySelectorAll('[data-marcador="pendente"]')).toHaveLength(2)
    expect(container.textContent).toContain('2 meses com rendimento estimado a confirmar (R$')
    expect(container.textContent).toMatch(/17,20/) // 1010 + 710 = R$ 17,20
    expect(container.textContent).toContain('Atualizado em 26/10/2026 12:00')
  })

  it('o rótulo direto do fim é o valor simulado com "≈"', () => {
    const { container } = renderizar()
    // 76000 * 1,01^12 = 85638,70 centavos -> 85639 (BigInt, meio para cima) -> R$ 856,39
    expect(container.textContent).toMatch(/≈\s?R\$\s?856,39/)
  })

  it('vazio: mensagem útil, sem eixo nem NaN', () => {
    const { container } = renderizar({ caixinha: { ...CAIXINHA, balance_cents: 0 }, movimentos: [], pendentes: [] })
    expect(screen.getByText('Esta caixinha ainda está vazia')).toBeInTheDocument()
    expect(container.querySelector('svg path')).toBeNull()
    expect(container.textContent).not.toMatch(/NaN|Infinity/)
  })

  it('erro da leitura: mensagem + tentar de novo', () => {
    const tentar = vi.fn()
    renderizar({ erro: true, aoTentarNovamente: tentar })
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível montar o gráfico desta caixinha')
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(tentar).toHaveBeenCalledOnce()
  })

  it('divergente (soma ≠ saldo) mostra erro, nunca número', () => {
    const { container } = renderizar({ caixinha: { ...CAIXINHA, balance_cents: 76001 } })
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/R\$\s?\d/)
  })

  it('saldo zero com histórico: histórico sem simulação + aviso', () => {
    const { container } = renderizar({
      caixinha: { ...CAIXINHA, balance_cents: 0 },
      movimentos: [
        { caixinhaId: 'cx-1', tipo: 'entrada', valorCentavos: 1000, ocorridoEm: '2026-07-01' },
        { caixinhaId: 'cx-1', tipo: 'saida', valorCentavos: 1000, ocorridoEm: '2026-09-01' },
      ],
      pendentes: [],
    })
    expect(container.textContent).toContain('Sem saldo nesta caixinha agora')
    const linhas = Array.from(container.querySelectorAll('svg[aria-hidden="true"] path[fill="none"]'))
    expect(linhas.map((l) => l.getAttribute('stroke-dasharray'))).toEqual(['1'])
    // sem simulação, a chave não promete uma linha tracejada que não existe
    const legenda = screen.getByRole('list', { name: 'Legenda do gráfico' })
    expect(Array.from(legenda.querySelectorAll('li')).map((li) => li.textContent)).toEqual(['Saldo confirmado'])
  })

  it('um único mês e sem simulação (zerada neste mês): sem gráfico, mas o saldo aparece em texto', () => {
    const { container } = renderizar({
      caixinha: { ...CAIXINHA, balance_cents: 0, created_at: '2026-10-05T15:00:00Z' },
      movimentos: [
        { caixinhaId: 'cx-1', tipo: 'entrada', valorCentavos: 1000, ocorridoEm: '2026-10-06' },
        { caixinhaId: 'cx-1', tipo: 'saida', valorCentavos: 1000, ocorridoEm: '2026-10-07' },
      ],
      pendentes: [],
    })
    expect(container.querySelector('svg path[fill="none"]')).toBeNull()
    const legenda = screen.getByRole('list', { name: 'Legenda do gráfico' })
    expect(Array.from(legenda.querySelectorAll('li')).map((li) => li.textContent)).toEqual(['Saldo confirmado'])
    expect(container.textContent).toMatch(/Saldo de hoje:\s*R\$\s?0,00/)
    expect(container.textContent).not.toMatch(/NaN|Infinity/)
  })

  it('mesesProjecao muda o texto junto com o gráfico (rótulo acessível e definição)', () => {
    const { container } = renderizar({ mesesProjecao: 6 })
    expect(container.querySelector('[aria-label*="6 meses"]')).not.toBeNull()
    expect(container.textContent).toContain('por 6 meses')
    expect(container.textContent).not.toMatch(/12 meses/)
    cleanup()
    const { container: c12 } = renderizar()
    expect(c12.textContent).toContain('por 12 meses')
  })

  it('skeleton tem a mesma altura mínima do conteúdo', () => {
    const { container } = render(<GraficoProjecaoCaixinhaSkeleton />)
    expect((container.firstChild as HTMLElement).style.height).toBe(`${ALTURA_GRAFICO_PROJECAO}px`)
    cleanup()
    const ok = renderizar()
    expect((ok.container.firstChild as HTMLElement).style.minHeight).toBe(`${ALTURA_GRAFICO_PROJECAO}px`)
  })
})

describe('GraficoProjecaoCaixinha — modo privacidade (L-003)', () => {
  beforeEach(() => localStorage.setItem('fad.ocultarValores', '1'))

  it('nenhum valor em claro: eixo, rótulo, tabela e aviso mascarados', () => {
    const { container } = renderizar()
    expect(container.textContent).not.toMatch(/R\$\s?\d/)
    expect(container.textContent).toContain('2 meses com rendimento estimado a confirmar.')
  })

  it('sem área e sem zero no domínio (proporção não vaza)', () => {
    const { container } = renderizar()
    expect(container.querySelector('path[fill-opacity]')).toBeNull()
  })

  it('sem cor semântica de ganho/perda', () => {
    const { container } = renderizar()
    expect(container.innerHTML).not.toMatch(/text-receita|text-despesa/)
  })
})
