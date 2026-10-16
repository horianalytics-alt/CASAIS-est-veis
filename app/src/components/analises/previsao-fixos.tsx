'use client'

import * as React from 'react'
import { CalendarClock } from 'lucide-react'
import { corDaSerie, type ModoTema } from '@/styles/chart-palette'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ValorMonetario } from '@/components/financeiro/valor-monetario'
import { ANALISES } from '@/features/analises/copy'
import { useInView } from '@/hooks/use-in-view'
import { cn } from '@/lib/utils'

export interface MesPrevisao {
  mes: string
  rotulo: string
  ehMesAtual: boolean
  aPagar: number
  jaPago: number
  aReceber: number
}

interface PrevisaoFixosProps {
  meses: MesPrevisao[]
}

export function PrevisaoFixos({ meses }: PrevisaoFixosProps) {
  const { ref, inView } = useInView<HTMLDivElement>({
    threshold: 0.15,
    replayOnScroll: true,
  })
  const [modo, setModo] = React.useState<ModoTema>('claro')

  React.useEffect(() => {
    const atualizarModo = () => {
      const escuro = document.documentElement.classList.contains('dark')
      setModo(escuro ? 'escuro' : 'claro')
    }
    atualizarModo()
    const observer = new MutationObserver(atualizarModo)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })
    return () => observer.disconnect()
  }, [])

  const corAPagar = corDaSerie(1, modo) // Telha (comprometido a pagar)
  const corJaPago = corDaSerie(0, modo) // Azul (já pago no mês)
  const corAReceber = corDaSerie(2, modo) // Teal (a receber)

  const maiorSaida = Math.max(
    ...meses.map((m) => m.aPagar + m.jaPago),
    100,
  )

  return (
    <Card ref={ref}>
      <CardHeader>
        <div className="flex flex-col gap-[var(--esp-2)] sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-[length:var(--texto-subtitulo)] font-semibold">
              <CalendarClock className="size-5 text-muted-foreground" aria-hidden="true" />
              {ANALISES.previsaoTitulo}
            </CardTitle>
            <CardDescription>{ANALISES.previsaoDescricao}</CardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-[var(--esp-4)] text-[length:var(--texto-apoio)]">
            <div className="flex items-center gap-[var(--esp-2)]">
              <span
                className="size-3 rounded-xs"
                style={{ backgroundColor: corAPagar }}
                aria-hidden="true"
              />
              <span>{ANALISES.aPagar}</span>
            </div>
            <div className="flex items-center gap-[var(--esp-2)]">
              <span
                className="size-3 rounded-xs"
                style={{ backgroundColor: corJaPago }}
                aria-hidden="true"
              />
              <span>{ANALISES.jaPago}</span>
            </div>
            <div className="flex items-center gap-[var(--esp-2)]">
              <span
                className="size-3 rounded-xs"
                style={{ backgroundColor: corAReceber }}
                aria-hidden="true"
              />
              <span>{ANALISES.aReceber}</span>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div className="flex flex-col gap-[var(--esp-3)]">
          {meses.map((item, idx) => {
            const totalSaida = item.aPagar + item.jaPago
            const percAPagar = Math.min((item.aPagar / maiorSaida) * 100, 100)
            const percJaPago = Math.min((item.jaPago / maiorSaida) * 100, 100 - percAPagar)

            return (
              <div
                key={item.mes}
                className={cn(
                  'flex flex-col gap-2 rounded-xl border p-3.5 transition-all duration-500',
                  item.ehMesAtual
                    ? 'border-primary/40 bg-primary/5 ring-1 ring-primary/20'
                    : 'border-border/70 bg-card/50',
                  inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2',
                )}
                style={{
                  transitionDelay: `${idx * 40}ms`,
                  transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
                }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold capitalize text-foreground">
                      {item.rotulo}
                    </span>
                    {item.ehMesAtual && (
                      <Badge variant="default" className="text-[11px] animate-micro-pulso">
                        {ANALISES.mesAtualBadge}
                      </Badge>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    {item.aPagar > 0 ? (
                      <span className="flex items-center gap-1.5">
                        <span className="text-muted-foreground text-xs">
                          {ANALISES.aPagar}:
                        </span>
                        <ValorMonetario
                          valor={item.aPagar}
                          tipo="despesa"
                          pago={false}
                          tamanho="linha"
                        />
                      </span>
                    ) : null}

                    {item.jaPago > 0 ? (
                      <span className="flex items-center gap-1.5">
                        <span className="text-muted-foreground text-xs">
                          {ANALISES.jaPago}:
                        </span>
                        <ValorMonetario
                          valor={item.jaPago}
                          tipo="despesa"
                          pago={true}
                          tamanho="linha"
                        />
                      </span>
                    ) : null}

                    {item.aReceber > 0 ? (
                      <span className="flex items-center gap-1.5">
                        <span className="text-muted-foreground text-xs">
                          {ANALISES.aReceber}:
                        </span>
                        <ValorMonetario
                          valor={item.aReceber}
                          tipo="receita"
                          pago={false}
                          tamanho="linha"
                        />
                      </span>
                    ) : null}

                    {totalSaida === 0 && item.aReceber === 0 ? (
                      <span className="text-muted-foreground text-xs">
                        {ANALISES.semCompromissos}
                      </span>
                    ) : null}
                  </div>
                </div>

                {/* Barra horizontal proporcional das saídas (comprometido + pago) */}
                <div
                  className="bg-muted h-2.5 w-full overflow-hidden rounded-full flex"
                  role="img"
                  aria-label={`${item.rotulo}: a pagar ${item.aPagar.toFixed(2)}, já pago ${item.jaPago.toFixed(2)}`}
                >
                  {item.jaPago > 0 && (
                    <div
                      className="h-full transition-[width] duration-600"
                      style={{
                        width: `${inView ? Math.max(percJaPago, 2) : 0}%`,
                        backgroundColor: corJaPago,
                        transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
                        transitionDelay: `${idx * 40}ms`,
                      }}
                    />
                  )}
                  {item.aPagar > 0 && (
                    <div
                      className="h-full transition-[width] duration-600"
                      style={{
                        width: `${inView ? Math.max(percAPagar, 2) : 0}%`,
                        backgroundColor: corAPagar,
                        transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
                        transitionDelay: `${idx * 40 + 20}ms`,
                      }}
                    />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
