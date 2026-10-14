import * as React from 'react'
import { Check, Clock } from 'lucide-react'
import { BadgeTipo } from '@/components/financeiro/badge-tipo'
import {
  ValorMonetario,
  type TipoDeValor,
} from '@/components/financeiro/valor-monetario'
import { INICIO } from '@/features/transacoes/copy'
import { isoToBR } from '@/lib/format'
import type { Database } from '@/types/database'

type Transacao = Database['public']['Tables']['transactions']['Row']

const TIPOS: readonly TipoDeValor[] = [
  'receita',
  'despesa',
  'investimento',
  'transferencia',
]

function tipoConhecido(tipo: string): TipoDeValor | undefined {
  return TIPOS.find((t) => t === tipo)
}

export interface TabelaTransacoesDesktopProps {
  transacoes: Transacao[]
  nomeCategoria: (id: string | null) => string | null | undefined
  nomeConta: (id: string) => string | undefined
  /** Lançamento que acabou de ser salvo: linha com fundo de destaque. */
  idDestacado?: string | null
}

export function TabelaTransacoesDesktop({
  transacoes,
  nomeCategoria,
  nomeConta,
  idDestacado = null,
}: TabelaTransacoesDesktopProps) {
  return (
    <div className="hidden lg:block w-full overflow-x-auto">
      <table className="w-full table-fixed text-left border-collapse text-sm">
        <thead>
          <tr className="border-b border-border/80 text-muted-foreground text-xs uppercase tracking-wider">
            <th className="py-3 px-2 xl:px-3 font-semibold whitespace-nowrap w-[85px] xl:w-[95px]">Data</th>
            <th className="py-3 px-2 xl:px-3 font-semibold">Descrição</th>
            <th className="py-3 px-2 xl:px-3 font-semibold whitespace-nowrap w-[85px] xl:w-[130px]">Categoria</th>
            <th className="py-3 px-2 xl:px-3 font-semibold whitespace-nowrap w-[115px] xl:w-[160px]">Conta</th>
            <th className="py-3 px-2 xl:px-3 font-semibold text-right whitespace-nowrap w-[115px] xl:w-[130px]">Valor</th>
            <th className="py-3 px-2 xl:px-3 font-semibold text-right whitespace-nowrap w-[95px] hidden xl:table-cell">
              Estado
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {transacoes.map((t) => {
            const tipo = tipoConhecido(t.type)
            const categoria = t.category_id ? nomeCategoria(t.category_id) : null
            const conta = nomeConta(t.account_id)
            const mostraStatus = tipo === 'receita' || tipo === 'despesa'
            const destacado = t.id === idDestacado

            return (
              <tr
                key={t.id}
                aria-current={destacado ? 'true' : undefined}
                className={
                  destacado
                    ? 'bg-primary/10 transition-colors group'
                    : 'hover:bg-muted/40 transition-colors group'
                }
              >
                {/* Data */}
                <td className="py-3 px-2 xl:px-3 whitespace-nowrap text-muted-foreground font-mono text-xs num-tabular">
                  {isoToBR(t.date)}
                </td>

                {/* Descrição e Tipo */}
                <td className="py-3 px-2 xl:px-3 min-w-0">
                  <div className="flex items-center gap-1.5 xl:gap-2 min-w-0">
                    <span
                      className="font-medium text-foreground truncate min-w-0 flex-1"
                      title={t.description}
                    >
                      {t.description}
                    </span>
                    <BadgeTipo tipo={t.type} pago={t.is_paid} className="text-[11px] xl:text-xs shrink-0" />
                  </div>
                </td>

                {/* Categoria */}
                <td className="py-3 px-2 xl:px-3 text-muted-foreground text-xs whitespace-nowrap">
                  <span className="truncate block max-w-[95px] xl:max-w-[125px]" title={categoria ?? undefined}>
                    {categoria ?? '—'}
                  </span>
                </td>

                {/* Conta */}
                <td className="py-3 px-2 xl:px-3 text-foreground text-xs whitespace-nowrap font-medium">
                  <span className="truncate block max-w-[120px] xl:max-w-[160px]" title={conta ?? undefined}>
                    {conta ?? '—'}
                  </span>
                </td>

                {/* Valor */}
                <td className="py-3 px-2 xl:px-3 text-right whitespace-nowrap">
                  {tipo ? (
                    <ValorMonetario
                      valor={t.amount}
                      tipo={tipo}
                      pago={t.is_paid}
                      tamanho="linha"
                    />
                  ) : (
                    '—'
                  )}
                </td>

                {/* Estado (visível a partir de xl >= 1280px) */}
                <td className="py-3 px-2 xl:px-3 text-right whitespace-nowrap hidden xl:table-cell">
                  {mostraStatus ? (
                    <span
                      className={`inline-flex items-center justify-end gap-1.5 text-xs font-medium ${
                        t.is_paid ? 'text-muted-foreground' : 'text-pendente'
                      }`}
                    >
                      {t.is_paid ? (
                        <Check aria-hidden="true" className="size-3.5 text-receita shrink-0" />
                      ) : (
                        <Clock aria-hidden="true" className="size-3.5 shrink-0" />
                      )}
                      <span>{t.is_paid ? INICIO.pago : INICIO.pendente}</span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
