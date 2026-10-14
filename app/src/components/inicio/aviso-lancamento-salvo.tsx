import Link from 'next/link'
import { CircleCheck, X } from 'lucide-react'
import {
  ValorMonetario,
  type TipoDeValor,
} from '@/components/financeiro/valor-monetario'
import { buttonVariants } from '@/components/ui/button'
import { INICIO } from '@/features/transacoes/copy'
import { isoToBR } from '@/lib/format'
import { cn } from '@/lib/utils'

export interface LancamentoSalvoResumo {
  descricao: string
  valor: number
  /** `transactions.type` cru; o narrowing é feito aqui, por busca, nunca `as`. */
  tipo: string
  pago: boolean
  data: string
}

const TIPOS: readonly TipoDeValor[] = ['receita', 'despesa', 'investimento', 'transferencia']

export interface AvisoLancamentoSalvoProps {
  /** null quando o lançamento não pôde ser lido (o aviso fica só com o título). */
  lancamento: LancamentoSalvoResumo | null
  /** Quantos itens foram enviados no salvamento (1 no simples, N no lote). */
  quantidade: number
  /** Mesmo mês, sem `novo`: fechar o aviso é só sair da querystring. */
  hrefFechar: string
}

/**
 * Confirmação no TOPO do Início depois de salvar um lançamento.
 *
 * A lista ordena por data: um lançamento de hoje pode ficar abaixo de contas
 * agendadas para o fim do mês e, no celular, abaixo da dobra. Sem este aviso,
 * quem acabou de lançar não vê nada mudar e conclui que não salvou.
 *
 * Server Component: o estado vem da URL (`?novo=`), sobrevive ao redirect e
 * some ao trocar de mês ou ao fechar.
 */
export function AvisoLancamentoSalvo({
  lancamento,
  quantidade,
  hrefFechar,
}: AvisoLancamentoSalvoProps) {
  const titulo = quantidade > 1 ? INICIO.salvoVarios(quantidade) : INICIO.salvoUm
  // Em lote, o detalhe de UM item sob "N lançamentos salvos" leria como se só
  // aquele tivesse entrado: o aviso fica só com a contagem.
  const detalhe = quantidade === 1 ? lancamento : null
  const tipo = detalhe ? TIPOS.find((t) => t === detalhe.tipo) : undefined

  return (
    <div
      role="status"
      className="border-primary/40 bg-primary/10 flex items-start gap-[var(--esp-3)] rounded-lg border px-[var(--esp-3)] py-[var(--esp-2)]"
    >
      <CircleCheck aria-hidden="true" className="text-receita mt-[var(--esp-1)] size-5 shrink-0" />

      <div className="flex min-w-0 flex-1 flex-col gap-[var(--esp-1)]">
        <p className="text-[length:var(--texto-corpo)] leading-[var(--texto-corpo-lh)] font-semibold">
          {titulo}
        </p>
        {detalhe ? (
          <div className="flex flex-wrap items-baseline gap-x-[var(--esp-2)] gap-y-[var(--esp-1)] text-[length:var(--texto-apoio)] leading-[var(--texto-apoio-lh)]">
            <span className="text-muted-foreground min-w-0 break-words">
              {INICIO.salvoDetalhe(detalhe.descricao, isoToBR(detalhe.data))}
            </span>
            {tipo ? (
              <ValorMonetario
                valor={detalhe.valor}
                tipo={tipo}
                pago={detalhe.pago}
                tamanho="linha"
              />
            ) : null}
          </div>
        ) : null}
        <a
          href="#lista-lancamentos"
          className="text-primary w-fit text-[length:var(--texto-apoio)] leading-[var(--texto-apoio-lh)] font-medium underline underline-offset-4"
        >
          {INICIO.verNaLista}
        </a>
      </div>

      <Link
        href={hrefFechar}
        replace
        scroll={false}
        aria-label={INICIO.fecharAviso}
        className={cn(
          buttonVariants({ variant: 'ghost', size: 'icone-toque' }),
          'text-muted-foreground -m-[var(--esp-2)]',
        )}
      >
        <X aria-hidden="true" className="size-4" />
      </Link>
    </div>
  )
}
