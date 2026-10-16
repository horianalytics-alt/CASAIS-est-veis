'use client'

import { formatBRL } from '@/lib/format'
import { useOcultarValores } from '@/components/providers/ocultar-valores-provider'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ANALISES } from '@/features/analises/copy'
import { useInView } from '@/hooks/use-in-view'
import { cn } from '@/lib/utils'

interface TransacaoSimples {
  date: string
  amount: number
  type: string
}

interface MapaDeCalorDiasProps {
  anoMes: string // 'YYYY-MM'
  transacoes: TransacaoSimples[]
}

export function MapaDeCalorDias({ anoMes, transacoes }: MapaDeCalorDiasProps) {
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.1, replayOnScroll: true })
  const { oculto } = useOcultarValores()
  const [ano, mes] = anoMes.split('-').map(Number)
  const totalDias = new Date(ano, mes, 0).getDate()

  // Agrupa despesas por dia (1..totalDias)
  const gastosPorDia: Record<number, number> = {}
  for (let d = 1; d <= totalDias; d++) {
    gastosPorDia[d] = 0
  }

  for (const t of transacoes) {
    if (t.type === 'despesa') {
      const dia = Number.parseInt(t.date.slice(8, 10), 10)
      if (dia >= 1 && dia <= totalDias) {
        gastosPorDia[dia] = (gastosPorDia[dia] ?? 0) + Number(t.amount)
      }
    }
  }

  const valores = Object.values(gastosPorDia)
  const maxGasto = Math.max(...valores, 1)

  function getOpacidade(valor: number): string {
    if (valor <= 0) return 'bg-muted/40 text-muted-foreground'
    const proporcao = valor / maxGasto
    if (proporcao <= 0.25) return 'bg-[var(--despesa)]/20 text-foreground'
    if (proporcao <= 0.5) return 'bg-[var(--despesa)]/45 text-foreground font-medium'
    if (proporcao <= 0.75) return 'bg-[var(--despesa)]/70 text-white font-medium'
    return 'bg-[var(--despesa)] text-white font-bold'
  }

  return (
    <Card ref={ref}>
      <CardHeader>
        <CardTitle className="text-[length:var(--texto-subtitulo)] font-semibold">
          {ANALISES.calorTitulo}
        </CardTitle>
        <CardDescription>{ANALISES.calorDescricao}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-[var(--esp-4)]">
        {/* Grid de dias do mês */}
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
          {Array.from({ length: totalDias }, (_, i) => i + 1).map((dia) => {
            const gasto = gastosPorDia[dia] ?? 0
            const classeCor = getOpacidade(gasto)
            const ehPico = gasto > 0 && gasto === maxGasto

            return (
              <div
                key={dia}
                className={cn(
                  'flex aspect-square flex-col items-center justify-center rounded-md p-1 transition-all text-[length:var(--texto-micro)] duration-400',
                  classeCor,
                  ehPico && inView && 'ring-1 ring-despesa/60 animate-micro-pulso',
                  inView ? 'opacity-100 scale-100' : 'opacity-20 scale-90',
                )}
                style={{
                  transitionDelay: `${(dia - 1) * 8}ms`,
                  transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
                }}
                title={`Dia ${dia}: ${gasto > 0 ? `− ${formatBRL(gasto, oculto)}` : 'Sem gastos'}`}
                role="img"
                aria-label={`Dia ${dia}: ${gasto > 0 ? `despesa − ${formatBRL(gasto)}` : 'sem gastos'}`}
              >
                <span>{dia}</span>
                {gasto > 0 ? (
                  <span className="hidden font-mono text-[9px] truncate sm:block">
                    {oculto ? '••••' : Math.round(gasto)}
                  </span>
                ) : null}
              </div>
            )
          })}
        </div>

        {/* Escala de intensidade */}
        <div className="flex items-center justify-end gap-[var(--esp-2)] text-[length:var(--texto-micro)] text-muted-foreground">
          <span>Menos</span>
          <span className="size-3 rounded-xs bg-muted/40" aria-hidden="true" />
          <span className="size-3 rounded-xs bg-[var(--despesa)]/20" aria-hidden="true" />
          <span className="size-3 rounded-xs bg-[var(--despesa)]/50" aria-hidden="true" />
          <span className="size-3 rounded-xs bg-[var(--despesa)]" aria-hidden="true" />
          <span>Mais gastos</span>
        </div>
      </CardContent>
    </Card>
  )
}
