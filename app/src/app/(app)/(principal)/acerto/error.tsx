'use client'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { ACOES } from '@/features/comum/copy'
import { ACERTO } from '@/features/acerto/copy'

export default function ErroAcerto({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-[32rem] flex-1 flex-col gap-[var(--esp-4)] px-[var(--esp-4)] py-[var(--esp-8)]">
      <Alert variant="destructive">
        <AlertTitle>{ACERTO.titulo}</AlertTitle>
        <AlertDescription>{ACERTO.erroCarregar}</AlertDescription>
      </Alert>
      <Button size="toque" onClick={reset}>
        {ACOES.tentarDeNovo}
      </Button>
    </main>
  )
}
