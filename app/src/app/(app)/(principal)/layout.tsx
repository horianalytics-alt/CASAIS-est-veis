import { Suspense } from 'react'
import { LogOut } from 'lucide-react'
import { sair } from '@/actions/auth'
import { NavegacaoInferior } from '@/components/navegacao/navegacao-inferior'
import { NavegacaoLateral } from '@/components/navegacao/navegacao-lateral'
import { BarraProgresso } from '@/components/navegacao/barra-progresso'
import { BotaoOcultarValores } from '@/components/navegacao/botao-ocultar-valores'
import { OcultarValoresProvider } from '@/components/providers/ocultar-valores-provider'
import { Button } from '@/components/ui/button'
import { PullToRefresh } from '@/components/ui/pull-to-refresh'
import { APP } from '@/features/comum/copy'
import { NAVEGACAO } from '@/features/transacoes/copy'

/**
 * Moldura das telas do dia a dia: cabeçalho, conteúdo e navegação responsiva.
 *
 * Responsividade por classe:
 * - Mobile / Tablet (< 1024px): Barra inferior fixa com safe-area + cabeçalho móvel.
 * - Desktop / PC (>= 1024px / lg:): Barra lateral permanente à esquerda, sem barra inferior.
 *
 * Server Component e ESTÁTICO: não lê sessão nem dado.
 */
export default function LayoutPrincipal({ children }: LayoutProps<'/'>) {
  return (
    <OcultarValoresProvider>
      <Suspense fallback={null}>
        <BarraProgresso />
      </Suspense>
      <div className="flex min-h-screen flex-col lg:flex-row">
      {/* Barra Lateral Permanente para Desktop (>= 1024px) */}
      <Suspense fallback={<div className="hidden lg:flex w-64 border-r border-border" />}>
        <NavegacaoLateral />
      </Suspense>

      {/* Área Principal de Conteúdo */}
      <div className="flex flex-1 flex-col min-w-0 pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-8">
        {/* Cabeçalho exclusivo para Mobile e Tablet (< 1024px) */}
        <header className="border-border border-b lg:hidden">
          <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-[var(--esp-3)] px-[var(--esp-4)] py-[var(--esp-2)]">
            <p className="text-[length:var(--texto-subtitulo)] leading-[var(--texto-subtitulo-lh)] font-semibold">
              {APP.nome}
            </p>
            <div className="flex items-center gap-[var(--esp-1)]">
              <BotaoOcultarValores />
              <form action={sair}>
                <Button type="submit" variant="ghost" size="toque">
                  <LogOut aria-hidden="true" />
                  {NAVEGACAO.sair}
                </Button>
              </form>
            </div>
          </div>
        </header>

        {/* Conteúdo da Rota com Pull to Refresh */}
        <PullToRefresh className="flex flex-1 flex-col">{children}</PullToRefresh>
      </div>

      {/* Navegação Inferior Fixa para Mobile e Tablet (< 1024px) */}
      <Suspense fallback={<div className="border-border fixed bottom-0 inset-x-0 z-20 h-16 border-t pb-[env(safe-area-inset-bottom)] lg:hidden" />}>
        <NavegacaoInferior />
      </Suspense>
      </div>
    </OcultarValoresProvider>
  )
}
