'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Check, Loader2, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { parseBRLInput, todayISO } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Database } from '@/types/database'

type Transacao = Database['public']['Tables']['transactions']['Row']

export interface ItemSelectOpcao {
  id: string
  name: string
}

export interface MembroOpcao {
  id: string
  display_name: string
}

export interface DialogoEditarLancamentoProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  transacao: Transacao | null
  contas: ItemSelectOpcao[]
  categorias: ItemSelectOpcao[]
  membros: MembroOpcao[]
  onSalvo?: () => void
}

export function DialogoEditarLancamento({
  aberto,
  onOpenChange,
  transacao,
  contas,
  categorias,
  membros,
  onSalvo,
}: DialogoEditarLancamentoProps) {
  const router = useRouter()
  const [pendente, setPendente] = React.useState(false)
  const [erro, setErro] = React.useState<string | null>(null)

  // Estados do formulário
  const [tipo, setTipo] = React.useState<'despesa' | 'receita' | 'transferencia'>('despesa')
  const [descricao, setDescricao] = React.useState('')
  const [valorTexto, setValorTexto] = React.useState('')
  const [data, setData] = React.useState(todayISO())
  const [contaId, setContaId] = React.useState('')
  const [categoriaId, setCategoriaId] = React.useState<string>('')
  const [membroId, setMembroId] = React.useState('')
  const [estaPago, setEstaPago] = React.useState(false)
  const [dataPagamento, setDataPagamento] = React.useState(todayISO())
  const [observacao, setObservacao] = React.useState('')

  // Preenche dados ao abrir com a transação
  React.useEffect(() => {
    if (transacao && aberto) {
      setTipo((transacao.type as 'despesa' | 'receita' | 'transferencia') ?? 'despesa')
      setDescricao(transacao.description || '')
      setValorTexto(
        transacao.amount
          ? transacao.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
          : '',
      )
      setData(transacao.date || todayISO())
      setContaId(transacao.account_id || contas[0]?.id || '')
      setCategoriaId(transacao.category_id || '')
      setMembroId(transacao.paid_by_member_id || membros[0]?.id || '')
      setEstaPago(Boolean(transacao.is_paid))
      setDataPagamento(transacao.paid_date || transacao.date || todayISO())
      setObservacao(transacao.notes || '')
      setErro(null)
    }
  }, [transacao, aberto, contas, membros])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!transacao) return

    setErro(null)

    const descLimpa = descricao.trim()
    if (!descLimpa) {
      setErro('Informe a descrição do lançamento.')
      return
    }

    const valorNumero = parseBRLInput(valorTexto)
    if (Number.isNaN(valorNumero) || valorNumero <= 0) {
      setErro('Informe um valor válido e maior que zero.')
      return
    }

    if (!contaId) {
      setErro('Selecione uma conta.')
      return
    }

    if (!membroId) {
      setErro('Selecione quem realizou o pagamento.')
      return
    }

    if (estaPago && !dataPagamento) {
      setErro('Informe a data em que foi pago.')
      return
    }

    setPendente(true)

    try {
      const supabase = createClient()
      const { error: erroUpdate } = await supabase
        .from('transactions')
        .update({
          type: tipo,
          description: descLimpa,
          amount: Math.round(valorNumero * 100) / 100,
          date: data,
          account_id: contaId,
          category_id: tipo === 'transferencia' ? null : categoriaId || null,
          paid_by_member_id: membroId,
          is_paid: estaPago,
          paid_date: estaPago ? dataPagamento : null,
          notes: observacao.trim() || null,
        })
        .eq('id', transacao.id)

      if (erroUpdate) {
        setErro(erroUpdate.message || 'Erro ao atualizar lançamento.')
        setPendente(false)
        return
      }

      setPendente(false)
      onOpenChange(false)
      onSalvo?.()
      router.refresh()
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Erro inesperado ao salvar alterações.')
      setPendente(false)
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20">
              <Pencil className="size-4" aria-hidden="true" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">Editar lançamento</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Altere os campos necessários e confirme as modificações.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {erro && (
          <Alert variant="destructive" className="py-2.5">
            <AlertCircle className="size-4" />
            <AlertDescription className="text-xs">{erro}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 py-1 text-xs">
          {/* 1. Tipo de Lançamento */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium">Tipo</Label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setTipo('despesa')}
                className={cn(
                  'py-2 px-3 rounded-lg border font-semibold text-center transition-all',
                  tipo === 'despesa'
                    ? 'border-despesa/40 bg-despesa/10 text-despesa shadow-2xs font-bold'
                    : 'border-border/70 hover:bg-muted/50 text-muted-foreground',
                )}
              >
                Despesa
              </button>
              <button
                type="button"
                onClick={() => setTipo('receita')}
                className={cn(
                  'py-2 px-3 rounded-lg border font-semibold text-center transition-all',
                  tipo === 'receita'
                    ? 'border-receita/40 bg-receita/10 text-receita shadow-2xs font-bold'
                    : 'border-border/70 hover:bg-muted/50 text-muted-foreground',
                )}
              >
                Receita
              </button>
              <button
                type="button"
                onClick={() => setTipo('transferencia')}
                className={cn(
                  'py-2 px-3 rounded-lg border font-semibold text-center transition-all',
                  tipo === 'transferencia'
                    ? 'border-transferencia/40 bg-transferencia/10 text-transferencia shadow-2xs font-bold'
                    : 'border-border/70 hover:bg-muted/50 text-muted-foreground',
                )}
              >
                Transferência
              </button>
            </div>
          </div>

          {/* 2. Descrição */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-descricao" className="text-xs font-medium">
              Descrição
            </Label>
            <Input
              id="edit-descricao"
              type="text"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex: Mercado Semanal"
              maxLength={120}
              required
              className="h-9 text-xs"
            />
          </div>

          {/* 3. Valor e Data */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-valor" className="text-xs font-medium">
                Valor (R$)
              </Label>
              <Input
                id="edit-valor"
                type="text"
                value={valorTexto}
                onChange={(e) => setValorTexto(e.target.value)}
                placeholder="0,00"
                required
                className="h-9 text-xs font-mono num-tabular"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-data" className="text-xs font-medium">
                Data
              </Label>
              <Input
                id="edit-data"
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                required
                className="h-9 text-xs"
              />
            </div>
          </div>

          {/* 4. Conta e Categoria */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium">Conta</Label>
              <Select value={contaId} onValueChange={setContaId}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Selecione a conta" />
                </SelectTrigger>
                <SelectContent>
                  {contas.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {tipo !== 'transferencia' && (
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs font-medium">Categoria</Label>
                <Select
                  value={categoriaId || '__nenhuma__'}
                  onValueChange={(val) => setCategoriaId(val === '__nenhuma__' ? '' : val)}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Sem categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__nenhuma__">Sem categoria</SelectItem>
                    {categorias.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* 5. Quem pagou */}
          {membros.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium">Quem realizou o pagamento</Label>
              <Select value={membroId} onValueChange={setMembroId}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Selecione o membro" />
                </SelectTrigger>
                <SelectContent>
                  {membros.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* 6. Status Pago e Data de Pagamento */}
          <div className="flex flex-col gap-2 rounded-lg border border-border/70 bg-muted/30 p-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="edit-pago"
                checked={estaPago}
                onCheckedChange={(checked) => setEstaPago(Boolean(checked))}
              />
              <Label htmlFor="edit-pago" className="text-xs font-medium cursor-pointer">
                Lançamento já foi pago / liquidado
              </Label>
            </div>

            {estaPago && (
              <div className="flex flex-col gap-1 pt-1.5 pl-6">
                <Label htmlFor="edit-data-pagamento" className="text-[11px] text-muted-foreground">
                  Data em que foi pago
                </Label>
                <Input
                  id="edit-data-pagamento"
                  type="date"
                  value={dataPagamento}
                  onChange={(e) => setDataPagamento(e.target.value)}
                  className="h-8 text-xs max-w-[200px]"
                />
              </div>
            )}
          </div>

          {/* 7. Observação */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-obs" className="text-xs font-medium">
              Observação (opcional)
            </Label>
            <Input
              id="edit-obs"
              type="text"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Notas adicionais..."
              maxLength={500}
              className="h-9 text-xs"
            />
          </div>

          <DialogFooter className="mt-2 gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="toque"
              onClick={() => onOpenChange(false)}
              disabled={pendente}
            >
              Cancelar
            </Button>
            <Button type="submit" variant="default" size="toque" disabled={pendente} className="gap-2">
              {pendente ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  <span>Salvando...</span>
                </>
              ) : (
                <>
                  <Check className="size-4" />
                  <span>Salvar alterações</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
