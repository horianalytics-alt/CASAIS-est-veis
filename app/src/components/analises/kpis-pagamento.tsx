'use client'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ValorMonetario } from '@/components/financeiro/valor-monetario'
import { DollarSign, CreditCard, Users } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface KpisPagamentoProps {
  ticketMedio: number
  itensFormaPagamento: Array<{ nome: string; valor: number }>
  itensPorMembro: Array<{ nome: string; valor: number }>
  totalDespesasPagas: number
  mesRotulo: string
}

export function KpisPagamento({
  ticketMedio,
  itensFormaPagamento,
  itensPorMembro,
  totalDespesasPagas,
  mesRotulo,
}: KpisPagamentoProps) {
  const maxForma = itensFormaPagamento[0]?.valor || 1
  const maxMembro = itensPorMembro[0]?.valor || 1

  return (
    <div className="grid gap-[var(--esp-6)] grid-cols-1 lg:grid-cols-3">
      {/* KPI 1: Ticket Médio */}
      <Card className="flex flex-col justify-between">
        <CardHeader className="pb-[var(--esp-2)]">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold truncate">
            <DollarSign className="size-4 text-primary" aria-hidden="true" />
            Ticket médio
          </CardTitle>
          <CardDescription className="text-xs">
            Gasto médio por despesa paga em {mesRotulo}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-2">
          {ticketMedio === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              Nenhuma despesa paga neste mês.
            </p>
          ) : (
            <div className="space-y-1">
              <div className="text-3xl font-bold tracking-tight">
                <ValorMonetario valor={ticketMedio} tipo="despesa" />
              </div>
              <p className="text-xs text-muted-foreground">
                por despesa paga ({totalDespesasPagas > 0 ? (
                  <span>
                    total de <ValorMonetario valor={totalDespesasPagas} tipo="despesa" />
                  </span>
                ) : null})
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* KPI 2: Formas de Pagamento */}
      <Card className="flex flex-col">
        <CardHeader className="pb-[var(--esp-2)]">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold truncate">
            <CreditCard className="size-4 text-primary" aria-hidden="true" />
            Formas de pagamento
          </CardTitle>
          <CardDescription className="text-xs">
            Canais de despesas pagas em {mesRotulo}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-2 flex-1">
          {itensFormaPagamento.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              Nenhuma forma de pagamento registrada neste mês.
            </p>
          ) : (
            <div className="space-y-3">
              {itensFormaPagamento.map((item, idx) => {
                const percentual = totalDespesasPagas > 0
                  ? ((item.valor / totalDespesasPagas) * 100).toFixed(0)
                  : '0'
                const proporcaoBarra = Math.min(100, Math.max(4, (item.valor / maxForma) * 100))

                return (
                  <div key={item.nome} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium truncate max-w-[55%]">{item.nome}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-muted-foreground">{percentual}%</span>
                        <span className="font-medium">
                          <ValorMonetario valor={item.valor} tipo="despesa" />
                        </span>
                      </div>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all duration-500',
                          idx === 0 ? 'bg-primary' : 'bg-muted-foreground/30',
                        )}
                        style={{ width: `${proporcaoBarra}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* KPI 3: Quem Pagou Mais */}
      <Card className="flex flex-col">
        <CardHeader className="pb-[var(--esp-2)]">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold truncate">
            <Users className="size-4 text-primary" aria-hidden="true" />
            Quem pagou mais
          </CardTitle>
          <CardDescription className="text-xs">
            Divisão de despesas pagas por membro
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-2 flex-1">
          {itensPorMembro.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              Nenhum membro com despesas pagas neste mês.
            </p>
          ) : itensPorMembro.length === 1 ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium truncate">{itensPorMembro[0].nome}</span>
                  <span className="font-medium">
                    <ValorMonetario valor={itensPorMembro[0].valor} tipo="despesa" />
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-primary" />
              </div>
              <p className="text-xs text-muted-foreground">
                Apenas um membro registrado este mês.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {itensPorMembro.map((item, idx) => {
                const percentual = totalDespesasPagas > 0
                  ? ((item.valor / totalDespesasPagas) * 100).toFixed(0)
                  : '0'
                const proporcaoBarra = Math.min(100, Math.max(4, (item.valor / maxMembro) * 100))

                return (
                  <div key={item.nome} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium truncate max-w-[55%]">{item.nome}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-muted-foreground">{percentual}%</span>
                        <span className="font-medium">
                          <ValorMonetario valor={item.valor} tipo="despesa" />
                        </span>
                      </div>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all duration-500',
                          idx === 0 ? 'bg-primary' : 'bg-muted-foreground/30',
                        )}
                        style={{ width: `${proporcaoBarra}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
