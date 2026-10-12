import { APP } from '@/features/comum/copy'

/**
 * Moldura das telas de autenticação: cartão centrado, sem navegação inferior.
 * Server Component — não tem estado nem evento.
 */
export default function LayoutAuth({ children }: LayoutProps<'/'>) {
  return (
    <main className="flex flex-1 items-center justify-center px-[var(--esp-4)] py-[var(--esp-8)]">
      <div className="w-full max-w-[26rem] flex flex-col gap-[var(--esp-6)]">
        <header className="flex flex-col gap-[var(--esp-1)]">
          {/* O nome do app é o rótulo acessível da marca no topo (handoff 4.4). */}
          <h1 className="text-[length:var(--texto-titulo)] leading-[var(--texto-titulo-lh)] font-semibold">
            {APP.nome}
          </h1>
        </header>
        {children}
      </div>
    </main>
  )
}
