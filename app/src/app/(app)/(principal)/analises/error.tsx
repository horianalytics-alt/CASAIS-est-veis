'use client'

import { useEffect } from 'react'
import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function ErrorAnalises({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Falha em /analises:', error)
  }, [error])

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-[var(--esp-4)] p-[var(--esp-6)] text-center">
      <div className="bg-destructive/10 text-destructive flex size-12 items-center justify-center rounded-full">
        <AlertCircle className="size-6" aria-hidden="true" />
      </div>
      <div className="flex flex-col gap-[var(--esp-1)]">
        <h1 className="text-[length:var(--texto-subtitulo)] font-semibold">
          Não foi possível carregar as análises
        </h1>
        <p className="text-muted-foreground text-[length:var(--texto-apoio)]">
          Ocorreu um problema ao processar os gráficos e indicadores.
        </p>
      </div>
      <Button onClick={reset} size="toque">
        Tentar novamente
      </Button>
    </main>
  )
}
