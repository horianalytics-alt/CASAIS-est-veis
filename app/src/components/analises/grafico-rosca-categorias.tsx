'use client'

import { formatBRL } from '@/lib/format'
import { SERIES_CLARO, SERIES_ESCURO, SERIE_OUTROS, MARCADORES } from '@/styles/chart-palette'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ANALISES } from '@/features/analises/copy'

export interface ItemCategoriaGasto {
  id: string
  nome: string
  valor: number
}

interface GraficoRoscaCategoriasProps {
  itens: ItemCategoriaGasto[]
}

export function GraficoRoscaCategorias({ itens }: GraficoRoscaCategoriasProps) {
  const total = itens.reduce((acc, curr) => acc + curr.valor, 0)

  if (total <= 0 || itens.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-[length:var(--texto-subtitulo)] font-semibold">
            {ANALISES.roscaTitulo}
          </CardTitle>
          <CardDescription>{ANALISES.roscaDescricao}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-[length:var(--texto-apoio)]">
            Nenhuma despesa registrada neste período.
          </p>
        </CardContent>
      </Card>
    )
  }

  // Agrupa os top 7 e joga o resto em "Outros"
  const ordenados = [...itens].sort((a, b) => b.valor - a.valor)
  const top7 = ordenados.slice(0, 7)
  const resto = ordenados.slice(7)
  const valorResto = resto.reduce((acc, curr) => acc + curr.valor, 0)

  const series = top7.map((item, idx) => ({
    nome: item.nome,
    valor: item.valor,
    percentual: (item.valor / total) * 100,
    corClaro: SERIES_CLARO[idx % SERIES_CLARO.length],
    corEscuro: SERIES_ESCURO[idx % SERIES_ESCURO.length],
    marcador: MARCADORES[idx % MARCADORES.length],
  }))

  if (valorResto > 0) {
    series.push({
      nome: ANALISES.outros,
      valor: valorResto,
      percentual: (valorResto / total) * 100,
      corClaro: SERIE_OUTROS.claro,
      corEscuro: SERIE_OUTROS.escuro,
      marcador: 'circle',
    })
  }

  // Parâmetros do SVG Donut
  const raio = 70
  const circunferencia = 2 * Math.PI * raio
  let acumulado = 0

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-[length:var(--texto-subtitulo)] font-semibold">
          {ANALISES.roscaTitulo}
        </CardTitle>
        <CardDescription>{ANALISES.roscaDescricao}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-[var(--esp-6)] sm:flex-row sm:items-center">
        {/* SVG Donut */}
        <div className="relative mx-auto flex size-48 shrink-0 items-center justify-center">
          <svg
            viewBox="0 0 200 200"
            className="size-full -rotate-90"
            role="img"
            aria-label={`Gráfico de rosca: total de despesas ${formatBRL(total)} divididas em ${series.length} categorias`}
          >
            <circle
              cx="100"
              cy="100"
              r={raio}
              fill="transparent"
              stroke="var(--border-input)"
              strokeWidth="24"
            />
            {series.map((item, idx) => {
              const dashLength = (item.percentual / 100) * circunferencia
              const dashOffset = -acumulado
              acumulado += dashLength

              return (
                <circle
                  key={idx}
                  cx="100"
                  cy="100"
                  r={raio}
                  fill="transparent"
                  stroke={item.corClaro}
                  strokeWidth="24"
                  strokeDasharray={`${dashLength} ${circunferencia}`}
                  strokeDashoffset={dashOffset}
                  className="dark:hidden transition-all duration-300"
                />
              )
            })}
            {(() => {
              let acumuladoEscuro = 0
              return series.map((item, idx) => {
                const dashLength = (item.percentual / 100) * circunferencia
                const dashOffset = -acumuladoEscuro
                acumuladoEscuro += dashLength

                return (
                  <circle
                    key={`dark-${idx}`}
                    cx="100"
                    cy="100"
                    r={raio}
                    fill="transparent"
                    stroke={item.corEscuro}
                    strokeWidth="24"
                    strokeDasharray={`${dashLength} ${circunferencia}`}
                    strokeDashoffset={dashOffset}
                    className="hidden dark:block transition-all duration-300"
                  />
                )
              })
            })()}
          </svg>

          {/* Rótulo central */}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-muted-foreground text-[length:var(--texto-micro)] uppercase">
              {ANALISES.totalGasto}
            </span>
            <span className="font-mono text-[length:var(--texto-corpo)] font-semibold num-tabular text-despesa">
              − {formatBRL(total)}
            </span>
          </div>
        </div>

        {/* Legenda acessível com marcadores de forma */}
        <div className="flex flex-1 flex-col gap-[var(--esp-2)]">
          {series.map((s, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between gap-[var(--esp-2)] text-[length:var(--texto-apoio)] leading-[var(--texto-apoio-lh)]"
            >
              <div className="flex items-center gap-[var(--esp-2)] min-w-0">
                <span
                  className="size-3 shrink-0 rounded-xs dark:hidden"
                  style={{ backgroundColor: s.corClaro }}
                  aria-hidden="true"
                />
                <span
                  className="hidden size-3 shrink-0 rounded-xs dark:block"
                  style={{ backgroundColor: s.corEscuro }}
                  aria-hidden="true"
                />
                <span className="truncate font-medium">{s.nome}</span>
              </div>
              <div className="flex items-center gap-[var(--esp-3)] shrink-0 font-mono num-tabular">
                <span className="text-muted-foreground text-[length:var(--texto-micro)]">
                  {s.percentual.toFixed(1)}%
                </span>
                <span className="font-medium text-foreground">
                  − {formatBRL(s.valor)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
