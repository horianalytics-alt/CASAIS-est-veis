'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  House,
  Wallet,
  PlusCircle,
  Scale,
  PieChart,
  Settings,
  LogOut,
  HeartHandshake,
} from 'lucide-react'
import { sair } from '@/actions/auth'
import { BotaoOcultarValores } from '@/components/navegacao/botao-ocultar-valores'
import { Button } from '@/components/ui/button'
import { APP } from '@/features/comum/copy'
import { NAVEGACAO } from '@/features/transacoes/copy'
import { cn } from '@/lib/utils'

interface ItemLateral {
  href: string
  rotulo: string
  Icone: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>
  destaque?: boolean
}

const ITENS_LATERAL: readonly ItemLateral[] = [
  { href: '/inicio', rotulo: NAVEGACAO.inicio, Icone: House },
  { href: '/carteira', rotulo: NAVEGACAO.carteira, Icone: Wallet },
  { href: '/lancar', rotulo: NAVEGACAO.lancar, Icone: PlusCircle, destaque: true },
  { href: '/acerto', rotulo: NAVEGACAO.acerto, Icone: Scale },
  { href: '/analises', rotulo: 'Análises', Icone: PieChart },
  { href: '/ajustes', rotulo: NAVEGACAO.ajustes, Icone: Settings },
]

export function NavegacaoLateral() {
  const caminho = usePathname()

  return (
    <aside
      aria-label="Navegação lateral principal"
      className="hidden lg:flex w-64 flex-col justify-between border-r border-border bg-card/60 p-5 shrink-0 sticky top-0 h-screen select-none"
    >
      <div className="flex flex-col gap-6">
        {/* Marca / Topo */}
        <div className="flex items-center gap-3 px-2 py-1">
          <div className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-xl border border-primary/20 shadow-xs">
            <HeartHandshake className="size-5" aria-hidden="true" />
          </div>
          <div className="flex flex-col">
            <span className="text-foreground text-base font-bold tracking-tight">
              {APP.nome}
            </span>
            <span className="text-muted-foreground text-xs font-medium">
              Finanças do Casal
            </span>
          </div>
        </div>

        {/* Links de navegação */}
        <nav aria-label="Menu principal">
          <ul className="flex flex-col gap-1.5">
            {ITENS_LATERAL.map(({ href, rotulo, Icone, destaque }) => {
              const ativo = caminho === href || (href !== '/inicio' && caminho.startsWith(href))

              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={ativo ? 'page' : undefined}
                    className={cn(
                      'flex min-h-[44px] items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all duration-150 outline-none focus-visible:ring-3 focus-visible:ring-ring',
                      destaque && !ativo && 'bg-primary/10 text-primary font-semibold hover:bg-primary/15',
                      destaque && ativo && 'bg-primary text-primary-foreground font-semibold shadow-xs',
                      !destaque && ativo && 'bg-muted text-foreground font-semibold shadow-2xs',
                      !destaque && !ativo && 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                    )}
                  >
                    <Icone aria-hidden="true" className="size-4.5 shrink-0" />
                    <span>{rotulo}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
      </div>

      {/* Ações inferiores: Ocultar valores e Sair */}
      <div className="border-t border-border/80 pt-4 flex flex-col gap-2">
        <div className="flex items-center justify-between px-2">
          <span className="text-muted-foreground text-xs">Privacidade</span>
          <BotaoOcultarValores />
        </div>

        <form action={sair} className="w-full">
          <Button
            type="submit"
            variant="ghost"
            size="toque"
            className="w-full justify-start gap-3 px-3.5 text-muted-foreground hover:text-foreground"
          >
            <LogOut className="size-4" aria-hidden="true" />
            <span>{NAVEGACAO.sair}</span>
          </Button>
        </form>
      </div>
    </aside>
  )
}
