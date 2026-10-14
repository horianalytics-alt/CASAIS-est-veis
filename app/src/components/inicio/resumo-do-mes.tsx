'use client'

import * as React from 'react'
import {
  ArrowDownLeft,
  ArrowUpRight,
  Clock,
  PiggyBank,
  Wallet,
  TrendingUp,
  Percent,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { ValorMonetario } from '@/components/financeiro/valor-monetario'
import { ValorSaldo } from '@/components/financeiro/valor-saldo'
import { INICIO } from '@/features/transacoes/copy'
import { formatBRL } from '@/lib/format'
import { useOcultarValores } from '@/components/providers/ocultar-valores-provider'
import { cn } from '@/lib/utils'

export interface ResumoDoMesProps {
  /** Receitas já recebidas no mês. */
  entrou: number
  /** Despesas já pagas no mês. */
  saiu: number
  /** Despesas ainda pendentes no mês. */
  aPagar: number
  /** Total de receitas no mês (pagas + pendentes). */
  receitasTotal?: number
  /** Total de despesas no mês (pagas + pendentes). */
  despesasTotal?: number
  /** Investimentos realizados no mês. */
  investimentos?: number
  /** Recebíveis pendentes no mês. */
  aReceber?: number
}

/**
 * Resumo do mês: O meio termo ideal entre a intuitividade imediata do app antigo
 * (cards independentes, ícones e números coloridos) e o minimalismo limpo do app novo.
 */
export function ResumoDoMes({
  entrou,
  saiu,
  aPagar,
  receitasTotal,
  despesasTotal,
  investimentos = 0,
  aReceber = 0,
}: ResumoDoMesProps) {
  const { oculto } = useOcultarValores()
  const saldo = Math.round((entrou - saiu) * 100) / 100
  const taxaComprometimento = entrou > 0 ? Math.min(100, Math.round((saiu / entrou) * 100)) : 0

  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      {/* 1. Card Herói: Saldo do Mês */}
      <Card className="relative overflow-hidden border-border/80 bg-gradient-to-br from-card to-muted/30 shadow-xs">
        <CardContent className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-5 sm:p-6">
          <div className="flex flex-col gap-1.5 min-w-0">
            <div className="flex items-center gap-2">
              <div className="bg-primary/10 text-primary flex size-7 items-center justify-center rounded-lg border border-primary/20 shrink-0">
                <Wallet className="size-4" aria-hidden="true" />
              </div>
              <span className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
                {INICIO.saldoDoMes}
              </span>
            </div>
            <div className="flex items-baseline gap-3">
              <ValorSaldo valor={saldo} tamanho="heroi" className="justify-start font-bold" />
            </div>
            <p className="text-muted-foreground text-xs">
              Receitas pagas menos despesas pagas deste mês
            </p>
          </div>

          {/* Indicador de comprometimento / status */}
          <div className="flex items-center gap-3 sm:flex-col sm:items-end sm:gap-1.5 pt-2 sm:pt-0 border-t border-border/60 sm:border-0 shrink-0">
            <span className="text-muted-foreground text-xs">Comprometimento</span>
            <div className="flex items-center gap-1.5 bg-muted/60 px-2.5 py-1 rounded-full border border-border/80">
              <Percent className="size-3 text-muted-foreground" aria-hidden="true" />
              <span className="text-foreground text-xs font-semibold num-tabular">
                {oculto ? '••••' : `${taxaComprometimento}% da receita`}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 2. Grade de Indicadores (KPI Cards) coloridos e intuitivos */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Receitas */}
        <Card className="border-border/70 bg-card hover:border-receita/40 transition-colors shadow-2xs">
          <CardContent className="p-3 sm:p-4 flex flex-col gap-1.5 sm:gap-2 min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-xs font-medium">
                {INICIO.entrou}
              </span>
              <div className="bg-receita/10 text-receita flex size-7 items-center justify-center rounded-lg border border-receita/20 shrink-0">
                <ArrowDownLeft className="size-4" aria-hidden="true" />
              </div>
            </div>
            <div className="flex flex-col">
              <ValorMonetario valor={entrou} tipo="receita" tamanho="destaque" className="text-base sm:text-xl font-bold truncate" />
              {receitasTotal && receitasTotal > entrou ? (
                <span className="text-muted-foreground text-[10px] sm:text-[11px] truncate mt-0.5">
                  de {formatBRL(receitasTotal, oculto)} prev.
                </span>
              ) : (
                <span className="text-muted-foreground text-[10px] sm:text-[11px] truncate mt-0.5">
                  Recebido no mês
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Despesas */}
        <Card className="border-border/70 bg-card hover:border-despesa/40 transition-colors shadow-2xs">
          <CardContent className="p-3 sm:p-4 flex flex-col gap-1.5 sm:gap-2 min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-xs font-medium">
                {INICIO.saiu}
              </span>
              <div className="bg-despesa/10 text-despesa flex size-7 items-center justify-center rounded-lg border border-despesa/20 shrink-0">
                <ArrowUpRight className="size-4" aria-hidden="true" />
              </div>
            </div>
            <div className="flex flex-col">
              <ValorMonetario valor={saiu} tipo="despesa" tamanho="destaque" className="text-base sm:text-xl font-bold truncate" />
              {despesasTotal && despesasTotal > saiu ? (
                <span className="text-muted-foreground text-[10px] sm:text-[11px] truncate mt-0.5">
                  de {formatBRL(despesasTotal, oculto)} prev.
                </span>
              ) : (
                <span className="text-muted-foreground text-[10px] sm:text-[11px] truncate mt-0.5">
                  Pago no mês
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* A Pagar (Pendente) */}
        <Card className="border-border/70 bg-card hover:border-pendente/40 transition-colors shadow-2xs">
          <CardContent className="p-3 sm:p-4 flex flex-col gap-1.5 sm:gap-2 min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-xs font-medium">
                {INICIO.aPagar}
              </span>
              <div className="bg-pendente/10 text-pendente flex size-7 items-center justify-center rounded-lg border border-pendente/20 shrink-0">
                <Clock className="size-4" aria-hidden="true" />
              </div>
            </div>
            <div className="flex flex-col">
              <ValorMonetario valor={aPagar} tipo="despesa" pago={false} tamanho="destaque" className="text-base sm:text-xl font-bold truncate" />
              <span className="text-muted-foreground text-[10px] sm:text-[11px] truncate mt-0.5">
                Pendente de pgto
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Investimentos ou A Receber */}
        {investimentos > 0 ? (
          <Card className="border-border/70 bg-card hover:border-investimento/40 transition-colors shadow-2xs">
            <CardContent className="p-3 sm:p-4 flex flex-col gap-1.5 sm:gap-2 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-xs font-medium">
                  Investimentos
                </span>
                <div className="bg-investimento/10 text-investimento flex size-7 items-center justify-center rounded-lg border border-investimento/20 shrink-0">
                  <PiggyBank className="size-4" aria-hidden="true" />
                </div>
              </div>
              <div className="flex flex-col">
                <ValorMonetario valor={investimentos} tipo="investimento" tamanho="destaque" className="text-base sm:text-xl font-bold truncate" />
                <span className="text-muted-foreground text-[10px] sm:text-[11px] truncate mt-0.5">
                  Aportado no mês
                </span>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-border/70 bg-card hover:border-receita/40 transition-colors shadow-2xs">
            <CardContent className="p-3 sm:p-4 flex flex-col gap-1.5 sm:gap-2 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-xs font-medium">
                  A Receber
                </span>
                <div className="bg-receita/10 text-receita flex size-7 items-center justify-center rounded-lg border border-receita/20 shrink-0">
                  <TrendingUp className="size-4" aria-hidden="true" />
                </div>
              </div>
              <div className="flex flex-col">
                <ValorMonetario valor={aReceber} tipo="receita" pago={false} tamanho="destaque" className="text-base sm:text-xl font-bold truncate" />
                <span className="text-muted-foreground text-[10px] sm:text-[11px] truncate mt-0.5">
                  Entradas pendentes
                </span>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}