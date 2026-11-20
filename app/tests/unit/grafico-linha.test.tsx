/**
 * GraficoLinha (src/components/analises/grafico-linha.tsx).
 * Plano: docs/planos/dash-grafico-projecao-caixinha.md §4.4 e §7.2.
 *
 * O bloco "regressão" foi escrito e o snapshot CAPTURADO contra o código ANTES
 * da edição aditiva (trecho projetado, marcador, nota, marco de hoje). Sem as
 * props novas, o SVG tem de continuar idêntico: é o que garante que patrimônio
 * e simulador não mudaram.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import * as React from 'react'

const LARGURA = 600

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: LARGURA, height: 220, top: 0, left: 0, right: LARGURA, bottom: 220, x: 0, y: 0, toJSON: () => ({}),
  } as DOMRect)
})

vi.mock('@/hooks/use-in-view', () => ({
  useInView: () => ({ ref: { current: null }, inView: true }),
}))

import { GraficoLinha, type PontoLinha } from '@/components/analises/grafico-linha'

afterEach(() => cleanup())

const PATRIMONIO: PontoLinha[] = [
  { chave: '2026-07', rotuloEixo: 'jul/26', rotuloLongo: 'julho de 2026', valor: 1200.5 },
  { chave: '2026-08', rotuloEixo: 'ago/26', rotuloLongo: 'agosto de 2026', valor: -300 },
  { chave: '2026-09', rotuloEixo: 'set/26', rotuloLongo: 'setembro de 2026', valor: 2500 },
  { chave: '2026-10', rotuloEixo: 'out/26', rotuloLongo: 'outubro de 2026', valor: 2750.25, parcial: true },
]

const SIMULADOR: PontoLinha[] = [0, 1, 2, 3, 4, 5].map((m) => ({
  chave: String(m),
  rotuloEixo: `mês ${m}`,
  rotuloLongo: `mês ${m}`,
  valor: 100 * Math.pow(1.01, m),
}))

function renderizar(props: Partial<React.ComponentProps<typeof GraficoLinha>> & { pontos: PontoLinha[] }) {
  return render(
    <GraficoLinha
      rotuloAcessivel="Gráfico de teste"
      formatarValor={(v) => `R$ ${v.toFixed(2)}`}
      oculto={false}
      tabela={{ cabecalhos: ['Mês', 'Valor'], linhas: props.pontos.map((p) => [p.rotuloLongo, String(p.valor)]) }}
      {...props}
    />,
  )
}

function svgDe(container: HTMLElement): string {
  const svg = container.querySelector('svg')
  if (!svg) throw new Error('sem svg')
  return svg.outerHTML
}

describe('GraficoLinha — regressão (sem props novas, saída igual à de antes da edição)', () => {
  it('patrimônio: zero cruzando, mês parcial no fim', () => {
    const { container } = renderizar({ pontos: PATRIMONIO })
    expect(svgDe(container)).toMatchSnapshot()
  })

  it('patrimônio no modo oculto', () => {
    const { container } = renderizar({ pontos: PATRIMONIO, oculto: true })
    expect(svgDe(container)).toMatchSnapshot()
  })

  it('simulador: incluirZero com área', () => {
    const { container } = renderizar({ pontos: SIMULADOR, incluirZero: true })
    expect(svgDe(container)).toMatchSnapshot()
  })

  it('formatarValor recebe o ponto como 2º argumento sem mudar a saída', () => {
    const formatar = vi.fn((v: number) => `R$ ${v.toFixed(2)}`)
    renderizar({ pontos: PATRIMONIO, formatarValor: formatar })
    expect(formatar).toHaveBeenCalledWith(2750.25, PATRIMONIO[3])
  })

  it('tooltip e leitura acessível no ponto ativo (teclado)', () => {
    const { container } = renderizar({ pontos: PATRIMONIO })
    const grupo = container.querySelector('[aria-roledescription="gráfico"]') as HTMLElement
    fireEvent.focus(grupo)
    fireEvent.keyDown(grupo, { key: 'ArrowLeft' })
    // useId usa contador global do React: normaliza para o snapshot não depender da ordem dos testes.
    const html = container.innerHTML.replace(/(id|aria-describedby)="[^"]*"/g, '$1="ID"')
    expect(html).toMatchSnapshot()
  })
})

// Histórico real (3 pontos) + simulação (3 pontos): junção no índice 2.
const COM_PROJECAO: PontoLinha[] = [
  { chave: '2026-08', rotuloEixo: 'ago/26', rotuloLongo: 'agosto de 2026', valor: 1000 },
  { chave: '2026-09', rotuloEixo: 'set/26', rotuloLongo: 'setembro de 2026', valor: 1000, marcador: 'pendente', nota: 'Rendimento a confirmar' },
  { chave: '2026-10', rotuloEixo: 'out/26', rotuloLongo: 'outubro de 2026', valor: 1500 },
  { chave: '2026-11', rotuloEixo: 'nov/26', rotuloLongo: 'novembro de 2026', valor: 1515, projetado: true, nota: 'Simulação' },
  { chave: '2026-12', rotuloEixo: 'dez/26', rotuloLongo: 'dezembro de 2026', valor: 1530.15, projetado: true },
  { chave: '2027-01', rotuloEixo: 'jan/27', rotuloLongo: 'janeiro de 2027', valor: 1545.45, projetado: true },
]

function linhasDe(container: HTMLElement) {
  // Linhas = path sem preenchimento. O sólido já usava stroke-dasharray=1 (animação de desenho).
  return Array.from(container.querySelectorAll('path[fill="none"]'))
}

describe('GraficoLinha — trecho projetado (props aditivas)', () => {
  it('desenha o histórico sólido e a simulação tracejada, unidos no último ponto real', () => {
    const { container } = renderizar({ pontos: COM_PROJECAO, incluirZero: true })
    const [real, simulado] = linhasDe(container)
    expect(real.getAttribute('stroke-dasharray')).toBe('1')
    expect(simulado.getAttribute('stroke-dasharray')).toBe('4 6')
    // O tracejado começa exatamente no fim do sólido.
    const fimReal = real.getAttribute('d')!.split(' ').at(-1)!.replace(/^L/, '')
    const inicioSimulado = simulado.getAttribute('d')!.split(' ')[0].replace(/^M/, '')
    expect(inicioSimulado).toBe(fimReal)
  })

  it('a área cobre só o trecho real', () => {
    const { container } = renderizar({ pontos: COM_PROJECAO, incluirZero: true })
    const area = container.querySelector('path[fill-opacity]')!
    const xs = area.getAttribute('d')!.match(/[ML]([\d.]+),/g)!.map((s) => Number(s.slice(1, -1)))
    const xJuncao = Number(linhasDe(container)[0].getAttribute('d')!.split(' ').at(-1)!.replace(/^L/, '').split(',')[0])
    expect(Math.max(...xs)).toBe(xJuncao)
  })

  it('mostrarArea=false remove a área mesmo com incluirZero', () => {
    const { container } = renderizar({ pontos: COM_PROJECAO, incluirZero: true, mostrarArea: false })
    expect(container.querySelector('path[fill-opacity]')).toBeNull()
  })

  it('ponto final projetado é vazado; marcador de pendente é losango permanente', () => {
    const { container } = renderizar({ pontos: COM_PROJECAO })
    const final = container.querySelector('g[style*="750ms"] circle')!
    expect(final.getAttribute('fill')).toBe('var(--card)')
    const losangos = container.querySelectorAll('[data-marcador="pendente"]')
    expect(losangos).toHaveLength(1)
  })

  it('marco de hoje: hairline sólida com rótulo', () => {
    const { container } = renderizar({ pontos: COM_PROJECAO, marcoHoje: { indice: 2, rotulo: 'hoje' } })
    const marco = container.querySelector('[data-marco="hoje"]')!
    expect(marco.querySelector('line')!.getAttribute('stroke-dasharray')).toBeNull()
    expect(marco.textContent).toBe('hoje')
  })

  it('tooltip mostra a nota do ponto e a chave tracejada no ponto projetado', () => {
    const { container } = renderizar({ pontos: COM_PROJECAO })
    const grupo = container.querySelector('[aria-roledescription="gráfico"]') as HTMLElement
    fireEvent.focus(grupo)
    fireEvent.keyDown(grupo, { key: 'Home' })
    fireEvent.keyDown(grupo, { key: 'ArrowRight' }) // setembro: pendente
    expect(container.textContent).toContain('Rendimento a confirmar')
    fireEvent.keyDown(grupo, { key: 'ArrowRight' })
    fireEvent.keyDown(grupo, { key: 'ArrowRight' }) // novembro: simulação
    expect(container.querySelector('[data-chave-tooltip="projetado"]')).not.toBeNull()
    expect(container.querySelector('[aria-live="polite"]')!.textContent).toContain('Simulação')
  })

  it('um único ponto real antes da simulação: o saldo de hoje tem marca cheia (o sólido não tem segmento)', () => {
    const pontos: PontoLinha[] = [
      { chave: '2026-10', rotuloEixo: 'out/26', rotuloLongo: 'outubro de 2026', valor: 500 },
      { chave: '2026-11', rotuloEixo: 'nov/26', rotuloLongo: 'novembro de 2026', valor: 505, projetado: true },
      { chave: '2026-12', rotuloEixo: 'dez/26', rotuloLongo: 'dezembro de 2026', valor: 510, projetado: true },
    ]
    const { container } = renderizar({ pontos })
    const marca = container.querySelector('circle[data-ponto-real="juncao"]')
    expect(marca).not.toBeNull()
    expect(marca!.getAttribute('fill')).toBe('var(--chart-1)')
    expect(Number(marca!.getAttribute('cx'))).toBeLessThan(100) // o primeiro ponto, à esquerda
  })

  it('a junção real -> simulação tem marca cheia no último ponto real; sem simulação, nenhuma', () => {
    const { container } = renderizar({ pontos: COM_PROJECAO })
    const marca = container.querySelector('circle[data-ponto-real="juncao"]')!
    const fimReal = linhasDe(container)[0].getAttribute('d')!.split(' ').at(-1)!.replace(/^L/, '').split(',')
    expect(marca.getAttribute('cx')).toBe(fimReal[0])
    cleanup()
    const { container: c2 } = renderizar({ pontos: PATRIMONIO })
    expect(c2.querySelector('circle[data-ponto-real="juncao"]')).toBeNull()
  })

  it('projetados fora do fim (não contíguos) caem para tudo sólido', () => {
    const quebrado = COM_PROJECAO.map((p, i) => (i === 1 ? { ...p, projetado: true } : p))
    const { container } = renderizar({ pontos: quebrado })
    expect(linhasDe(container).map((p) => p.getAttribute('stroke-dasharray'))).toEqual(['1'])
  })
})
