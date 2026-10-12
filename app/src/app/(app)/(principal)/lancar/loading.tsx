import { Skeleton } from '@/components/ui/skeleton'
import { CARREGANDO } from '@/features/comum/copy'

/**
 * Esqueleto de /lancar. Cada bloco tem a altura do campo real (44px de alvo
 * de toque). É também a fronteira de <Suspense> que mantém a casca estática.
 */
export default function CarregandoLancar() {
  return (
    <main
      aria-busy="true"
      className="mx-auto flex w-full max-w-[32rem] flex-1 flex-col gap-[var(--esp-6)] px-[var(--esp-4)] py-[var(--esp-6)]"
    >
      <p className="sr-only" role="status">
        {CARREGANDO.rotulo}
      </p>
      <Skeleton className="h-7 w-48" />
      <div className="flex flex-col gap-[var(--esp-4)]">
        <Skeleton className="h-[68px] w-full" />
        <Skeleton className="h-[68px] w-full" />
        <Skeleton className="h-[88px] w-full" />
        <Skeleton className="h-[68px] w-full" />
        <Skeleton className="h-[68px] w-full" />
        <Skeleton className="h-[68px] w-full" />
        <Skeleton className="h-[44px] w-full" />
        <Skeleton className="h-[44px] w-full" />
      </div>
    </main>
  )
}
