'use client'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { ACOES } from '@/features/comum/copy'
import { AJUSTES } from '@/features/ajustes/copy'

export default function ErroAjustes({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-[32rem] flex-1 flex-col gap-[var(--esp-4)] px-[var(--esp-4)] py-[var(--esp-8)]">
      <Alert variant="destructive">
        <AlertTitle>{AJUSTES.titulo}</AlertTitle>
        <AlertDescription>Não foi possível carregar as configurações. Tente de novo.</AlertDescription>
      </Alert>
      <Button size="toque" onClick={reset}>
        {ACOES.tentarDeNovo}
      </Button>
    </main>
  )
}
