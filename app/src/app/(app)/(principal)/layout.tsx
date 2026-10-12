import { Suspense } from 'react'
import { LogOut } from 'lucide-react'
import { sair } from '@/actions/auth'
import { NavegacaoInferior } from '@/components/navegacao/navegacao-inferior'
import { Button } from '@/components/ui/button'
import { APP } from '@/features/comum/copy'
import { NAVEGACAO } from '@/features/transacoes/copy'

/**
 * Moldura das telas do dia a dia: cabeçalho, conteúdo e navegação inferior.
 *
 * Server Component e ESTÁTICO: não lê sessão nem dado. Quem decide "tem
 * sessão? tem casa?" é cada page. O onboarding fica fora deste grupo de
 * propósito — quem ainda não tem casa não deve ver navegação para telas que
 * dependem dela.
 *
 * A navegação usa usePathname, então vai dentro de <Suspense> com fallback da
 * MESMA altura (h-16) para não haver salto de layout.
 */
export default function LayoutPrincipal({ children }: LayoutProps<'/'>) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-border border-b">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-[var(--esp-3)] px-[var(--esp-4)] py-[var(--esp-2)]">
          <p className="text-[length:var(--texto-subtitulo)] leading-[var(--texto-subtitulo-lh)] font-semibold">
            {APP.nome}
          </p>
          <form action={sair}>
            <Button type="submit" variant="ghost" size="toque">
              <LogOut aria-hidden="true" />
              {NAVEGACAO.sair}
            </Button>
          </form>
        </div>
      </header>

      <div className="flex flex-1 flex-col">{children}</div>

      <Suspense fallback={<div className="border-border h-16 border-t" />}>
        <NavegacaoInferior />
      </Suspense>
    </div>
  )
}
