'use client'

import { formatBRL } from '@/lib/format'
import { useOcultarValores } from '@/components/providers/ocultar-valores-provider'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ANALISES } from '@/features/analises/copy'
import { useInView } from '@/hooks/use-in-view'
import { cn } from '@/lib/utils'
import type { ItemCategoriaGasto } from './grafico-rosca-categorias'

interface GraficoParetoProps {
  itens: ItemCategoriaGasto[]
}

export function GraficoPareto({ itens }: GraficoParetoProps) {
  const { oculto } = useOcultarValores()
  const { ref, inView } = useInView<HTMLDivElement>({
    threshold: 0.15,
    replayOnScroll: true,
  })
  const total = itens.reduce((acc, curr) => acc + curr.valor, 0)

  if (total <= 0 || itens.length === 0) {
    return null
  }

  const ordenados = [...itens].sort((a, b) => b.valor - a.valor)

  let acumulado = 0
  const categoriasComAcumulado = ordenados.map((item) => {
    acumulado += item.valor
    const percentualAcumulado = (acumulado / total) * 100
    const percentualIndividual = (item.valor / total) * 100
    const pertenceAos80 = percentualAcumulado <= 80 || (acumulado - item.valor < total * 0.8)

    return {
      ...item,
      percentualIndividual,
      percentualAcumulado,
      pertenceAos80,
    }
  })

  const topCategorias80 = categoriasComAcumulado.filter((c) => c.pertenceAos80)

  return (
    <Card ref={ref}>
      <CardHeader>
        <div className="flex flex-col gap-[var(--esp-2)]">
          <div>
            <CardTitle className="text-[length:var(--texto-subtitulo)] font-semibold">
              {ANALISES.paretoTitulo}
            </CardTitle>
            <CardDescription>{ANALISES.paretoDescricao}</CardDescription>
          </div>
          <Badge variant="secondary" className="w-fit">
            {topCategorias80.length} de {ordenados.length} categorias compõem 80% do gasto
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-[var(--esp-4)]">
        <p className="text-muted-foreground text-[length:var(--texto-apoio)] leading-[var(--texto-apoio-lh)]">
          O princípio de Pareto indica que focar a atenção nas categorias abaixo gera o maior
          impacto na saúde financeira do casal:
        </p>

        <div className="flex flex-col gap-[var(--esp-3)]">
          {categoriasComAcumulado.slice(0, 6).map((cat, idx) => (
            <div
              key={cat.id}
              className={cn(
                'flex flex-col gap-[var(--esp-1)] transition-all duration-500',
                inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1',
              )}
              style={{
                transitionDelay: `${idx * 40}ms`,
                transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            >
              <div className="flex items-center justify-between text-[length:var(--texto-apoio)]">
                <span className="flex items-center gap-[var(--esp-2)] font-medium">
                  {cat.nome}
                  {cat.pertenceAos80 ? (
                    <span className="size-1.5 rounded-full bg-[var(--despesa)] animate-micro-pulso" aria-hidden="true" />
                  ) : null}
                </span>
                <span className="font-mono num-tabular">
                  − {formatBRL(cat.valor, oculto)}{' '}
                  <span className="text-muted-foreground text-[length:var(--texto-micro)]">
                    ({cat.percentualIndividual.toFixed(1)}%)
                  </span>
                </span>
              </div>
              {/* Barra de progresso com animação ritmada */}
              <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
                <div
                  className="h-full bg-[var(--despesa)] transition-[width] duration-600"
                  style={{
                    width: inView ? `${cat.percentualIndividual}%` : '0%',
                    opacity: cat.pertenceAos80 ? 1 : 0.4,
                    transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
                    transitionDelay: `${idx * 45}ms`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
