'use client'

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ValorMonetario } from '@/components/financeiro/valor-monetario'
import { CalendarClock, Target } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface KpisOrcamentoFixosProps {
  totalFixos: number
  totalVariaveis: number
  percentualFixos: number
  orcamentoTotalDefinido: number
  orcamentoTotalGasto: number
  percentualOrcamentoConsumido: number
  mesRotulo: string
}

export function KpisOrcamentoFixos({
  totalFixos,
  totalVariaveis,
  percentualFixos,
  orcamentoTotalDefinido,
  orcamentoTotalGasto,
  percentualOrcamentoConsumido,
  mesRotulo,
}: KpisOrcamentoFixosProps) {
  const totalDespesas = totalFixos + totalVariaveis
  const percentualVariaveis = totalDespesas > 0 ? 100 - percentualFixos : 0

  return (
    <div className="grid gap-[var(--esp-6)] grid-cols-1 md:grid-cols-2">
      {/* KPI 4: Fixos vs. Variáveis */}
      <Card className="flex flex-col justify-between">
        <CardHeader className="pb-[var(--esp-2)]">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold truncate">
            <CalendarClock className="size-4 text-primary" aria-hidden="true" />
            Despesas fixas vs. variáveis
          </CardTitle>
          <CardDescription className="text-xs">
            Custos recorrentes vs. pontuais em {mesRotulo}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-2">
          {totalDespesas === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              Nenhuma despesa registrada neste mês.
            </p>
          ) : (
            <div className="space-y-4">
              {/* Barra bipartida */}
              <div className="h-4 w-full rounded-full bg-muted overflow-hidden flex">
                <div
                  className="bg-[var(--chart-1)] h-full transition-all duration-500"
                  style={{ width: `${percentualFixos}%` }}
                  title={`Fixos: ${percentualFixos.toFixed(1)}%`}
                />
                <div
                  className="bg-[var(--chart-2)] h-full transition-all duration-500"
                  style={{ width: `${percentualVariaveis}%` }}
                  title={`Variáveis: ${percentualVariaveis.toFixed(1)}%`}
                />
              </div>

              {/* Legenda com valores */}
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 font-medium">
                    <span className="size-2.5 rounded-full bg-[var(--chart-1)] inline-block shrink-0" />
                    <span>Fixos ({percentualFixos.toFixed(0)}%)</span>
                  </div>
                  <div className="text-sm font-semibold pl-4">
                    <ValorMonetario valor={totalFixos} tipo="despesa" />
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 font-medium">
                    <span className="size-2.5 rounded-full bg-[var(--chart-2)] inline-block shrink-0" />
                    <span>Variáveis ({percentualVariaveis.toFixed(0)}%)</span>
                  </div>
                  <div className="text-sm font-semibold pl-4">
                    <ValorMonetario valor={totalVariaveis} tipo="despesa" />
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* KPI 5: % do Orçamento Consumido */}
      <Card className="flex flex-col justify-between">
        <CardHeader className="pb-[var(--esp-2)]">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold truncate">
            <Target className="size-4 text-primary" aria-hidden="true" />
            Consumo do orçamento
          </CardTitle>
          <CardDescription className="text-xs">
            Gasto acumulado em relação ao orçamento total em {mesRotulo}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-2">
          {orcamentoTotalDefinido === 0 ? (
            <div className="space-y-2 py-3">
              <p className="text-sm text-muted-foreground">
                Nenhum orçamento definido para este mês.
              </p>
              <Link
                href="/ajustes/categorias"
                className="text-xs text-primary underline underline-offset-4 hover:opacity-80 transition-opacity"
              >
                Definir orçamento por categoria &rarr;
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1">
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-bold tracking-tight">
                    {percentualOrcamentoConsumido.toFixed(0)}%
                  </span>
                  <span className="text-xs text-muted-foreground">
                    <ValorMonetario valor={orcamentoTotalGasto} tipo="despesa" /> de{' '}
                    <ValorMonetario valor={orcamentoTotalDefinido} />
                  </span>
                </div>
                <div className="h-4 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all duration-500',
                      percentualOrcamentoConsumido > 100
                        ? 'bg-destructive'
                        : percentualOrcamentoConsumido > 80
                          ? 'bg-[var(--pendente)]'
                          : 'bg-primary',
                    )}
                    style={{ width: `${Math.min(100, Math.max(0, percentualOrcamentoConsumido))}%` }}
                  />
                </div>
              </div>

              {percentualOrcamentoConsumido > 100 ? (
                <p className="text-xs font-medium text-destructive">
                  Orçamento excedido em {(percentualOrcamentoConsumido - 100).toFixed(0)}%!
                </p>
              ) : percentualOrcamentoConsumido > 80 ? (
                <p className="text-xs font-medium text-[var(--pendente)]">
                  Atenção: mais de 80% do orçamento consumido.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Restam{' '}
                  <ValorMonetario
                    valor={Math.max(0, orcamentoTotalDefinido - orcamentoTotalGasto)}
                  />{' '}
                  disponíveis no mês.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
