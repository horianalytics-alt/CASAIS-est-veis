'use client'

import * as React from 'react'
import {
  PiggyBank,
  Zap,
  Lock,
  CheckCircle2,
  ArrowDownLeft,
  ArrowUpRight,
  TrendingUp,
  Info,
  Calendar,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ValorMonetario } from '@/components/financeiro/valor-monetario'
import { useInView } from '@/hooks/use-in-view'
import { hapticFeedback } from '@/lib/haptics'
import { isoToBR, todayISO } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  type CaixinhaInvestimento,
  ROTULOS_TIPO_RENDIMENTO,
  formatarTaxaMensal,
} from './tipos-investimentos'

export interface CardCaixinhaProps {
  caixinha: CaixinhaInvestimento
  index?: number
  aoAlocar: (caixinha: CaixinhaInvestimento) => void
  aoResgatar: (caixinha: CaixinhaInvestimento) => void
  aoVerProjecao?: (caixinha: CaixinhaInvestimento) => void
  selecionada?: boolean
  className?: string
}

export function CardCaixinha({
  caixinha,
  index = 0,
  aoAlocar,
  aoResgatar,
  aoVerProjecao,
  selecionada = false,
  className,
}: CardCaixinhaProps) {
  const { ref, inView } = useInView<HTMLElement>({ threshold: 0.08, replayOnScroll: true })

  const hoje = todayISO()
  const estaVencida = Boolean(
    !caixinha.resgate_imediato &&
      caixinha.data_vencimento &&
      caixinha.data_vencimento <= hoje,
  )
  const bloqueadaParaResgate = Boolean(
    !caixinha.resgate_imediato &&
      caixinha.data_vencimento &&
      caixinha.data_vencimento > hoje,
  )

  const saldoReais = caixinha.balance_cents / 100

  return (
    <article
      ref={ref}
      aria-label={`Caixinha ${caixinha.name}`}
      className={cn(
        'group relative flex flex-col justify-between overflow-hidden rounded-2xl p-5 transition-all duration-500',
        'shadow-cartao border border-border/80 dark:border-white/10',
        'bg-linear-to-br from-card via-card to-muted/40',
        inView ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-3 scale-[0.98]',
        selecionada && 'ring-2 ring-primary/80 border-primary/50',
        className,
      )}
      style={{
        transitionDelay: `${index * 60}ms`,
        transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      {/* Topo do Card: Nome, Tipo e Selo de Resgate */}
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="flex size-9 items-center justify-center rounded-xl border border-sky-500/20 bg-sky-500/10 text-sky-600 dark:text-sky-400 shrink-0">
              <PiggyBank className="size-4.5" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <h3
                className="text-foreground text-sm font-semibold tracking-tight leading-tight line-clamp-1"
                title={caixinha.name}
              >
                {caixinha.name}
              </h3>
              <span className="text-muted-foreground text-xs line-clamp-1">
                {ROTULOS_TIPO_RENDIMENTO[caixinha.rate_type] ?? caixinha.rate_type}
              </span>
            </div>
          </div>

          {/* Badge de Resgate / Carência */}
          {caixinha.resgate_imediato ? (
            <Badge
              variant="outline"
              className="gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] px-2 py-0.5 shrink-0 font-medium"
            >
              <Zap className="size-3" aria-hidden="true" />
              Resgate imediato
            </Badge>
          ) : estaVencida ? (
            <Badge
              variant="outline"
              className={cn(
                'gap-1 border-emerald-500/40 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[10px] px-2 py-0.5 shrink-0 font-medium',
                inView && 'animate-micro-pulso',
              )}
            >
              <CheckCircle2 className="size-3" aria-hidden="true" />
              Vencido · Liberado
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="gap-1 border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] px-2 py-0.5 shrink-0 font-medium"
              title={`Carência até ${isoToBR(caixinha.data_vencimento!)}`}
            >
              <Lock className="size-3" aria-hidden="true" />
              Até {isoToBR(caixinha.data_vencimento!).slice(0, 5)}
            </Badge>
          )}
        </div>

        {/* Informação da Taxa Estimada */}
        <div className="flex items-center justify-between rounded-xl bg-muted/40 px-3 py-2 border border-border/60">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="size-3.5 text-primary" aria-hidden="true" />
            <span className="text-xs font-semibold text-foreground">
              {formatarTaxaMensal(caixinha.rate_bps)}
            </span>
          </div>
          <div className="flex items-center gap-1 text-muted-foreground text-[11px]">
            <Info className="size-3 opacity-60" aria-hidden="true" />
            <span>Estimativa desde {isoToBR(caixinha.rate_defined_at)}</span>
          </div>
        </div>
      </div>

      {/* Saldo da Caixinha */}
      <div className="my-4 flex flex-col gap-0.5">
        <span className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
          Saldo acumulado
        </span>
        <div className="mt-0.5">
          <ValorMonetario
            valor={saldoReais}
            tipo="investimento"
            tamanho="destaque"
            animar
          />
        </div>
        {!caixinha.resgate_imediato && caixinha.data_vencimento && (
          <span className="text-muted-foreground text-[11px] flex items-center gap-1 mt-0.5">
            <Calendar className="size-3" aria-hidden="true" />
            {bloqueadaParaResgate
              ? `Carência até ${isoToBR(caixinha.data_vencimento)}`
              : `Venceu em ${isoToBR(caixinha.data_vencimento)}`}
          </span>
        )}
      </div>

      {/* Ações da Caixinha: Alocar e Resgatar */}
      <div className="flex items-center gap-2 pt-2 border-t border-border/60">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            hapticFeedback.light()
            aoAlocar(caixinha)
          }}
          className="flex-1 h-8 gap-1.5 text-xs rounded-xl"
        >
          <ArrowDownLeft className="size-3.5 text-primary" aria-hidden="true" />
          <span>Alocar</span>
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            hapticFeedback.light()
            aoResgatar(caixinha)
          }}
          className={cn(
            'flex-1 h-8 gap-1.5 text-xs rounded-xl',
            bloqueadaParaResgate && 'opacity-65 text-muted-foreground',
          )}
          title={
            bloqueadaParaResgate
              ? `Carência até ${isoToBR(caixinha.data_vencimento!)}`
              : 'Resgatar saldo'
          }
        >
          {bloqueadaParaResgate ? (
            <Lock className="size-3.5 text-amber-500" aria-hidden="true" />
          ) : (
            <ArrowUpRight className="size-3.5 text-sky-500" aria-hidden="true" />
          )}
          <span>Resgatar</span>
        </Button>

        {aoVerProjecao && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => {
              hapticFeedback.selection()
              aoVerProjecao(caixinha)
            }}
            className="h-8 w-8 rounded-xl text-muted-foreground hover:text-foreground"
            title="Ver projeção"
            aria-label={`Ver projeção de ${caixinha.name}`}
          >
            <TrendingUp className="size-3.5" aria-hidden="true" />
          </Button>
        )}
      </div>
    </article>
  )
}
