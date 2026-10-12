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
  const devedor = transferencia
    ? linhas.find((l) => l.member_id === transferencia.from_member_id)
    : null
  const credor = transferencia
    ? linhas.find((l) => l.member_id === transferencia.to_member_id)
    : null

  const ehProporcional = regra === 'proportional'

  return (
    <div className="flex flex-col gap-6">
      {/* Bloco Herói: Quem deve para quem */}
      <section
        aria-labelledby="titulo-resultado-acerto"
        className="bg-card border-border/80 flex flex-col gap-4 rounded-2xl border p-6 shadow-sm"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Scale className="text-muted-foreground size-5" aria-hidden="true" />
            <span className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
              Balanço do casal
            </span>
          </div>

          <Badge variant="outline" className="text-xs">
            {ehProporcional ? ACERTO.regraProporcional : ACERTO.regraIgual}
          </Badge>
        </div>

        {transferencia && devedor && credor ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h2
                id="titulo-resultado-acerto"
                className="text-foreground text-xl font-bold sm:text-2xl"
              >
                <span>{devedor.display_name ?? 'Parceiro'}</span>{' '}
                <span className="text-muted-foreground font-normal">deve</span>{' '}
                <ValorMonetario
                  valor={transferencia.amount}
                  tipo="transferencia"
                  tamanho="destaque"
                />{' '}
                <span className="text-muted-foreground font-normal">para</span>{' '}
                <span>{credor.display_name ?? 'Parceiro'}</span>
              </h2>
              <p className="text-muted-foreground text-xs">
                {ehProporcional
                  ? ACERTO.regraDescricaoProporcional
                  : ACERTO.regraDescricaoIgual}
              </p>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-3">
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
          {linhas.map((membro) => {
            const saldo = membro.balance ?? 0
            const cotaPct = Math.round((membro.share ?? 0.5) * 100)

            return (
              <div
                key={membro.member_id}
                className="bg-card border-border/80 flex flex-col justify-between rounded-xl border p-5 transition-colors"
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
