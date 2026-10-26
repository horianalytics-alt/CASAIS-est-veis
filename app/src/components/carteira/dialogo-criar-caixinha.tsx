'use client'

import * as React from 'react'
import { PiggyBank, Sparkles, AlertCircle, Info, Calendar } from 'lucide-react'
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
import { hapticFeedback } from '@/lib/haptics'
import { hojeEmSaoPaulo } from '@/lib/hoje'
import {
  type TipoRendimento,
  ROTULOS_TIPO_RENDIMENTO,
} from './tipos-investimentos'

export interface DadosNovaCaixinha {
  nome: string
  tipoRendimento: TipoRendimento
  taxaMensalBps: number
  resgateImediato: boolean
  dataVencimento?: string | null
}

export interface DialogoCriarCaixinhaProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  onSalvar: (dados: DadosNovaCaixinha) => Promise<{ ok: boolean; erro?: string } | void> | { ok: boolean; erro?: string } | void
  pendente?: boolean
}

export function DialogoCriarCaixinha({
  aberto,
  onOpenChange,
  onSalvar,
  pendente = false,
}: DialogoCriarCaixinhaProps) {
  const [nome, setNome] = React.useState('')
  const [tipoRendimento, setTipoRendimento] = React.useState<TipoRendimento>('liquidez_diaria')
  const [taxaString, setTaxaString] = React.useState('1,05')
  const [resgateImediato, setResgateImediato] = React.useState(true)
  const [dataVencimento, setDataVencimento] = React.useState('')
  const [erro, setErro] = React.useState<string | null>(null)

  const abertoAnterior = React.useRef(false)

  // Reseta campos ao abrir (apenas na transição de false -> true)
  React.useEffect(() => {
    if (aberto && !abertoAnterior.current) {
      setNome('')
      setTipoRendimento('liquidez_diaria')
      setTaxaString('1,05')
      setResgateImediato(true)
      setDataVencimento('')
      setErro(null)
    }
    abertoAnterior.current = aberto
  }, [aberto])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro(null)

    const nomeLimpo = nome.trim()
    if (!nomeLimpo) {
      setErro('Informe um nome para a caixinha.')
      hapticFeedback.warning()
      return
    }

    const taxaNumero = Number.parseFloat(taxaString.replace(',', '.'))
    if (Number.isNaN(taxaNumero) || taxaNumero < 0 || taxaNumero > 100) {
      setErro('Informe uma taxa mensal válida (ex: 1,05).')
      hapticFeedback.warning()
      return
    }

    const taxaMensalBps = Math.round(taxaNumero * 100)

    if (!resgateImediato) {
      if (!dataVencimento) {
        setErro('Informe a data de vencimento da caixinha.')
        hapticFeedback.warning()
        return
      }
      if (dataVencimento < '2000-01-01' || dataVencimento > '2100-12-31') {
        setErro('Data de vencimento inválida.')
        hapticFeedback.warning()
        return
      }
    }

    hapticFeedback.medium()
    try {
      const resposta = await onSalvar({
        nome: nomeLimpo,
        tipoRendimento,
        taxaMensalBps,
        resgateImediato,
        dataVencimento: resgateImediato ? null : dataVencimento,
      })
      if (resposta && typeof resposta === 'object' && 'ok' in resposta && !resposta.ok) {
        throw new Error(resposta.erro || 'Erro ao criar caixinha.')
      }
      hapticFeedback.success()
      onOpenChange(false)
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Erro ao criar caixinha.')
      hapticFeedback.warning()
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
              <PiggyBank className="size-4" />
            </div>
            <DialogTitle className="text-base font-semibold">
              Criar Caixinha
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Defina uma caixinha com taxa de rendimento estimada para acompanhar seus investimentos.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 py-2">
          {erro && (
            <div className="flex items-center gap-2 rounded-xl bg-destructive/10 border border-destructive/20 p-2.5 text-xs text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              <span>{erro}</span>
            </div>
          )}

          {/* Nome da Caixinha */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nome-caixinha" className="text-xs font-medium">
              Nome da caixinha
            </Label>
            <Input
              id="nome-caixinha"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="ex: Reserva de Emergência, Férias 2027"
              maxLength={60}
              className="h-9 text-xs rounded-xl"
              autoFocus
            />
          </div>

          {/* Tipo de Rendimento */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tipo-rendimento" className="text-xs font-medium">
              Tipo de rendimento
            </Label>
            <Select
              value={tipoRendimento}
              onValueChange={(val) => setTipoRendimento(val as TipoRendimento)}
            >
              <SelectTrigger id="tipo-rendimento" className="h-9 text-xs rounded-xl">
                <SelectValue placeholder="Selecione o tipo" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(ROTULOS_TIPO_RENDIMENTO).map(([key, label]) => (
                  <SelectItem key={key} value={key} className="text-xs">
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Taxa Estimada Mensal */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="taxa-estimada" className="text-xs font-medium">
                Taxa estimada (% ao mês)
              </Label>
              <span className="text-[11px] text-muted-foreground">Ex: 1,05%</span>
            </div>
            <Input
              id="taxa-estimada"
              type="text"
              value={taxaString}
              onChange={(e) => setTaxaString(e.target.value)}
              placeholder="1,05"
              className="h-9 text-xs rounded-xl"
            />
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/80 mt-0.5">
              <Info className="size-3 shrink-0" />
              <span>A taxa é informada manualmente por você e serve para simulação de rendimento.</span>
            </div>
          </div>

          {/* Regra de Resgate (Liquidez vs Vencimento) */}
          <div className="flex flex-col gap-2 pt-1 border-t border-border/60">
            <Label className="text-xs font-medium">Disponibilidade para resgate</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  hapticFeedback.selection()
                  setResgateImediato(true)
                }}
                className={`p-2.5 rounded-xl border text-xs font-medium text-left transition-all ${
                  resgateImediato
                    ? 'border-primary bg-primary/10 text-foreground ring-1 ring-primary'
                    : 'border-border/80 bg-muted/30 text-muted-foreground hover:text-foreground'
                }`}
              >
                <div className="font-semibold text-foreground">Resgate imediato</div>
                <div className="text-[11px] text-muted-foreground">Livre a qualquer momento</div>
              </button>

              <button
                type="button"
                onClick={() => {
                  hapticFeedback.selection()
                  setResgateImediato(false)
                }}
                className={`p-2.5 rounded-xl border text-xs font-medium text-left transition-all ${
                  !resgateImediato
                    ? 'border-primary bg-primary/10 text-foreground ring-1 ring-primary'
                    : 'border-border/80 bg-muted/30 text-muted-foreground hover:text-foreground'
                }`}
              >
                <div className="font-semibold text-foreground">No vencimento</div>
                <div className="text-[11px] text-muted-foreground">Com prazo de carência</div>
              </button>
            </div>
          </div>

          {/* Data de Vencimento se não for imediato */}
          {!resgateImediato && (
            <div className="flex flex-col gap-1.5 animate-in fade-in duration-200">
              <Label htmlFor="data-vencimento" className="text-xs font-medium">
                Data de vencimento / carência
              </Label>
              <Input
                id="data-vencimento"
                type="date"
                value={dataVencimento}
                onChange={(e) => setDataVencimento(e.target.value)}
                min="2000-01-01"
                max="2100-12-31"
                className="h-9 text-xs rounded-xl"
              />
              <span className="text-[11px] text-muted-foreground">
                O saldo ficará bloqueado para resgate até esta data.
              </span>
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
              disabled={pendente}
              className="text-xs rounded-xl gap-1.5"
            >
              <PiggyBank className="size-3.5" />
              <span>{pendente ? 'Criando...' : 'Criar Caixinha'}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
