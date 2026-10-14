import * as React from 'react'
import Link from 'next/link'
import {
  CreditCard,
  Landmark,
  PiggyBank,
  UtensilsCrossed,
  Wallet,
  ArrowRight,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ValorSaldo } from '@/components/financeiro/valor-saldo'
import { Badge } from '@/components/ui/badge'
import { INICIO, TIPOS_DE_CONTA } from '@/features/transacoes/copy'
import { cn } from '@/lib/utils'
import type { Database } from '@/types/database'

type SaldoConta = Database['public']['Views']['v_account_balances']['Row']

export interface SaldoDasContasProps {
  contas: SaldoConta[]
}

function getIconeConta(tipo: string | null) {
  switch (tipo) {
    case 'cartao':
      return { Icone: CreditCard, classe: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20' }
    case 'investimento':
      return { Icone: PiggyBank, classe: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20' }
    case 'beneficio':
      return { Icone: UtensilsCrossed, classe: 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20' }
    default:
      return { Icone: Landmark, classe: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' }
  }
}

/**
 * Saldos por Conta: Visual modular de cartões, combinando a metáfora tátil de
 * cartões de banco do app antigo com o minimalismo limpo e responsivo do novo app.
 */
export function SaldoDasContas({ contas }: SaldoDasContasProps) {
  return (
    <Card className="border-border/80 shadow-xs">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 px-4 sm:px-6 py-4 border-b border-border/60">
        <div className="flex items-center gap-2">
          <div className="bg-primary/10 text-primary flex size-7 items-center justify-center rounded-lg border border-primary/20 shrink-0">
            <Wallet className="size-4" aria-hidden="true" />
          </div>
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {INICIO.tituloContas}
          </CardTitle>
        </div>
        <Link
          href="/carteira"
          className="text-xs font-medium text-primary hover:text-primary/80 flex items-center gap-1 transition-colors"
        >
          <span>Ver carteira</span>
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      </CardHeader>
      <CardContent className="p-4 sm:p-5">
        {contas.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-6">
            {INICIO.semContas}
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {contas.map((conta) => {
              const { Icone, classe } = getIconeConta(conta.type)
              const rotuloTipo = TIPOS_DE_CONTA[conta.type ?? ''] ?? conta.type ?? 'Conta'

              return (
                <div
                  key={conta.account_id}
                  className="flex flex-col justify-between gap-3 p-3.5 rounded-xl border border-border/70 bg-card hover:border-border hover:shadow-2xs transition-all"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={cn('flex size-8 items-center justify-center rounded-lg border shrink-0', classe)}>
                        <Icone className="size-4" aria-hidden="true" />
                      </div>
                      <span className="font-semibold text-sm text-foreground truncate" title={conta.name ?? undefined}>
                        {conta.name ?? '—'}
                      </span>
                    </div>
                    <Badge variant="outline" className="text-[10px] uppercase tracking-wider px-1.5 py-0 shrink-0">
                      {rotuloTipo}
                    </Badge>
                  </div>

                  <div className="flex items-baseline justify-between pt-1 border-t border-border/40">
                    <span className="text-muted-foreground text-xs">Saldo</span>
                    <ValorSaldo valor={conta.current_balance ?? 0} className="font-bold text-base" />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}