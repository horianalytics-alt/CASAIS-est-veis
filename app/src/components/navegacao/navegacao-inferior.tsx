'use client'

// 'use client' porque marca o item ativo com usePathname. Exige <Suspense> no
// layout que o renderiza (vercel:nextjs, suspense-boundaries): sem ele o hook
// faz a rota inteira cair em renderização no client.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { House, Plus, Scale, Settings, Wallet } from 'lucide-react'
import { NAVEGACAO } from '@/features/transacoes/copy'
import { cn } from '@/lib/utils'

const ITENS = [
  { href: '/inicio', rotulo: NAVEGACAO.inicio, Icone: House },
  { href: '/carteira', rotulo: NAVEGACAO.carteira, Icone: Wallet },
  { href: '/lancar', rotulo: NAVEGACAO.lancar, Icone: Plus },
  { href: '/acerto', rotulo: NAVEGACAO.acerto, Icone: Scale },
  { href: '/ajustes', rotulo: NAVEGACAO.ajustes, Icone: Settings },
] as const

export function NavegacaoInferior() {
  const caminho = usePathname()

  return (
    <nav
      aria-label={NAVEGACAO.rotuloDaBarra}
      className="bg-background/95 backdrop-blur-md border-border fixed bottom-0 inset-x-0 z-20 border-t pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="mx-auto flex h-16 max-w-[40rem] items-stretch">
        {ITENS.map(({ href, rotulo, Icone }) => {
          const ativo = caminho === href
          return (
            <li key={href} className="flex flex-1">
              <Link
                href={href}
                aria-current={ativo ? 'page' : undefined}
                className={cn(
                  'focus-visible:ring-ring flex min-h-[44px] flex-1 flex-col items-center justify-center gap-[var(--esp-1)] text-[length:var(--texto-apoio)] leading-[var(--texto-apoio-lh)] font-medium outline-none focus-visible:ring-3',
                  ativo ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                <Icone aria-hidden="true" className="size-5" />
                {rotulo}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
