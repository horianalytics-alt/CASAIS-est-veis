'use client'

import { Eye, EyeOff } from 'lucide-react'
import { useOcultarValores } from '@/components/providers/ocultar-valores-provider'
import { Button } from '@/components/ui/button'

export function BotaoOcultarValores() {
  const { oculto, alternar } = useOcultarValores()

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
