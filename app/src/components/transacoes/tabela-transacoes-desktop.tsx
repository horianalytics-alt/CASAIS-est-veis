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
}

export function TabelaTransacoesDesktop({
  transacoes,
  nomeCategoria,
  nomeConta,
}: TabelaTransacoesDesktopProps) {
  return (
    <div className="hidden lg:block w-full overflow-x-auto">
      <table className="w-full text-left border-collapse text-sm">
        <thead>
          <tr className="border-b border-border/80 text-muted-foreground text-xs uppercase tracking-wider">
            <th className="py-3 px-3 font-semibold">Data</th>
            <th className="py-3 px-3 font-semibold">Descrição</th>
            <th className="py-3 px-3 font-semibold">Categoria</th>
            <th className="py-3 px-3 font-semibold">Conta</th>
            <th className="py-3 px-3 font-semibold text-right">Valor</th>
            <th className="py-3 px-3 font-semibold text-right">Estado</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {transacoes.map((t) => {
            const tipo = tipoConhecido(t.type)
            const categoria = t.category_id ? nomeCategoria(t.category_id) : null
            const conta = nomeConta(t.account_id)
            const mostraStatus = tipo === 'receita' || tipo === 'despesa'

            return (
              <tr
                key={t.id}
                className="hover:bg-muted/40 transition-colors group"
              >
                {/* Data */}
                <td className="py-3.5 px-3 whitespace-nowrap text-muted-foreground font-mono text-xs num-tabular">
                  {isoToBR(t.date)}
                </td>

                {/* Descrição e Tipo */}
                <td className="py-3.5 px-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground max-w-[260px] truncate" title={t.description}>
                      {t.description}
                    </span>
                    <BadgeTipo tipo={t.type} pago />
                  </div>
                </td>

                {/* Categoria */}
                <td className="py-3.5 px-3 text-muted-foreground text-xs">
                  {categoria ?? '—'}
                </td>

                {/* Conta */}
                <td className="py-3.5 px-3 text-muted-foreground text-xs">
                  {conta ?? '—'}
                </td>

                {/* Valor */}
                <td className="py-3.5 px-3 text-right whitespace-nowrap">
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

                {/* Estado */}
                <td className="py-3.5 px-3 text-right whitespace-nowrap">
                  {mostraStatus ? (
                    <span
                      className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                        t.is_paid ? 'text-muted-foreground' : 'text-pendente'
                      }`}
                    >
                      {t.is_paid ? (
                        <Check aria-hidden="true" className="size-3.5 text-receita" />
                      ) : (
                        <Clock aria-hidden="true" className="size-3.5" />
                      )}
                      {t.is_paid ? INICIO.pago : INICIO.pendente}
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
