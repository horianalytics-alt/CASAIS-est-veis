'use client'

import { formatBRL } from '@/lib/format'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ANALISES } from '@/features/analises/copy'
import { useInView } from '@/hooks/use-in-view'

export interface DadoMesResumo {
  mes: string
  receitas: number
  despesas: number
}

interface GraficoBarrasMensaisProps {
  historico: DadoMesResumo[]
}

const MESES_ABREV: Record<string, string> = {
  '01': 'Jan',
  '02': 'Fev',
  '03': 'Mar',
  '04': 'Abr',
  '05': 'Mai',
  '06': 'Jun',
  '07': 'Jul',
  '08': 'Ago',
  '09': 'Set',
  '10': 'Out',
  '11': 'Nov',
  '12': 'Dez',
}

export function GraficoBarrasMensais({ historico }: GraficoBarrasMensaisProps) {
  const { ref, inView } = useInView<HTMLDivElement>({
    threshold: 0.15,
    replayOnScroll: true,
  })

  if (historico.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-[length:var(--texto-subtitulo)] font-semibold">
            {ANALISES.barrasTitulo}
          </CardTitle>
          <CardDescription>{ANALISES.barrasDescricao}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-[length:var(--texto-apoio)]">
            Sem histórico suficiente para exibir evolução.
          </p>
        </CardContent>
      </Card>
    )
  }

  // Pega os últimos 6 meses em ordem cronológica
  const dados = [...historico].slice(-6)
  const maxValor = Math.max(
    ...dados.flatMap((d) => [d.receitas, d.despesas]),
    100,
  )

  const alturaGrafico = 140

  return (
    <Card ref={ref}>
      <CardHeader>
        <div className="flex flex-col gap-[var(--esp-2)] sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-[length:var(--texto-subtitulo)] font-semibold">
              {ANALISES.barrasTitulo}
            </CardTitle>
            <CardDescription>{ANALISES.barrasDescricao}</CardDescription>
          </div>
          {/* Legenda semântica */}
          <div className="flex items-center gap-[var(--esp-4)] text-[length:var(--texto-apoio)]">
            <div className="flex items-center gap-[var(--esp-2)]">
              <span className="size-3 rounded-xs bg-[var(--receita)]" aria-hidden="true" />
              <span>{ANALISES.receita}</span>
            </div>
            <div className="flex items-center gap-[var(--esp-2)]">
              <span className="size-3 rounded-xs bg-[var(--despesa)]" aria-hidden="true" />
              <span>{ANALISES.despesa}</span>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-end justify-between gap-[var(--esp-2)] pt-[var(--esp-4)]">
          {dados.map((d, idx) => {
            const numMes = d.mes.slice(5, 7)
            const rotulo = `${MESES_ABREV[numMes] ?? numMes}/${d.mes.slice(2, 4)}`

            const alturaReceita = Math.round((d.receitas / maxValor) * alturaGrafico)
            const alturaDespesa = Math.round((d.despesas / maxValor) * alturaGrafico)

            return (
              <div
                key={d.mes}
                className="flex flex-1 flex-col items-center gap-[var(--esp-2)] min-w-0"
              >
                {/* Par de barras */}
                <div
                  className="relative flex w-full max-w-[48px] items-end justify-center gap-1"
                  style={{ height: `${alturaGrafico}px` }}
                >
                  {/* Barra de Receita */}
                  <div
                    className="w-1/2 rounded-t-sm bg-[var(--receita)] transition-[height] duration-600 hover:opacity-85"
                    style={{
                      height: `${inView ? Math.max(alturaReceita, 4) : 0}px`,
                      transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
                      transitionDelay: `${idx * 45}ms`,
                    }}
                    title={`Receitas: + ${formatBRL(d.receitas)}`}
                    role="img"
                    aria-label={`${rotulo}: receita + ${formatBRL(d.receitas)}`}
                  />
                  {/* Barra de Despesa */}
                  <div
                    className="w-1/2 rounded-t-sm bg-[var(--despesa)] transition-[height] duration-600 hover:opacity-85"
                    style={{
                      height: `${inView ? Math.max(alturaDespesa, 4) : 0}px`,
                      transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
                      transitionDelay: `${idx * 45 + 20}ms`,
                    }}
                    title={`Despesas: − ${formatBRL(d.despesas)}`}
                    role="img"
                    aria-label={`${rotulo}: despesa − ${formatBRL(d.despesas)}`}
                  />
                </div>

                {/* Eixo X: Mês */}
                <span className="text-muted-foreground font-mono text-[length:var(--texto-micro)] uppercase truncate">
                  {rotulo}
                </span>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
