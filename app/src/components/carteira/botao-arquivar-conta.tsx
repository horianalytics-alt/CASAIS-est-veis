'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Archive, ArchiveRestore } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { ResultadoAction } from '@/actions/resultado'
import { Button } from '@/components/ui/button'
import { CARTEIRA } from '@/features/carteira/copy'
import { tocarSomErro, tocarSomSucesso } from '@/features/sons/sons'

export interface BotaoArquivarContaProps {
  contaId: string
  estaArquivada: boolean
}

async function acaoArquivarConta(input: {
  id: string
  arquivar: boolean
}): Promise<ResultadoAction<void>> {
  const supabase = createClient()
  const { error } = await supabase
    .from('accounts')
    .update({ archived_at: input.arquivar ? new Date().toISOString() : null })
    .eq('id', input.id)
  if (error) return { ok: false, erro: error.message }
  return { ok: true, dados: undefined }
}

export function BotaoArquivarConta({
  contaId,
  estaArquivada,
}: BotaoArquivarContaProps) {
  const router = useRouter()
  const [pendente, iniciarTransicao] = React.useTransition()

  const alternarArquivamento = () => {
    iniciarTransicao(async () => {
      const res = await acaoArquivarConta({
        id: contaId,
        arquivar: !estaArquivada,
      })
      if (res.ok) {
        tocarSomSucesso()
        router.refresh()
      } else {
        tocarSomErro()
      }
    })
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
