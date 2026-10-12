import { ArrowDownLeft, ArrowUpRight, Clock, PiggyBank, ArrowLeftRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TipoDeValor } from './valor-monetario'

/**
 * Selo do tipo de lançamento: ÍCONE + PALAVRA.
 *
 * A palavra é obrigatória, não decoração. É ela que sobrevive ao teste de
 * aceite do Vitrine (`filter: grayscale(1)`): sem cor, o ícone sozinho fica
 * ambíguo entre receita e despesa, a palavra não.
 *
 * Os ícones aqui são DECORATIVOS (handoff 4.4) e levam aria-hidden: o texto
 * ao lado já diz tudo, e um leitor de tela anunciando "seta" antes de
 * "Receita" só atrapalha.
 *
 * O `type` vem do banco como `string` (não é união no tipo gerado), então o
 * narrowing é feito por mapa indexado — nunca por `as`.
 */

const ROTULO: Record<string, string> = {
  receita: 'Receita',
  despesa: 'Despesa',
  investimento: 'Investimento',
  transferencia: 'Transferência',
}

const ICONE = {
  receita: ArrowDownLeft,
  despesa: ArrowUpRight,
  investimento: PiggyBank,
  transferencia: ArrowLeftRight,
} as const

const COR: Record<TipoDeValor, string> = {
  receita: 'text-receita',
  despesa: 'text-despesa',
  investimento: 'text-investimento',
  transferencia: 'text-transferencia',
}

function ehTipoConhecido(valor: string): valor is TipoDeValor {
  return valor in ICONE
}

export interface BadgeTipoProps {
  /** `transactions.type`, que o banco entrega como string livre. */
  tipo: string
  /** false => o selo inteiro vira "Pendente" com relógio. */
  pago?: boolean
  className?: string
}

export function BadgeTipo({ tipo, pago = true, className }: BadgeTipoProps) {
  if (!ehTipoConhecido(tipo)) return null

  // Pendente domina a leitura: o que importa saber primeiro é que ainda não
  // saiu/entrou de verdade. O tipo continua visível pela cor do valor.
  const pendente = !pago && (tipo === 'receita' || tipo === 'despesa')
  const Icone = pendente ? Clock : ICONE[tipo]
  const texto = pendente ? 'Pendente' : ROTULO[tipo]

  return (
    <span
      className={cn(
        // --raio-chip = rounded-sm (handoff 2.4)
        'inline-flex items-center gap-[var(--esp-1)] rounded-sm',
        'text-[length:var(--texto-apoio)] leading-[var(--texto-apoio-lh)]',
        pendente ? 'text-pendente' : COR[tipo],
        className,
      )}
    >
      <Icone aria-hidden="true" className="size-3.5 shrink-0" />
      {texto}
    </span>
  )
}
