'use client'

import * as React from 'react'
import { PlusCircle, AlertCircle, ArrowUpRight, Wallet, Check } from 'lucide-react'
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

export interface ContaOrigem {
  id: string
  name: string | null
  current_balance: number | null
}

export interface DadosAplicacao {
  contaOrigemId: string
  valor: number
  caixinhaId?: string // Omitido = vai para o saldo não alocado
}

export interface DialogoAplicarProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  contasOrigem: ContaOrigem[]
  caixinhas: CaixinhaInvestimento[]
  caixinhaPreSelecionadaId?: string | null
  onAplicar: (dados: DadosAplicacao) => Promise<void> | void
  pendente?: boolean
}

export function DialogoAplicar({
  aberto,
  onOpenChange,
  contasOrigem,
  caixinhas,
  caixinhaPreSelecionadaId,
  onAplicar,
  pendente = false,
}: DialogoAplicarProps) {
  const [contaOrigemId, setContaOrigemId] = React.useState<string>('')
  const [valorTexto, setValorTexto] = React.useState<string>('')
  const [destinoId, setDestinoId] = React.useState<string>('nao_alocado')
  const [erro, setErro] = React.useState<string | null>(null)

  // Inicializa campos ao abrir
  React.useEffect(() => {
    if (aberto) {
      if (contasOrigem.length > 0 && !contaOrigemId) {
        setContaOrigemId(contasOrigem[0].id)
      }
      setDestinoId(caixinhaPreSelecionadaId ?? 'nao_alocado')
      setValorTexto('')
      setErro(null)
    }
  }, [aberto, contasOrigem, caixinhaPreSelecionadaId, contaOrigemId])

  const contaSelecionada = contasOrigem.find((c) => c.id === contaOrigemId)
  const saldoOrigem = contaSelecionada?.current_balance ?? 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro(null)

    if (!contaOrigemId) {
      setErro('Selecione uma conta de origem.')
      hapticFeedback.warning()
      return
    }

    const valorNumero = parseBRLInput(valorTexto)
    if (Number.isNaN(valorNumero) || valorNumero <= 0) {
      setErro('Informe um valor válido maior que zero.')
      hapticFeedback.warning()
      return
    }

    if (valorNumero > saldoOrigem) {
      setErro(
        `O valor informado (${formatBRL(valorNumero)}) é maior que o saldo disponível na conta (${formatBRL(saldoOrigem)}).`,
      )
      hapticFeedback.warning()
      return
    }

    hapticFeedback.medium()
    try {
      await onAplicar({
        contaOrigemId,
        valor: valorNumero,
        caixinhaId: destinoId === 'nao_alocado' ? undefined : destinoId,
      })
      hapticFeedback.success()
      onOpenChange(false)
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Erro ao aplicar valor na carteira.')
      hapticFeedback.warning()
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
              <PlusCircle className="size-4" />
            </div>
            <DialogTitle className="text-base font-semibold">
              Aplicar na Carteira de Investimento
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Debita uma de suas contas bancárias e aplica o saldo na carteira ou diretamente em uma caixinha.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 py-2">
          {erro && (
            <div className="flex items-center gap-2 rounded-xl bg-destructive/10 border border-destructive/20 p-2.5 text-xs text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              <span>{erro}</span>
            </div>
          )}

          {/* Conta de Origem */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="conta-origem" className="text-xs font-medium">
              Conta de origem (onde o dinheiro está)
            </Label>
            <Select value={contaOrigemId} onValueChange={setContaOrigemId}>
              <SelectTrigger id="conta-origem" className="h-9 text-xs rounded-xl">
                <SelectValue placeholder="Selecione a conta" />
              </SelectTrigger>
              <SelectContent>
                {contasOrigem.map((conta) => (
                  <SelectItem key={conta.id} value={conta.id} className="text-xs">
                    <span className="font-medium">{conta.name ?? 'Conta'}</span>
                    <span className="text-muted-foreground ml-1.5">
                      ({formatBRL(conta.current_balance ?? 0)})
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Valor a Aplicar */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="valor-aplicar" className="text-xs font-medium">
                Valor da aplicação
              </Label>
              {saldoOrigem > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    hapticFeedback.light()
                    setValorTexto(saldoOrigem.toFixed(2).replace('.', ','))
                  }}
                  className="text-[11px] text-primary hover:underline font-medium"
                >
                  Usar saldo total ({formatBRL(saldoOrigem)})
                </button>
              )}
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">
                R$
              </span>
              <Input
                id="valor-aplicar"
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

          {/* Destino da Aplicação */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="destino-aplicacao" className="text-xs font-medium">
              Destino do valor aplicado
            </Label>
            <Select value={destinoId} onValueChange={setDestinoId}>
              <SelectTrigger id="destino-aplicacao" className="h-9 text-xs rounded-xl">
                <SelectValue placeholder="Selecione o destino" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nao_alocado" className="text-xs">
                  <span className="font-semibold text-foreground">Saldo não alocado</span>
                  <span className="text-muted-foreground ml-1.5">(alocar depois)</span>
                </SelectItem>
                {caixinhas.map((cx) => (
                  <SelectItem key={cx.id} value={cx.id} className="text-xs">
                    <span>Caixinha: </span>
                    <span className="font-semibold text-foreground">{cx.name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
              disabled={pendente}
              className="text-xs rounded-xl gap-1.5"
            >
              <ArrowUpRight className="size-3.5" />
              <span>{pendente ? 'Aplicando...' : 'Confirmar Aplicação'}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
