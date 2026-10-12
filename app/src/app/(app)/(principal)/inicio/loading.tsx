import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { CARREGANDO } from '@/features/comum/copy'

/**
 * Esqueleto de /inicio, com a estrutura e as alturas da tela final: seletor de
 * mês (44px), resumo, contas e lista. É também a fronteira de <Suspense> que
 * mantém a casca da rota estática.
 */
export default function CarregandoInicio() {
  return (
    <main
      aria-busy="true"
      className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-[var(--esp-6)] px-[var(--esp-4)] py-[var(--esp-6)]"
    >
      <p className="sr-only" role="status">
        {CARREGANDO.rotulo}
      </p>
      <div className="flex items-center justify-between gap-[var(--esp-3)]">
        <Skeleton className="size-[44px]" />
        <Skeleton className="h-7 w-48" />
        <Skeleton className="size-[44px]" />
      </div>

      <div className="grid gap-[var(--esp-6)] lg:grid-cols-[22rem_1fr] lg:items-start">
        <div className="flex flex-col gap-[var(--esp-6)]">
          <Card>
            <CardContent>
              <Skeleton className="h-[320px] w-full" />
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <Skeleton className="h-[160px] w-full" />
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardContent>
            <Skeleton className="h-[480px] w-full" />
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
