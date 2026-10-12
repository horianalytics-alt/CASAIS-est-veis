'use client'

// 'use client' é exigência do framework: error.tsx é sempre Client Component.

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { ACOES } from '@/features/comum/copy'
import { ERRO_INICIO } from '@/features/transacoes/copy'

export default function ErroInicio({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-[32rem] flex-1 flex-col gap-[var(--esp-4)] px-[var(--esp-4)] py-[var(--esp-8)]">
      <Alert variant="destructive">
        <AlertTitle>{ERRO_INICIO.titulo}</AlertTitle>
        <AlertDescription>{ERRO_INICIO.descricao}</AlertDescription>
      </Alert>
      <Button size="toque" onClick={reset}>
        {ACOES.tentarDeNovo}
      </Button>
    </main>
  )
}
