'use client'

import { Eye, EyeOff } from 'lucide-react'
import { useOcultarValores } from '@/components/providers/ocultar-valores-provider'
import { Button } from '@/components/ui/button'

export function BotaoOcultarValores({ mostrarRotulo = false }: { mostrarRotulo?: boolean }) {
  const { oculto, alternar } = useOcultarValores()

  if (mostrarRotulo) {
    return (
      <button
        type="button"
        onClick={alternar}
        aria-label={oculto ? 'Mostrar valores financeiros' : 'Ocultar valores financeiros'}
        title={oculto ? 'Mostrar valores' : 'Ocultar valores'}
        className="flex items-center justify-between w-full px-2.5 py-2 rounded-lg hover:bg-muted/60 transition-colors cursor-pointer group text-start"
      >
        <span className="text-muted-foreground group-hover:text-foreground text-xs font-medium transition-colors">
          Privacidade
        </span>
        <span className="text-muted-foreground group-hover:text-foreground transition-colors">
          {oculto ? (
            <EyeOff className="size-4" aria-hidden="true" />
          ) : (
            <Eye className="size-4" aria-hidden="true" />
          )}
        </span>
      </button>
    )
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icone-toque"
      onClick={alternar}
      aria-label={oculto ? 'Mostrar valores financeiros' : 'Ocultar valores financeiros'}
      title={oculto ? 'Mostrar valores' : 'Ocultar valores'}
      className="text-muted-foreground hover:text-foreground"
    >
      {oculto ? (
        <EyeOff className="size-5" aria-hidden="true" />
      ) : (
        <Eye className="size-5" aria-hidden="true" />
      )}
    </Button>
  )
}
