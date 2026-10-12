import * as React from 'react'
import { CreditCard, Check, Clock, ShoppingBag, Calendar } from 'lucide-react'
import type { Database } from '@/types/database'
import { ValorMonetario } from '@/components/financeiro/valor-monetario'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CARTEIRA, PAGAR_FATURA } from '@/features/carteira/copy'
import { invoicePeriodLabel } from '@/lib/invoice'
import { isoToBR } from '@/lib/format'
import {
  DialogoPagarFatura,
  type ContaOrigem,
} from './dialogo-pagar-fatura'

type Fatura = Database['public']['Views']['v_invoices']['Row']

export interface SecaoFaturasProps {
  faturas: Fatura[]
  contasOrigem: ContaOrigem[]
}

export function SecaoFaturas({ faturas, contasOrigem }: SecaoFaturasProps) {
  if (faturas.length === 0) {
    return (
      <section
        aria-labelledby="titulo-faturas"
        className="bg-card border-border flex flex-col gap-3 rounded-xl border p-6 text-center"
      >
        <h2
          id="titulo-faturas"
          className="text-foreground text-lg font-semibold"
        >
          {CARTEIRA.faturasTitulo}
        </h2>
        <p className="text-muted-foreground text-sm">
          {CARTEIRA.semFaturas}
        </p>
      </section>
    )
  }

  return (
    <section aria-labelledby="titulo-faturas" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2
          id="titulo-faturas"
          className="text-foreground text-lg font-semibold"
        >
          {CARTEIRA.faturasTitulo}
        </h2>
        <p className="text-muted-foreground text-xs">
          {CARTEIRA.faturasSubtitulo}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {faturas.map((fatura, idx) => {
          const ano = fatura.invoice_year ?? new Date().getFullYear()
          const mes = fatura.invoice_month ?? new Date().getMonth() + 1
          const periodo = invoicePeriodLabel(ano, mes)
          const aberta = (fatura.open_amount ?? 0) > 0
          const vencimentoBR = fatura.due_date ? isoToBR(fatura.due_date) : null

          return (
            <div
              key={`${fatura.account_id ?? 'card'}-${ano}-${mes}-${idx}`}
              className="bg-card border-border/80 flex flex-col gap-3 rounded-xl border p-4 transition-colors sm:flex-row sm:items-center sm:justify-between"
            >
              {/* Informações da fatura */}
              <div className="flex flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-foreground text-base font-semibold">
                    {periodo}
                  </span>
                  <Badge variant="outline" className="text-xs">
                    <CreditCard className="size-3" aria-hidden="true" />
                    {fatura.account_name ?? 'Cartão'}
                  </Badge>
                  {fatura.is_paid ? (
                    <Badge variant="secondary" className="bg-receita/15 text-receita border-receita/30 text-xs">
                      <Check className="size-3" aria-hidden="true" />
                      {CARTEIRA.faturaPaga}
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="bg-pendente/15 text-pendente border-pendente/30 text-xs">
                      <Clock className="size-3" aria-hidden="true" />
                      {CARTEIRA.faturaAberta}
                    </Badge>
                  )}
                </div>

                <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                  {vencimentoBR && (
                    <span className="flex items-center gap-1">
                      <Calendar className="size-3.5" aria-hidden="true" />
                      {CARTEIRA.venceEm(vencimentoBR)}
                    </span>
                  )}
                  {fatura.tx_count !== null && (
                    <span className="flex items-center gap-1">
                      <ShoppingBag className="size-3.5" aria-hidden="true" />
                      {CARTEIRA.comprasContador(fatura.tx_count)}
                    </span>
                  )}
                </div>
              </div>

              {/* Valores e Botão de Quitação */}
              <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border/40 pt-3 sm:border-t-0 sm:pt-0">
                <div className="flex flex-col text-left sm:text-right">
                  <span className="text-muted-foreground text-xs">
                    {CARTEIRA.valorTotal}:
                  </span>
                  <ValorMonetario
                    valor={fatura.total_amount ?? 0}
                    tipo="despesa"
                    tamanho="linha"
                  />
                  {aberta && (
                    <div className="flex items-center gap-1 text-xs">
                      <span className="text-pendente font-medium">
                        {CARTEIRA.valorEmAberto}:
                      </span>
                      <ValorMonetario
                        valor={fatura.open_amount ?? 0}
                        tipo="despesa"
                        pago={false}
                        tamanho="linha"
                      />
                    </div>
                  )}
                </div>

                {aberta && fatura.account_id && (
                  <DialogoPagarFatura
                    fatura={{
                      account_id: fatura.account_id,
                      account_name: fatura.account_name,
                      invoice_year: ano,
                      invoice_month: mes,
                      open_amount: fatura.open_amount ?? 0,
                    }}
                    contasOrigem={contasOrigem}
                    gatilho={
                      <Button variant="default" size="toque" className="whitespace-nowrap">
                        {PAGAR_FATURA.botaoConfirmar}
                      </Button>
                    }
                  />
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
