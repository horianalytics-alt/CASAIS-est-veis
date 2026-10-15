'use client'

import * as React from 'react'
import { Volume2, VolumeX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AJUSTES } from '@/features/ajustes/copy'
import {
  destravarAudio,
  lerPreferenciaSom,
  salvarPreferenciaSom,
  tocarSomSucesso,
} from '@/features/sons/sons'

export function AlternarSom() {
  const [ativo, setAtivo] = React.useState(true)

  React.useEffect(() => {
    setAtivo(lerPreferenciaSom())
  }, [])

  const alternar = () => {
    const novo = !ativo
    setAtivo(novo)
    salvarPreferenciaSom(novo)
    if (novo) {
      // O ouvinte global rodou ANTES deste clique, com o som ainda desligado,
      // e por isso não destravou nada. Destrava aqui, ainda dentro do gesto.
      destravarAudio()
      tocarSomSucesso()
    }
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <div className="bg-muted text-foreground flex size-9 items-center justify-center rounded-lg border border-border">
          {ativo ? (
            <Volume2 className="size-4.5" aria-hidden="true" />
          ) : (
            <VolumeX className="size-4.5 text-muted-foreground" aria-hidden="true" />
          )}
        </div>
        <div className="flex flex-col">
          <span className="text-foreground text-sm font-semibold">
            {AJUSTES.sonsTitulo}
          </span>
          <span className="text-muted-foreground text-xs">
            {AJUSTES.sonsDica}
          </span>
        </div>
      </div>

      <Button
        type="button"
        variant={ativo ? 'default' : 'outline'}
        size="toque"
        role="switch"
        aria-checked={ativo}
        onClick={alternar}
        className="gap-2 shrink-0"
      >
        {ativo ? (
          <>
            <Volume2 className="size-4" aria-hidden="true" />
            {AJUSTES.sonsAtivo}
          </>
        ) : (
          <>
            <VolumeX className="size-4" aria-hidden="true" />
            {AJUSTES.sonsInativo}
          </>
        )}
      </Button>
    </div>
  )
}
