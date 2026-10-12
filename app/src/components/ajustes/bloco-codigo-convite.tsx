'use client'

import * as React from 'react'
import { Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AJUSTES_FAMILIA } from '@/features/ajustes/copy'

export function BlocoCodigoConvite({ codigo }: { codigo: string }) {
  const [copiado, setCopiado] = React.useState(false)

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(codigo)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      /* fallback se permissão negada */
    }
  }

  return (
    <div className="bg-card border-border/80 flex flex-col items-center justify-between gap-4 rounded-xl border p-5 sm:flex-row">
      <div className="flex flex-col text-center sm:text-left">
        <span className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
          {AJUSTES_FAMILIA.codigoConvite}
        </span>
        <span className="num-tabular font-mono text-3xl font-bold tracking-[0.25em] text-foreground">
          {codigo}
        </span>
        <span className="text-muted-foreground mt-1 text-xs">
          {AJUSTES_FAMILIA.codigoDica}
        </span>
      </div>

      <Button
        type="button"
        variant={copiado ? 'secondary' : 'default'}
        size="toque"
        onClick={copiar}
        className="gap-2 shrink-0 w-full sm:w-auto"
      >
        {copiado ? (
          <>
            <Check className="size-4 text-receita" aria-hidden="true" />
            {AJUSTES_FAMILIA.codigoCopiado}
          </>
        ) : (
          <>
            <Copy className="size-4" aria-hidden="true" />
            {AJUSTES_FAMILIA.copiarCodigo}
          </>
        )}
      </Button>
    </div>
  )
}
