'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { SlidersHorizontal, Check, Loader2, AlertCircle } from 'lucide-react'
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
import { todayISO } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Database } from '@/types/database'

export interface ItemSelectOpcao {
  id: string
  name: string
}

export interface MembroOpcao {
  id: string
  display_name: string
}

export interface DialogoEditarEmMassaProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  idsSelecionados: string[]
  contas: ItemSelectOpcao[]
  categorias: ItemSelectOpcao[]
  membros: MembroOpcao[]
  onSalvo?: () => void
}

export function DialogoEditarEmMassa({
  aberto,
  onOpenChange,
  idsSelecionados,
  contas,
  categorias,
  membros,
  onSalvo,
}: DialogoEditarEmMassaProps) {
  const router = useRouter()
  const [pendente, setPendente] = React.useState(false)
  const [erro, setErro] = React.useState<string | null>(null)

  // Opções a atualizar (checkbox ativa ou inativa)
  const [mudarCategoria, setMudarCategoria] = React.useState(false)
  const [categoriaId, setCategoriaId] = React.useState<string>('')

  const [mudarConta, setMudarConta] = React.useState(false)
  const [contaId, setContaId] = React.useState<string>('')

  const [mudarMembro, setMudarMembro] = React.useState(false)
  const [membroId, setMembroId] = React.useState<string>('')

  const [mudarStatus, setMudarStatus] = React.useState(false)
  const [statusPago, setStatusPago] = React.useState<'pago' | 'pendente'>('pago')

  // Limpa estados ao reabrir
  React.useEffect(() => {
    if (aberto) {
      setMudarCategoria(false)
      setCategoriaId(categorias[0]?.id ?? '')
      setMudarConta(false)
      setContaId(contas[0]?.id ?? '')
      setMudarMembro(false)
      setMembroId(membros[0]?.id ?? '')
      setMudarStatus(false)
      setStatusPago('pago')
      setErro(null)
    }
  }, [aberto, categorias, contas, membros])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro(null)

    if (!mudarCategoria && !mudarConta && !mudarMembro && !mudarStatus) {
      setErro('Selecione pelo menos um campo para alterar em lote.')
      return
    }

    if (idsSelecionados.length === 0) {
      setErro('Nenhum lançamento selecionado.')
      return
    }

    const updates: Database['public']['Tables']['transactions']['Update'] = {}

    if (mudarCategoria) {
      updates.category_id = categoriaId === '__nenhuma__' ? null : categoriaId || null
    }

    if (mudarConta) {
      if (!contaId) {
        setErro('Selecione uma conta para aplicar.')
        return
      }
      updates.account_id = contaId
    }

    if (mudarMembro) {
      if (!membroId) {
        setErro('Selecione quem realizou o pagamento.')
        return
      }
      updates.paid_by_member_id = membroId
    }

    if (mudarStatus) {
      updates.is_paid = statusPago === 'pago'
      updates.paid_date = statusPago === 'pago' ? todayISO() : null
    }

    setPendente(true)

    try {
      const supabase = createClient()
      const { error: erroUpdate } = await supabase
        .from('transactions')
        .update(updates)
        .in('id', idsSelecionados)

      if (erroUpdate) {
        setErro(erroUpdate.message || 'Erro ao aplicar alterações em lote.')
        setPendente(false)
        return
      }

      setPendente(false)
      onOpenChange(false)
      onSalvo?.()
      router.refresh()
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Erro ao processar alterações.')
      setPendente(false)
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20">
              <SlidersHorizontal className="size-4" aria-hidden="true" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">
                Editar {idsSelecionados.length === 1 ? '1 lançamento' : `${idsSelecionados.length} lançamentos`} em lote
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Marque os campos que deseja alterar para todos os lançamentos selecionados.
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

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 py-2 text-xs">
          {/* Opção 1: Alterar Categoria */}
          <div
            className={cn(
              'rounded-xl border p-3 flex flex-col gap-2.5 transition-colors',
              mudarCategoria ? 'border-primary/50 bg-primary/5' : 'border-border/70 bg-muted/20',
            )}
          >
            <div className="flex items-center gap-2">
              <Checkbox
                id="check-mudar-cat"
                checked={mudarCategoria}
                onCheckedChange={(checked) => setMudarCategoria(Boolean(checked))}
              />
              <Label htmlFor="check-mudar-cat" className="text-xs font-semibold cursor-pointer">
                Alterar Categoria
              </Label>
            </div>

            {mudarCategoria && (
              <div className="pl-6 pt-1">
                <Select
                  value={categoriaId || '__nenhuma__'}
                  onValueChange={(val) => setCategoriaId(val === '__nenhuma__' ? '' : val)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Selecione nova categoria" />
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

          {/* Opção 2: Alterar Conta */}
          <div
            className={cn(
              'rounded-xl border p-3 flex flex-col gap-2.5 transition-colors',
              mudarConta ? 'border-primary/50 bg-primary/5' : 'border-border/70 bg-muted/20',
            )}
          >
            <div className="flex items-center gap-2">
              <Checkbox
                id="check-mudar-conta"
                checked={mudarConta}
                onCheckedChange={(checked) => setMudarConta(Boolean(checked))}
              />
              <Label htmlFor="check-mudar-conta" className="text-xs font-semibold cursor-pointer">
                Alterar Conta
              </Label>
            </div>

            {mudarConta && (
              <div className="pl-6 pt-1">
                <Select value={contaId} onValueChange={setContaId}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Selecione nova conta" />
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
            )}
          </div>

          {/* Opção 3: Alterar Quem Pagou */}
          {membros.length > 0 && (
            <div
              className={cn(
                'rounded-xl border p-3 flex flex-col gap-2.5 transition-colors',
                mudarMembro ? 'border-primary/50 bg-primary/5' : 'border-border/70 bg-muted/20',
              )}
            >
              <div className="flex items-center gap-2">
                <Checkbox
                  id="check-mudar-membro"
                  checked={mudarMembro}
                  onCheckedChange={(checked) => setMudarMembro(Boolean(checked))}
                />
                <Label htmlFor="check-mudar-membro" className="text-xs font-semibold cursor-pointer">
                  Alterar Quem Pagou
                </Label>
              </div>

              {mudarMembro && (
                <div className="pl-6 pt-1">
                  <Select value={membroId} onValueChange={setMembroId}>
                    <SelectTrigger className="h-8 text-xs">
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
            </div>
          )}

          {/* Opção 4: Alterar Status de Pagamento */}
          <div
            className={cn(
              'rounded-xl border p-3 flex flex-col gap-2.5 transition-colors',
              mudarStatus ? 'border-primary/50 bg-primary/5' : 'border-border/70 bg-muted/20',
            )}
          >
            <div className="flex items-center gap-2">
              <Checkbox
                id="check-mudar-status"
                checked={mudarStatus}
                onCheckedChange={(checked) => setMudarStatus(Boolean(checked))}
              />
              <Label htmlFor="check-mudar-status" className="text-xs font-semibold cursor-pointer">
                Alterar Status (Pago / Pendente)
              </Label>
            </div>

            {mudarStatus && (
              <div className="pl-6 pt-1 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setStatusPago('pago')}
                  className={cn(
                    'flex-1 py-1.5 px-3 rounded-lg border text-xs font-semibold text-center transition-all',
                    statusPago === 'pago'
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      : 'border-border/70 text-muted-foreground hover:bg-muted/50',
                  )}
                >
                  Marcar como Pago
                </button>
                <button
                  type="button"
                  onClick={() => setStatusPago('pendente')}
                  className={cn(
                    'flex-1 py-1.5 px-3 rounded-lg border text-xs font-semibold text-center transition-all',
                    statusPago === 'pendente'
                      ? 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                      : 'border-border/70 text-muted-foreground hover:bg-muted/50',
                  )}
                >
                  Marcar como Pendente
                </button>
              </div>
            )}
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
            <Button
              type="submit"
              variant="default"
              size="toque"
              disabled={pendente || (!mudarCategoria && !mudarConta && !mudarMembro && !mudarStatus)}
              className="gap-2"
            >
              {pendente ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  <span>Atualizando...</span>
                </>
              ) : (
                <>
                  <Check className="size-4" />
                  <span>
                    Aplicar a {idsSelecionados.length === 1 ? '1 item' : `${idsSelecionados.length} itens`}
                  </span>
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
