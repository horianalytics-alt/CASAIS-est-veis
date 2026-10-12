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

/** `transactions.type` vem como string; o narrowing é por busca, nunca `as`. */
function tipoConhecido(tipo: string): TipoDeValor | undefined {
  return TIPOS.find((t) => t === tipo)
}

export interface ItemTransacaoProps {
  transacao: Transacao
  nomeCategoria?: string | null
  nomeConta?: string | null
}

/**
 * Uma linha da lista de lançamentos. Server Component.
 *
 * Pago x pendente é dito com ÍCONE + PALAVRA sob o valor, além da cor — a cor
 * sozinha some em preto e branco e em daltonismo.
 */
export function ItemTransacao({
  transacao,
  nomeCategoria,
  nomeConta,
}: ItemTransacaoProps) {
  const tipo = tipoConhecido(transacao.type)
  const mostraStatus = tipo === 'receita' || tipo === 'despesa'

  const meta = [isoToBR(transacao.date), nomeConta, nomeCategoria]
    .filter((parte): parte is string => Boolean(parte))
    .join(' · ')

  return (
    <li className="flex items-start justify-between gap-[var(--esp-3)] py-[var(--esp-3)]">
      <div className="flex min-w-0 flex-1 flex-col gap-[var(--esp-1)]">
        <p className="line-clamp-2 text-[length:var(--texto-corpo)] leading-[var(--texto-corpo-lh)] font-medium break-words">
          {transacao.description}
        </p>
        <p className="text-muted-foreground text-[length:var(--texto-apoio)] leading-[var(--texto-apoio-lh)]">
          {meta}
        </p>
        <BadgeTipo tipo={transacao.type} pago />
      </div>

      <div className="flex shrink-0 flex-col items-end gap-[var(--esp-1)]">
        {tipo ? (
          <ValorMonetario
            valor={transacao.amount}
            tipo={tipo}
            pago={transacao.is_paid}
          />
        ) : null}
        {mostraStatus ? (
          <span
            className={`inline-flex items-center gap-[var(--esp-1)] text-[length:var(--texto-apoio)] leading-[var(--texto-apoio-lh)] ${
              transacao.is_paid ? 'text-muted-foreground' : 'text-pendente'
            }`}
          >
            {transacao.is_paid ? (
              <Check aria-hidden="true" className="size-3.5" />
            ) : (
              <Clock aria-hidden="true" className="size-3.5" />
            )}
            {transacao.is_paid ? INICIO.pago : INICIO.pendente}
          </span>
        ) : null}
      </div>
    </li>
  )
}
