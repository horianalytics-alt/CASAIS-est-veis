'use client'

import * as React from 'react'
import {
  ArrowRight,
  CheckCircle2,
  Info,
  Scale,
  User,
  Users,
} from 'lucide-react'
import type { Database } from '@/types/database'
import type { SettlementTransfer } from '@/lib/settlement'
import { ValorSaldo } from '@/components/financeiro/valor-saldo'
import { ValorMonetario } from '@/components/financeiro/valor-monetario'
import { Badge } from '@/components/ui/badge'
import { ACERTO } from '@/features/acerto/copy'
import { useInView } from '@/hooks/use-in-view'
import { cn } from '@/lib/utils'
import { DialogoAcertar } from './dialogo-acertar'

type LinhaAcerto = Database['public']['Views']['v_settlement']['Row']

export interface ResumoAcertoProps {
  linhas: LinhaAcerto[]
  regra: string
  transferencia: SettlementTransfer | null
}

export function ResumoAcerto({
  linhas,
  regra,
  transferencia,
}: ResumoAcertoProps) {
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.1, replayOnScroll: true })
  const devedor = transferencia
    ? linhas.find((l) => l.member_id === transferencia.from_member_id)
    : null
  const credor = transferencia
    ? linhas.find((l) => l.member_id === transferencia.to_member_id)
    : null

  const ehProporcional = regra === 'proportional'

  return (
    <div ref={ref} className="flex flex-col gap-6">
      {/* Bloco Herói: Quem deve para quem */}
      <section
        aria-labelledby="titulo-resultado-acerto"
        className="bg-card border-border/80 flex flex-col gap-4 rounded-2xl border p-4 sm:p-6 shadow-sm overflow-hidden"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <Scale className="text-muted-foreground size-4 sm:size-5 shrink-0" aria-hidden="true" />
            <span className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
              Balanço do casal
            </span>
          </div>

          <Badge
            variant="outline"
            className="h-auto w-fit max-w-full whitespace-normal py-1 px-2.5 text-[11px] sm:text-xs font-normal leading-tight text-muted-foreground"
          >
            {ehProporcional ? ACERTO.regraProporcional : ACERTO.regraIgual}
          </Badge>
        </div>

        {transferencia && devedor && credor ? (
          <div className="flex flex-col gap-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-muted/40 border border-border/80">
              <div className="flex items-center gap-3">
                <div className="bg-amber-500/10 text-amber-600 dark:text-amber-400 size-10 flex items-center justify-center rounded-xl border border-amber-500/20 font-bold text-sm shrink-0">
                  {devedor.display_name?.slice(0, 2).toUpperCase() ?? 'DE'}
                </div>
                <div className="flex flex-col">
                  <span className="text-[11px] text-muted-foreground uppercase font-semibold">Quem transfere</span>
                  <p className="font-bold text-foreground text-base">{devedor.display_name}</p>
                </div>
              </div>

              <div
                className={cn(
                  'flex flex-col items-center gap-1 px-4 py-2 rounded-lg bg-card border border-border/60 transition-all',
                  inView && 'animate-micro-pulso',
                )}
              >
                <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Valor do acerto</span>
                <ValorMonetario valor={transferencia.amount} tipo="transferencia" tamanho="destaque" className="font-bold" />
                <ArrowRight className="size-4 text-primary hidden sm:block" />
              </div>

              <div className="flex items-center gap-3">
                <div className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 size-10 flex items-center justify-center rounded-xl border border-emerald-500/20 font-bold text-sm shrink-0">
                  {credor.display_name?.slice(0, 2).toUpperCase() ?? 'PA'}
                </div>
                <div className="flex flex-col">
                  <span className="text-[11px] text-muted-foreground uppercase font-semibold">Quem recebe</span>
                  <p className="font-bold text-foreground text-base">{credor.display_name}</p>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-muted-foreground text-xs">
                {ehProporcional
                  ? ACERTO.regraDescricaoProporcional
                  : ACERTO.regraDescricaoIgual}
              </p>

              <DialogoAcertar
                devedorId={transferencia.from_member_id}
                devedorNome={devedor.display_name ?? 'Parceiro'}
                credorId={transferencia.to_member_id}
                credorNome={credor.display_name ?? 'Parceiro'}
                valor={transferencia.amount}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-2 py-2">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="text-receita size-6" aria-hidden="true" />
              <h2
                id="titulo-resultado-acerto"
                className="text-foreground text-xl font-bold"
              >
                {ACERTO.tudoZerado}
              </h2>
            </div>
            <p className="text-muted-foreground text-sm">
              {ACERTO.tudoZeradoDescricao}
            </p>
          </div>
        )}
      </section>

      {/* Detalhamento por membro */}
      <section aria-labelledby="titulo-detalhes" className="flex flex-col gap-3">
        <h3
          id="titulo-detalhes"
          className="text-foreground text-base font-semibold"
        >
          Detalhamento por membro
        </h3>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {linhas.map((membro, idx) => {
            const saldo = membro.balance ?? 0
            const cotaPct = Math.round((membro.share ?? 0.5) * 100)

            return (
              <div
                key={membro.member_id}
                className={cn(
                  'bg-card border-border/80 flex flex-col justify-between rounded-xl border p-5 transition-all duration-500',
                  inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2',
                )}
                style={{
                  transitionDelay: `${idx * 60}ms`,
                  transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="bg-muted text-foreground flex size-8 items-center justify-center rounded-full border border-border">
                      <User className="size-4" aria-hidden="true" />
                    </div>
                    <div>
                      <h4 className="text-foreground text-base font-semibold">
                        {membro.display_name ?? 'Membro'}
                      </h4>
                      <span className="text-muted-foreground text-xs">
                        {ACERTO.cota}: {cotaPct}%
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-muted-foreground block text-[11px]">
                      {ACERTO.saldoLiquido}
                    </span>
                    <ValorSaldo valor={saldo} tamanho="destaque" />
                  </div>
                </div>

                <div className="border-border/60 mt-4 flex items-center justify-between border-t pt-3 text-xs">
                  <div className="flex flex-col">
                    <span className="text-muted-foreground">
                      {ACERTO.totalPago}
                    </span>
                    <span className="font-medium">
                      <ValorMonetario valor={membro.total_paid ?? 0} tipo="receita" />
                    </span>
                  </div>

                  <div className="flex flex-col text-right">
                    <span className="text-muted-foreground">
                      {ACERTO.cotaDevida}
                    </span>
                    <span className="font-medium">
                      <ValorMonetario valor={membro.total_owed ?? 0} tipo="despesa" />
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Nota Explicativa */}
      <div className="bg-muted/40 border-border/60 flex items-start gap-2.5 rounded-lg border p-4 text-xs text-muted-foreground">
        <Info className="size-4 shrink-0 mt-0.5 text-muted-foreground" aria-hidden="true" />
        <p>
          O acerto considera todos os lançamentos pagos de despesa e investimento compartilhados.
          Quando você clica em <strong>{ACERTO.botaoAcertar}</strong>, o app gera uma transferência para equilibrar os saldos sem alterar as métricas mensais de despesa.
        </p>
      </div>
    </div>
  )
}
