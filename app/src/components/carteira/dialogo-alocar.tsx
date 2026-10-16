'use client'

import * as React from 'react'
import { ArrowDownLeft, AlertCircle, PiggyBank } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatBRL, parseBRLInput } from '@/lib/format'
import { hapticFeedback } from '@/lib/haptics'
import type { CaixinhaInvestimento } from './tipos-investimentos'

export interface DadosAlocacao {
  caixinhaId: string
  valor: number
}

export interface DialogoAlocarProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  saldoNaoAlocadoCents: number
  caixinhas: CaixinhaInvestimento[]
  caixinhaPreSelecionadaId?: string | null
  onAlocar: (dados: DadosAlocacao) => Promise<void> | void
  pendente?: boolean
}

export function DialogoAlocar({
  aberto,
  onOpenChange,
  saldoNaoAlocadoCents,
  caixinhas,
  caixinhaPreSelecionadaId,
  onAlocar,
  pendente = false,
}: DialogoAlocarProps) {
  const [caixinhaId, setCaixinhaId] = React.useState<string>('')
  const [valorTexto, setValorTexto] = React.useState<string>('')
  const [erro, setErro] = React.useState<string | null>(null)

  const saldoNaoAlocadoReais = saldoNaoAlocadoCents / 100

  // Inicializa ao abrir
  React.useEffect(() => {
    if (aberto) {
      setCaixinhaId(caixinhaPreSelecionadaId ?? caixinhas[0]?.id ?? '')
      setValorTexto('')
      setErro(null)
    }
  }, [aberto, caixinhaPreSelecionadaId, caixinhas])

  const caixinhaSelecionada = caixinhas.find((c) => c.id === caixinhaId)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro(null)

    if (!caixinhaId) {
      setErro('Selecione uma caixinha de destino.')
      hapticFeedback.warning()
      return
    }

    const valorNumero = parseBRLInput(valorTexto)
    if (Number.isNaN(valorNumero) || valorNumero <= 0) {
      setErro('Informe um valor válido maior que zero.')
      hapticFeedback.warning()
      return
    }

    if (valorNumero > saldoNaoAlocadoReais) {
      setErro(
        `O valor (${formatBRL(valorNumero)}) é maior que o saldo não alocado disponível (${formatBRL(saldoNaoAlocadoReais)}).`,
      )
      hapticFeedback.warning()
      return
    }

    hapticFeedback.medium()
    try {
      await onAlocar({
        caixinhaId,
        valor: valorNumero,
      })
      hapticFeedback.success()
      onOpenChange(false)
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Erro ao alocar saldo na caixinha.')
      hapticFeedback.warning()
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
              <ArrowDownLeft className="size-4" />
            </div>
            <DialogTitle className="text-base font-semibold">
              Alocar Saldo em Caixinha
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Mova recursos do seu saldo não alocado para uma caixinha com rendimento estimado.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 py-2">
          {erro && (
            <div className="flex items-center gap-2 rounded-xl bg-destructive/10 border border-destructive/20 p-2.5 text-xs text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              <span>{erro}</span>
            </div>
          )}

          {/* Saldo Disponível para Alocação */}
          <div className="flex items-center justify-between rounded-xl bg-muted/40 p-3 border border-border/60">
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground font-medium">
                Saldo não alocado disponível
              </span>
              <span className="text-sm font-semibold text-foreground mt-0.5">
                {formatBRL(saldoNaoAlocadoReais)}
              </span>
            </div>
            {saldoNaoAlocadoReais > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  hapticFeedback.light()
                  setValorTexto(saldoNaoAlocadoReais.toFixed(2).replace('.', ','))
                }}
                className="h-7 text-xs rounded-lg"
              >
                Alocar tudo
              </Button>
            )}
          </div>

          {/* Caixinha de Destino */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="caixinha-destino" className="text-xs font-medium">
              Caixinha de destino
            </Label>
            <Select value={caixinhaId} onValueChange={setCaixinhaId}>
              <SelectTrigger id="caixinha-destino" className="h-9 text-xs rounded-xl">
                <SelectValue placeholder="Selecione a caixinha" />
              </SelectTrigger>
              <SelectContent>
                {caixinhas.map((cx) => (
                  <SelectItem key={cx.id} value={cx.id} className="text-xs">
                    <span className="font-semibold">{cx.name}</span>
                    <span className="text-muted-foreground ml-1.5">
                      (Saldo: {formatBRL(cx.balance_cents / 100)})
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Valor a Alocar */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="valor-alocar" className="text-xs font-medium">
              Valor a alocar
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">
                R$
              </span>
              <Input
                id="valor-alocar"
                type="text"
                inputMode="decimal"
                value={valorTexto}
                onChange={(e) => setValorTexto(e.target.value)}
                placeholder="0,00"
                className="h-9 pl-9 text-xs font-semibold rounded-xl"
                autoFocus
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={pendente}
              className="text-xs rounded-xl"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={pendente || saldoNaoAlocadoReais <= 0}
              className="text-xs rounded-xl gap-1.5"
            >
              <ArrowDownLeft className="size-3.5" />
              <span>{pendente ? 'Alocando...' : 'Confirmar Alocação'}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
