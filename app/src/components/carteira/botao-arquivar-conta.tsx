'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Archive, ArchiveRestore } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { CARTEIRA } from '@/features/carteira/copy'

export interface BotaoArquivarContaProps {
  contaId: string
  estaArquivada: boolean
}

export function BotaoArquivarConta({
  contaId,
  estaArquivada,
}: BotaoArquivarContaProps) {
  const router = useRouter()
  const [pendente, setPendente] = React.useState(false)

  const alternarArquivamento = async () => {
    setPendente(true)
    try {
      const supabase = createClient()
      const novoValor = estaArquivada ? null : new Date().toISOString()
      const { error } = await supabase
        .from('accounts')
        .update({ archived_at: novoValor })
        .eq('id', contaId)

      if (!error) {
        router.refresh()
      }
    } finally {
      setPendente(false)
    }
  }

  const rotulo = estaArquivada ? CARTEIRA.desarquivar : CARTEIRA.arquivar

  return (
    <Button
      type="button"
      variant="ghost"
      size="icone-toque"
      onClick={alternarArquivamento}
      disabled={pendente}
      aria-label={rotulo}
      title={rotulo}
      className="text-muted-foreground hover:text-foreground"
    >
      {estaArquivada ? (
        <ArchiveRestore className="size-4" aria-hidden="true" />
      ) : (
        <Archive className="size-4" aria-hidden="true" />
      )}
    </Button>
  )
}
