'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { House, Plus, Scale, Settings, Wallet } from 'lucide-react'
import { NAVEGACAO } from '@/features/transacoes/copy'
import { hapticFeedback } from '@/lib/haptics'
import { cn } from '@/lib/utils'

interface ItemNav {
  href: string
  rotulo: string
  Icone: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>
  destaque?: boolean
}

const ITENS: readonly ItemNav[] = [
  { href: '/inicio', rotulo: NAVEGACAO.inicio, Icone: House },
  { href: '/carteira', rotulo: NAVEGACAO.carteira, Icone: Wallet },
  { href: '/lancar', rotulo: NAVEGACAO.lancar, Icone: Plus, destaque: true },
  { href: '/acerto', rotulo: NAVEGACAO.acerto, Icone: Scale },
  { href: '/ajustes', rotulo: NAVEGACAO.ajustes, Icone: Settings },
]

export function NavegacaoInferior() {
  const caminho = usePathname()

  return (
    <nav
      aria-label={NAVEGACAO.rotuloDaBarra}
      className="bg-background/95 backdrop-blur-md border-border fixed bottom-0 inset-x-0 z-20 border-t pb-[env(safe-area-inset-bottom)] lg:hidden transition-colors"
    >
      <ul className="mx-auto flex h-16 max-w-[40rem] items-center px-2">
        {ITENS.map(({ href, rotulo, Icone, destaque }) => {
          const ativo = caminho === href

          if (destaque) {
            return (
              <li key={href} className="flex flex-1 items-center justify-center -mt-5">
                <Link
                  href={href}
                  onClick={() => hapticFeedback.light()}
                  aria-label={rotulo}
                  title={rotulo}
                  className={cn(
                    'flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md border-4 border-background transition-all duration-300 active:scale-90 hover:scale-105',
                    ativo && 'ring-2 ring-primary ring-offset-2',
                  )}
                >
                  <Icone aria-hidden="true" className="size-6 stroke-[2.5]" />
                </Link>
              </li>
            )
          }

          return (
            <li key={href} className="flex flex-1">
              <Link
                href={href}
                onClick={() => hapticFeedback.selection()}
                aria-current={ativo ? 'page' : undefined}
                className={cn(
                  'focus-visible:ring-ring relative flex min-h-[44px] flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium outline-none focus-visible:ring-2 transition-all duration-200 active:scale-95 py-1',
                  ativo
                    ? 'text-primary font-semibold'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {/* Indicador sutil de cápsula para aba ativa */}
                {ativo && (
                  <span
                    className="absolute inset-x-2 inset-y-1 -z-10 rounded-xl bg-primary/10 transition-all duration-300"
                    aria-hidden="true"
                  />
                )}
                <Icone
                  aria-hidden="true"
                  className={cn(
                    'size-5 transition-transform duration-200',
                    ativo && 'scale-110',
                  )}
                />
                <span>{rotulo}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}