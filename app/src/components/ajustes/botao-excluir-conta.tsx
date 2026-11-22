'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, AlertTriangle, Loader2 } from 'lucide-react'
import { excluirConta } from '@/actions/contas'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { tocarSomErro, tocarSomSucesso } from '@/features/sons/sons'

export interface BotaoExcluirContaProps {
  contaId: string
  nomeDaConta: string
}

export function BotaoExcluirConta({ contaId, nomeDaConta }: BotaoExcluirContaProps) {
  const router = useRouter()
  const [aberto, setAberto] = React.useState(false)
  const [pendente, iniciarTransicao] = React.useTransition()
  const [erroExclusao, setErroExclusao] = React.useState<string | null>(null)

  const confirmarExclusao = () => {
    setErroExclusao(null)
    iniciarTransicao(async () => {
      const res = await excluirConta({ id: contaId })
      if (res.ok) {
        tocarSomSucesso()
        setAberto(false)
        router.refresh()
      } else {
        tocarSomErro()
        setErroExclusao(res.erro)
      }
    })
  }

  return (
    <Dialog
      open={aberto}
      onOpenChange={(novo) => {
        setAberto(novo)
        if (!novo) setErroExclusao(null)
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icone-toque"
          aria-label={`Excluir conta ${nomeDaConta}`}
          title="Excluir conta permanentemente"
          className="text-muted-foreground hover:text-destructive"
          disabled={pendente}
        >
          {pendente ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Trash2 className="size-4" aria-hidden="true" />
          )}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive border border-destructive/20">
              <AlertTriangle className="size-4" aria-hidden="true" />
            </div>
            <DialogTitle>Excluir &quot;{nomeDaConta}&quot;?</DialogTitle>
          </div>
          <DialogDescription className="text-sm">
            Esta ação é permanente e não pode ser desfeita. A conta será removida do sistema.
            {erroExclusao && (
              <span
                role="alert"
                className="mt-2 block rounded-lg border border-destructive/30 bg-destructive/5 p-2.5 text-destructive text-xs"
              >
                {erroExclusao}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setAberto(false)
              setErroExclusao(null)
            }}
            disabled={pendente}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={confirmarExclusao}
            disabled={pendente}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {pendente ? 'Excluindo…' : 'Excluir permanentemente'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
