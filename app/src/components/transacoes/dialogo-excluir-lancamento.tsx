'use client'

import * as React from 'react'
import { Trash2, AlertTriangle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ValorMonetario, type TipoDeValor } from '@/components/financeiro/valor-monetario'
import { isoToBR } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Database } from '@/types/database'

type Transacao = Database['public']['Tables']['transactions']['Row']

export interface DialogoExcluirLancamentoProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  transacao?: Transacao | null
  quantidadeEmMassa?: number
  nomeConta?: string | null
  nomeCategoria?: string | null
  aoConfirmar: (escopo: 'single' | 'series') => Promise<void>
  pendente?: boolean
}

export function DialogoExcluirLancamento({
  aberto,
  onOpenChange,
  transacao,
  quantidadeEmMassa,
  nomeConta,
  nomeCategoria,
  aoConfirmar,
  pendente = false,
}: DialogoExcluirLancamentoProps) {
  const [escopo, setEscopo] = React.useState<'single' | 'series'>('single')

  // Redefine escopo para 'single' sempre que abrir
  React.useEffect(() => {
    if (aberto) {
      setEscopo('single')
    }
  }, [aberto])

  const ehEmMassa = Boolean(quantidadeEmMassa && quantidadeEmMassa > 0)
  const ehRecorrente = Boolean(
    transacao &&
      (transacao.recurrence_parent_id ||
        (transacao.recurrence_months && transacao.recurrence_months > 1)),
  )

  const handleConfirmar = async () => {
    await aoConfirmar(escopo)
  }

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive border border-destructive/20">
              <Trash2 className="size-5" aria-hidden="true" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">
                {ehEmMassa
                  ? `Excluir ${quantidadeEmMassa} lançamentos`
                  : 'Excluir lançamento'}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Esta ação removerá o registro e atualizará os saldos e relatórios.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-2 text-sm">
          {ehEmMassa ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3.5 flex items-start gap-2.5">
              <AlertTriangle className="size-4 text-destructive shrink-0 mt-0.5" />
              <div className="text-xs text-foreground flex flex-col gap-1">
                <span className="font-semibold text-destructive">Atenção</span>
                <span>
                  Você está prestes a excluir{' '}
                  <strong>{quantidadeEmMassa} lançamentos selecionados</strong> de uma vez.
                  Essa operação não pode ser desfeita.
                </span>
              </div>
            </div>
          ) : transacao ? (
            <div className="flex flex-col gap-3">
              {/* Detalhes do item a ser excluído */}
              <div className="rounded-xl border border-border/80 bg-muted/40 p-3 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-foreground text-sm truncate">
                    {transacao.description}
                  </span>
                  <ValorMonetario
                    valor={transacao.amount}
                    tipo={(transacao.type as TipoDeValor) ?? 'despesa'}
                    pago={transacao.is_paid}
                    className="font-bold text-sm shrink-0"
                  />
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-mono">{isoToBR(transacao.date)}</span>
                  {nomeCategoria && (
                    <>
                      <span>•</span>
                      <span>{nomeCategoria}</span>
                    </>
                  )}
                  {nomeConta && (
                    <>
                      <span>•</span>
                      <span>{nomeConta}</span>
                    </>
                  )}
                </div>
              </div>

              {/* Opção de série vs único se for lançamento recorrente */}
              {ehRecorrente && (
                <div className="flex flex-col gap-2 pt-1">
                  <span className="text-xs font-semibold text-foreground">
                    Este lançamento faz parte de uma série recorrente/parcelada:
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setEscopo('single')}
                      className={cn(
                        'flex flex-col gap-1 p-2.5 rounded-lg border text-left text-xs transition-all',
                        escopo === 'single'
                          ? 'border-primary bg-primary/5 ring-1 ring-primary font-semibold text-foreground'
                          : 'border-border/80 hover:bg-muted/50 text-muted-foreground',
                      )}
                    >
                      <span>Apenas este lançamento</span>
                      <span className="text-[11px] font-normal text-muted-foreground">
                        Exclui apenas o lançamento deste mês
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setEscopo('series')}
                      className={cn(
                        'flex flex-col gap-1 p-2.5 rounded-lg border text-left text-xs transition-all',
                        escopo === 'series'
                          ? 'border-destructive bg-destructive/5 ring-1 ring-destructive font-semibold text-destructive'
                          : 'border-border/80 hover:bg-muted/50 text-muted-foreground',
                      )}
                    >
                      <span>Toda a série</span>
                      <span className="text-[11px] font-normal text-muted-foreground">
                        Exclui todas as parcelas vinculadas
                      </span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
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
            type="button"
            variant="destructive"
            size="toque"
            onClick={handleConfirmar}
            disabled={pendente}
            className="gap-2"
          >
            {pendente ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                <span>Excluindo...</span>
              </>
            ) : (
              <>
                <Trash2 className="size-4" />
                <span>{ehEmMassa ? 'Excluir selecionados' : 'Excluir'}</span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
