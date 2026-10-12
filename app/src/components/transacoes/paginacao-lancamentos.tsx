import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { INICIO } from '@/features/transacoes/copy'
import { cn } from '@/lib/utils'

export interface PaginacaoLancamentosProps {
  pagina: number
  totalDePaginas: number
  /** Monta o href de uma página, preservando o mês. */
  hrefDaPagina: (pagina: number) => string
}

/**
 * Paginação por link (`?pagina=`), sem estado de client: a página continua
 * Server Component e o botão "voltar" do navegador funciona. `hrefDaPagina`
 * é chamada aqui mesmo, no servidor — não atravessa nenhuma fronteira.
 */
export function PaginacaoLancamentos({
  pagina,
  totalDePaginas,
  hrefDaPagina,
}: PaginacaoLancamentosProps) {
  if (totalDePaginas <= 1) return null

  const classeBotao = buttonVariants({ variant: 'outline', size: 'toque' })
  const desabilitado = 'pointer-events-none opacity-50'

  return (
    <nav
      aria-label={INICIO.paginacaoRotulo}
      className="flex items-center justify-between gap-[var(--esp-3)] pt-[var(--esp-3)]"
    >
      {pagina > 1 ? (
        <Link href={hrefDaPagina(pagina - 1)} className={classeBotao}>
          <ChevronLeft aria-hidden="true" />
          {INICIO.paginaAnterior}
        </Link>
      ) : (
        <span aria-hidden="true" className={cn(classeBotao, desabilitado)}>
          <ChevronLeft />
          {INICIO.paginaAnterior}
        </span>
      )}

      <span className="text-muted-foreground text-[length:var(--texto-apoio)] leading-[var(--texto-apoio-lh)]">
        {INICIO.paginaDe(pagina, totalDePaginas)}
      </span>

      {pagina < totalDePaginas ? (
        <Link href={hrefDaPagina(pagina + 1)} className={classeBotao}>
          {INICIO.paginaSeguinte}
          <ChevronRight aria-hidden="true" />
        </Link>
      ) : (
        <span aria-hidden="true" className={cn(classeBotao, desabilitado)}>
          {INICIO.paginaSeguinte}
          <ChevronRight />
        </span>
      )}
    </nav>
  )
}
