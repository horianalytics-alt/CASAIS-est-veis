'use client'

import * as React from 'react'
import {
  ArrowUpRight,
  AlertCircle,
  Lock,
  CheckCircle2,
  Wallet,
  PiggyBank,
  Sparkles,
} from 'lucide-react'
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
import { Badge } from '@/components/ui/badge'
import { formatBRL, parseBRLInput, isoToBR } from '@/lib/format'
import { hojeEmSaoPaulo } from '@/lib/hoje'
import { hapticFeedback } from '@/lib/haptics'
import type { CaixinhaInvestimento } from './tipos-investimentos'
import type { ContaOrigem } from './dialogo-aplicar'

export interface DadosResgate {
  caixinhaId: string
  valor: number
  destino: 'nao_alocado' | { contaId: string }
}

export interface DialogoResgatarProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  caixinha: CaixinhaInvestimento | null
  contasDestino: ContaOrigem[]
  onResgatar: (dados: DadosResgate) => Promise<{ ok: boolean; erro?: string } | void> | { ok: boolean; erro?: string } | void
  pendente?: boolean
}

export function DialogoResgatar({
  aberto,
  onOpenChange,
  caixinha,
  contasDestino,
  onResgatar,
  pendente = false,
}: DialogoResgatarProps) {
  const [valorTexto, setValorTexto] = React.useState<string>('')
  const [destinoTipo, setDestinoTipo] = React.useState<string>('nao_alocado')
  const [contaDestinoId, setContaDestinoId] = React.useState<string>('')
  const [erro, setErro] = React.useState<string | null>(null)
  const [sucessoCarimbo, setSucessoCarimbo] = React.useState(false)

  const hoje = hojeEmSaoPaulo()
  const bloqueadaPorCarencia = Boolean(
    caixinha &&
      !caixinha.resgate_imediato &&
      caixinha.data_vencimento &&
      caixinha.data_vencimento > hoje,
  )

  const saldoCaixinhaReais = caixinha ? caixinha.balance_cents / 100 : 0

  const abertoAnterior = React.useRef(false)

  // Reseta estado ao abrir (apenas na transição de false -> true)
  React.useEffect(() => {
    if (aberto && !abertoAnterior.current) {
      setValorTexto('')
      setDestinoTipo('nao_alocado')
      if (contasDestino.length > 0) {
        setContaDestinoId(contasDestino[0].id)
      }
      setErro(null)
      setSucessoCarimbo(false)
    }
    abertoAnterior.current = aberto
  }, [aberto, contasDestino])

  if (!caixinha) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro(null)

    if (bloqueadaPorCarencia) {
      setErro(
        `Esta caixinha está bloqueada para resgate até ${isoToBR(caixinha.data_vencimento!)}.`,
      )
      hapticFeedback.warning()
      return
    }

    const valorNumero = parseBRLInput(valorTexto)
    if (Number.isNaN(valorNumero) || valorNumero <= 0) {
      setErro('Informe um valor válido maior que zero.')
      hapticFeedback.warning()
      return
    }

    if (valorNumero > saldoCaixinhaReais) {
      setErro(
        `O valor (${formatBRL(valorNumero)}) é maior que o saldo acumulado na caixinha (${formatBRL(saldoCaixinhaReais)}).`,
      )
      hapticFeedback.warning()
      return
    }

    hapticFeedback.medium()
    try {
      const destino: DadosResgate['destino'] =
        destinoTipo === 'nao_alocado'
          ? 'nao_alocado'
          : { contaId: contaDestinoId }

      const resposta = await onResgatar({
        caixinhaId: caixinha.id,
        valor: valorNumero,
        destino,
      })
      if (resposta && typeof resposta === 'object' && 'ok' in resposta && !resposta.ok) {
        throw new Error(resposta.erro || 'Erro ao resgatar saldo da caixinha.')
      }

      setSucessoCarimbo(true)
      hapticFeedback.success()
      setTimeout(() => {
        onOpenChange(false)
      }, 1000)
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Erro ao resgatar saldo da caixinha.')
      hapticFeedback.warning()
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
              <ArrowUpRight className="size-4" />
            </div>
            <DialogTitle className="text-base font-semibold">
              Resgatar da Caixinha
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            {caixinha.name} · Resgate de saldo acumulado de volta para a carteira ou conta bancária.
          </DialogDescription>
        </DialogHeader>

        {sucessoCarimbo ? (
          <div className="flex flex-col items-center justify-center py-8 gap-3 animate-in fade-in zoom-in-95 duration-300">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 animate-carimbo shadow-lg">
              <CheckCircle2 className="size-8" />
            </div>
            <div className="text-center">
              <h4 className="text-sm font-semibold text-foreground">
                Resgate Concluído!
              </h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                O valor foi creditado no destino escolhido.
              </p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4 py-2">
            {erro && (
              <div className="flex items-center gap-2 rounded-xl bg-destructive/10 border border-destructive/20 p-2.5 text-xs text-destructive">
                <AlertCircle className="size-4 shrink-0" />
                <span>{erro}</span>
              </div>
            )}

            {/* Alerta de Carência / Bloqueio de Resgate */}
            {bloqueadaPorCarencia && (
              <div className="flex items-start gap-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 p-3 text-xs text-amber-700 dark:text-amber-400">
                <Lock className="size-4 shrink-0 mt-0.5" />
                <div className="flex flex-col gap-1">
                  <span className="font-semibold">Resgate Bloqueado por Carência</span>
                  <span className="text-[11px] leading-relaxed">
                    Esta caixinha possui carência contratada até{' '}
                    <strong>{isoToBR(caixinha.data_vencimento!)}</strong>. O resgate antecipado
                    não está disponível até a data de vencimento.
                  </span>
                </div>
              </div>
            )}

            {/* Saldo Acumulado na Caixinha */}
            <div className="flex items-center justify-between rounded-xl bg-muted/40 p-3 border border-border/60">
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground font-medium">
                  Saldo disponível na caixinha
                </span>
                <span className="text-sm font-semibold text-foreground mt-0.5">
                  {formatBRL(saldoCaixinhaReais)}
                </span>
              </div>
              {!bloqueadaPorCarencia && saldoCaixinhaReais > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    hapticFeedback.light()
                    setValorTexto(saldoCaixinhaReais.toFixed(2).replace('.', ','))
                  }}
                  className="h-7 text-xs rounded-lg"
                >
                  Resgatar tudo
                </Button>
              )}
            </div>

            {/* Valor a Resgatar */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="valor-resgatar" className="text-xs font-medium">
                Valor do resgate
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">
                  R$
                </span>
                <Input
                  id="valor-resgatar"
                  type="text"
                  inputMode="decimal"
                  value={valorTexto}
                  onChange={(e) => setValorTexto(e.target.value)}
                  placeholder="0,00"
                  disabled={bloqueadaPorCarencia}
                  className="h-9 pl-9 text-xs font-semibold rounded-xl"
                  autoFocus={!bloqueadaPorCarencia}
                />
              </div>
            </div>

            {/* Destino do Resgate */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="destino-resgate" className="text-xs font-medium">
                Destino do saldo resgatado
              </Label>
              <Select
                value={destinoTipo}
                onValueChange={setDestinoTipo}
                disabled={bloqueadaPorCarencia}
              >
                <SelectTrigger id="destino-resgate" className="h-9 text-xs rounded-xl">
                  <SelectValue placeholder="Selecione o destino" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nao_alocado" className="text-xs">
                    <span className="font-semibold text-foreground">Saldo não alocado da Carteira</span>
                    <span className="text-muted-foreground ml-1.5">(livre para realocar)</span>
                  </SelectItem>
                  {contasDestino.length > 0 && (
                    <SelectItem value="conta_bancaria" className="text-xs">
                      <span className="font-semibold text-foreground">Conta bancária</span>
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Seleção de Conta Bancária específica caso escolhida */}
            {destinoTipo === 'conta_bancaria' && (
              <div className="flex flex-col gap-1.5 animate-in fade-in duration-200">
                <Label htmlFor="conta-destino" className="text-xs font-medium">
                  Qual conta creditar?
                </Label>
                <Select
                  value={contaDestinoId}
                  onValueChange={setContaDestinoId}
                  disabled={bloqueadaPorCarencia}
                >
                  <SelectTrigger id="conta-destino" className="h-9 text-xs rounded-xl">
                    <SelectValue placeholder="Selecione a conta bancária" />
                  </SelectTrigger>
                  <SelectContent>
                    {contasDestino.map((conta) => (
                      <SelectItem key={conta.id} value={conta.id} className="text-xs">
                        {conta.name ?? 'Conta'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

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
                disabled={pendente || bloqueadaPorCarencia || saldoCaixinhaReais <= 0}
                className="text-xs rounded-xl gap-1.5"
              >
                <ArrowUpRight className="size-3.5" />
                <span>{pendente ? 'Resgatando...' : 'Confirmar Resgate'}</span>
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
