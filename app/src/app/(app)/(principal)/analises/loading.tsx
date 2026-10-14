import { Skeleton } from '@/components/ui/skeleton'

// Mesma largura (max-w-7xl) e mesma ordem de cards da página, com a altura do
// conteúdo final dos cards da Onda 2 (Dash), para não pular o layout.
export default function LoadingAnalises() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-[var(--esp-6)] px-[var(--esp-4)] py-[var(--esp-6)]" aria-busy="true">
      <div className="flex items-center justify-between">
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-9 w-44" />
        <Skeleton className="h-9 w-32" />
      </div>

      {/* Orçamento do mês: altura medida com 4 orçamentos (554px em 390, 342px em 1440) */}
      <Skeleton className="h-[554px] w-full rounded-xl lg:h-[342px]" />

      <div className="grid gap-[var(--esp-6)] xl:grid-cols-2">
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>

      <Skeleton className="h-56 w-full rounded-xl" />

      {/* Patrimônio: altura medida (578px em 390, 500px em 1440) */}
      <Skeleton className="h-[578px] w-full rounded-xl lg:h-[500px]" />

      <div className="grid gap-[var(--esp-6)] lg:grid-cols-2">
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    </main>
  )
}
