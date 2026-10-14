import * as React from 'react'
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowRightLeft,
  Check,
  Clock,
  PiggyBank,
  User,
  CreditCard,
  Tag,
} from 'lucide-react'
import {
  ValorMonetario,
  type TipoDeValor,
} from '@/components/financeiro/valor-monetario'
import { Badge } from '@/components/ui/badge'
import { INICIO } from '@/features/transacoes/copy'
import { isoToBR } from '@/lib/format'
import { cn } from '@/lib/utils'
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

function getIconeETipo(tipo: string | undefined) {
  switch (tipo) {
    case 'receita':
      return { Icone: ArrowDownLeft, classe: 'bg-receita/10 text-receita border-receita/20' }
    case 'despesa':
      return { Icone: ArrowUpRight, classe: 'bg-despesa/10 text-despesa border-despesa/20' }
    case 'investimento':
      return { Icone: PiggyBank, classe: 'bg-investimento/10 text-investimento border-investimento/20' }
    case 'transferencia':
      return { Icone: ArrowRightLeft, classe: 'bg-transferencia/10 text-transferencia border-transferencia/20' }
    default:
      return { Icone: ArrowUpRight, classe: 'bg-muted text-muted-foreground border-border' }
  }
}

export interface ItemTransacaoProps {
  transacao: Transacao
  nomeCategoria?: string | null
  nomeConta?: string | null
  nomeMembro?: string | null
  /** Acabou de ser salvo: fundo de destaque para a pessoa achar na lista. */
  destacado?: boolean
}

/**
 * Item de Transação no Mobile e Tablet:
 * Card com alta legibilidade, ícone temático colorido, badges claros de membro e status,
 * e valor monetário em destaque com alto contraste.
 */
export function ItemTransacao({
  transacao,
  nomeCategoria,
  nomeConta,
  nomeMembro,
  destacado = false,
}: ItemTransacaoProps) {
  const tipo = tipoConhecido(transacao.type)
  const { Icone, classe } = getIconeETipo(tipo)
  const mostraStatus = tipo === 'receita' || tipo === 'despesa'

  return (
    <li
      aria-current={destacado ? 'true' : undefined}
      className={cn(
        'flex flex-col gap-2.5 p-3.5 rounded-xl border border-border/70 bg-card hover:border-border hover:shadow-2xs transition-all',
        destacado && 'ring-2 ring-primary/40 bg-primary/5',
      )}
    >
      {/* Topo: Ícone + Descrição + Valor */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className={cn('flex size-8 items-center justify-center rounded-lg border shrink-0', classe)}>
            <Icone className="size-4" aria-hidden="true" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-semibold text-sm text-foreground truncate" title={transacao.description}>
              {transacao.description}
            </span>
            <span className="text-[11px] text-muted-foreground font-mono num-tabular">
              {isoToBR(transacao.date)}
            </span>
          </div>
        </div>

        <div className="shrink-0 text-right">
          {tipo ? (
            <ValorMonetario
              valor={transacao.amount}
              tipo={tipo}
              pago={transacao.is_paid}
              className="font-bold text-sm sm:text-base"
            />
          ) : null}
        </div>
      </div>

      {/* Base: Badges de Conta, Categoria, Membro e Status */}
      <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-border/40 text-xs">
        {/* Conta */}
        {nomeConta && (
          <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-muted/60 text-muted-foreground font-medium">
            <CreditCard className="size-3" aria-hidden="true" />
            <span className="truncate max-w-[100px]">{nomeConta}</span>
          </span>
        )}

        {/* Categoria */}
        {nomeCategoria && (
          <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-muted/60 text-muted-foreground font-medium">
            <Tag className="size-3" aria-hidden="true" />
            <span className="truncate max-w-[100px]">{nomeCategoria}</span>
          </span>
        )}

        {/* Membro que pagou */}
        {nomeMembro && (
          <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-primary/10 text-primary font-medium">
            <User className="size-3" aria-hidden="true" />
            <span>{nomeMembro}</span>
          </span>
        )}

        {/* Status Pago / Pendente */}
        {mostraStatus && (
          <span
            className={cn(
              'inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md font-medium ml-auto',
              transacao.is_paid
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20',
            )}
          >
            {transacao.is_paid ? (
              <Check className="size-3" aria-hidden="true" />
            ) : (
              <Clock className="size-3" aria-hidden="true" />
            )}
            <span>{transacao.is_paid ? INICIO.pago : INICIO.pendente}</span>
          </span>
        )}
      </div>
    </li>
  )
}