'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Archive, ArchiveRestore } from 'lucide-react'
import { arquivarConta } from '@/actions/contas'
import { Button } from '@/components/ui/button'
import { CARTEIRA } from '@/features/carteira/copy'
import { tocarSomErro, tocarSomSucesso } from '@/features/sons/sons'

export interface BotaoArquivarContaProps {
  contaId: string
  estaArquivada: boolean
}

export function BotaoArquivarConta({
  contaId,
  estaArquivada,
}: BotaoArquivarContaProps) {
  const router = useRouter()
  const [pendente, iniciarTransicao] = React.useTransition()

  const alternarArquivamento = () => {
    iniciarTransicao(async () => {
      const res = await arquivarConta({
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
