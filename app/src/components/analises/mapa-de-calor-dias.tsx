'use client'

import * as React from 'react'
import { formatBRL } from '@/lib/format'
import { useOcultarValores } from '@/components/providers/ocultar-valores-provider'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ANALISES } from '@/features/analises/copy'
import { useInView } from '@/hooks/use-in-view'
import { cn } from '@/lib/utils'

export interface TransacaoSimples {
  id?: string
  date: string
  amount: number
  type: string
  description?: string | null
  account_id?: string | null
  category_id?: string | null
  is_paid?: boolean | null
  is_benefit?: boolean | null
  is_futile?: boolean | null
  futile_label?: string | null
}

export interface ContaSimples {
  id: string
  nome: string
}

export interface MapaDeCalorDiasProps {
  anoMes: string // 'YYYY-MM'
  transacoes: TransacaoSimples[]
  contas?: ContaSimples[]
}

export function MapaDeCalorDias({ anoMes, transacoes, contas = [] }: MapaDeCalorDiasProps) {
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.1, replayOnScroll: true })
  const { oculto } = useOcultarValores()
  const [diaAberto, setDiaAberto] = React.useState<number | null>(null)

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

  const mapaContas = React.useMemo(() => {
    return new Map(contas.map((c) => [c.id, c.nome]))
  }, [contas])

  const transacoesDoDia = React.useMemo(() => {
    if (diaAberto === null) return []
    return transacoes.filter((t) => {
      if (t.type !== 'despesa') return false
      const dia = Number.parseInt(t.date.slice(8, 10), 10)
      return dia === diaAberto
    })
  }, [transacoes, diaAberto])

  return (
    <>
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
              const temGasto = gasto > 0

              const conteudoDia = (
                <>
                  <span>{dia}</span>
                  {temGasto ? (
                    <span className="hidden font-mono text-[9px] truncate sm:block">
                      {oculto ? '••••' : Math.round(gasto)}
                    </span>
                  ) : null}
                </>
              )

              const rotuloAcessibilidade = `Dia ${dia}: ${
                temGasto ? `despesa − ${formatBRL(gasto, oculto)}` : 'sem gastos'
              }`

              const classesBase = cn(
                'flex aspect-square flex-col items-center justify-center rounded-md p-1 transition-all text-[length:var(--texto-micro)] duration-400',
                classeCor,
                ehPico && inView && 'ring-1 ring-despesa/60 animate-micro-pulso',
                inView ? 'opacity-100 scale-100' : 'opacity-20 scale-90',
              )

              if (!temGasto) {
                return (
                  <div
                    key={dia}
                    className={classesBase}
                    style={{
                      transitionDelay: `${(dia - 1) * 8}ms`,
                      transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
                    }}
                    title={`Dia ${dia}: Sem gastos`}
                    role="img"
                    aria-label={rotuloAcessibilidade}
                  >
                    {conteudoDia}
                  </div>
                )
              }

              return (
                <button
                  key={dia}
                  type="button"
                  onClick={() => setDiaAberto(dia)}
                  className={cn(
                    classesBase,
                    'cursor-pointer hover:ring-2 hover:ring-primary/50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring select-none',
                  )}
                  style={{
                    transitionDelay: `${(dia - 1) * 8}ms`,
                    transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
                  }}
                  title={`Dia ${dia}: − ${formatBRL(gasto, oculto)}`}
                  aria-label={rotuloAcessibilidade}
                >
                  {conteudoDia}
                </button>
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

      {/* Modal de Detalhe das Transações do Dia */}
      <Dialog open={diaAberto !== null} onOpenChange={(aberto) => !aberto && setDiaAberto(null)}>
        <DialogContent className="max-w-md w-full sm:max-w-lg" aria-describedby="descricao-detalhe-dia">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">
              Dia {diaAberto}
            </DialogTitle>
            <DialogDescription id="descricao-detalhe-dia" className="text-sm font-medium text-muted-foreground">
              Total do dia: <span className="font-semibold text-foreground">{formatBRL(diaAberto ? gastosPorDia[diaAberto] ?? 0 : 0, oculto)}</span>
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[60vh] overflow-y-auto space-y-2.5 py-2 pr-1">
            {transacoesDoDia.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Nenhuma despesa detalhada neste dia.
              </p>
            ) : (
              transacoesDoDia.map((t, idx) => {
                const nomeConta = (t.account_id ? mapaContas.get(t.account_id) : null) || 'Conta não identificada'
                const estaPago = t.is_paid ?? false

                return (
                  <div
                    key={t.id ?? `tx-${idx}`}
                    className="flex flex-col gap-1.5 rounded-lg border border-border bg-card p-3 shadow-2xs"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium text-sm text-foreground truncate">
                        {t.description || 'Despesa sem descrição'}
                      </span>
                      <span className="font-semibold text-sm text-[var(--despesa)] shrink-0">
                        − {formatBRL(Number(t.amount), oculto)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground flex-wrap">
                      <span>{nomeConta}</span>

                      <div className="flex items-center gap-1.5 flex-wrap">
                        {estaPago ? (
                          <Badge
                            variant="outline"
                            className="border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 text-[10px] font-normal"
                          >
                            Pago
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-muted text-muted-foreground bg-muted/40 text-[10px] font-normal"
                          >
                            Pendente
                          </Badge>
                        )}

                        {t.is_benefit && (
                          <Badge
                            variant="outline"
                            className="border-blue-500/30 text-blue-600 dark:text-blue-400 bg-blue-500/10 text-[10px] font-normal"
                          >
                            Benefício
                          </Badge>
                        )}

                        {t.is_futile && (
                          <Badge
                            variant="outline"
                            className="border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/10 text-[10px] font-normal"
                          >
                            {t.futile_label || 'Supérfluo'}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" className="w-full sm:w-auto">
                Fechar
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
