import { Skeleton } from '@/components/ui/skeleton'

export default function LoadingAnalises() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-[var(--esp-6)] px-[var(--esp-4)] py-[var(--esp-6)]" aria-busy="true">
      <div className="flex items-center justify-between">
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-9 w-44" />
        <Skeleton className="h-9 w-32" />
      </div>

      <div className="grid gap-[var(--esp-6)] lg:grid-cols-2">
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>

      <Skeleton className="h-56 w-full rounded-xl" />

      <div className="grid gap-[var(--esp-6)] lg:grid-cols-2">
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    </main>
  )
}
