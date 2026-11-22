'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, Calendar, Check, Clock, Info } from 'lucide-react'
import { responderCobranca, type CobrancaPendente } from '@/actions/recorrencia'
import { ValorMonetario } from '@/components/financeiro/valor-monetario'
import { Alert, AlertDescription } from '@/components/ui/alert'
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
import { tocarSomErro, tocarSomParceiro, tocarSomSucesso } from '@/features/sons/sons'
import { hapticFeedback } from '@/lib/haptics'
import { rotuloDoMes } from '@/lib/hoje'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

export interface PopUpCobrancaProps {
  cobrancasIniciais: CobrancaPendente[]
  familyId?: string
}

export function PopUpCobranca({ cobrancasIniciais, familyId }: PopUpCobrancaProps) {
  const router = useRouter()
  const [fila, setFila] = React.useState<CobrancaPendente[]>(cobrancasIniciais)
  const [confirmandoPagamento, setConfirmandoPagamento] = React.useState(false)
  const [dataPagamento, setDataPagamento] = React.useState('')
  const [pendente, setPendente] = React.useState(false)
  const [erro, setErro] = React.useState<string | null>(null)

  // Toast quando há 12+ itens na fila
  const [toastFila, setToastFila] = React.useState<string | null>(() => {
    return cobrancasIniciais.length >= 12
      ? `${cobrancasIniciais.length} cobranças em fila`
      : null
  })

  // Sincroniza se cobrancasIniciais mudar pelo servidor
  React.useEffect(() => {
    setFila(cobrancasIniciais)
  }, [cobrancasIniciais])

  React.useEffect(() => {
    if (toastFila) {
      tocarSomParceiro()
      const timer = setTimeout(() => setToastFila(null), 4000)
      return () => clearTimeout(timer)
    }
  }, [toastFila])

  const itemAtual = fila[0]

  // Mantém a data de pagamento alinhada ao dia do vencimento da cobrança atual
  React.useEffect(() => {
    if (itemAtual) {
      setDataPagamento(itemAtual.data)
      setConfirmandoPagamento(false)
      setErro(null)
    }
  }, [itemAtual])

  // Realtime: quando o parceiro responder, atualiza ou fecha o pop-up
  React.useEffect(() => {
    if (!familyId) return

    const supabase = createClient()
    const canal = supabase
      .channel(`family-popup:${familyId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transactions',
          filter: `family_id=eq.${familyId}`,
        },
        (payload) => {
          const rec = (payload.new ?? payload.old) as {
            id?: string
            recurring_rule_id?: string | null
            is_paid?: boolean
          } | undefined

          if (rec?.recurring_rule_id && rec?.is_paid && rec?.id) {
            setFila((antiga) => antiga.filter((item) => item.id !== rec.id))
            router.refresh()
          }
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(canal)
    }
  }, [familyId, router])

  if (!itemAtual) {
    return toastFila ? (
      <div
        role="status"
        aria-live="polite"
        className="fixed bottom-20 right-4 z-50 flex items-center gap-2.5 rounded-xl border border-border/80 bg-card px-4 py-3 shadow-lg text-xs font-medium text-foreground animate-in fade-in slide-in-from-bottom-3 duration-200"
      >
        <div className="flex size-5 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Info className="size-3.5" />
        </div>
        <span>{toastFila}</span>
      </div>
    ) : null
  }

  const ehDespesa = itemAtual.tipo === 'despesa'
  const centavos = Math.round(itemAtual.valor * 100)

  async function handleResponder(resposta: 'pago' | 'ainda_nao', dataPag?: string) {
    if (!itemAtual) return
    setPendente(true)
    setErro(null)

    const res = await responderCobranca({
      lancamentoId: itemAtual.id,
      resposta,
      dataPagamento: resposta === 'pago' ? (dataPag || itemAtual.data) : undefined,
    })

    if (res.ok) {
      if (res.dados.estado === 'pago') {
        tocarSomSucesso()
        hapticFeedback.success()
      } else {
        hapticFeedback.selection()
      }
      setFila((antiga) => {
        const nova = antiga.filter((c) => c.id !== itemAtual.id)
        if (nova.length === 0) router.refresh()
        return nova
      })
      setConfirmandoPagamento(false)
    } else {
      tocarSomErro()
      hapticFeedback.warning()
      setErro(res.erro)
    }
    setPendente(false)
  }

  return (
    <>
      {toastFila && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-20 right-4 z-50 flex items-center gap-2.5 rounded-xl border border-border/80 bg-card px-4 py-3 shadow-lg text-xs font-medium text-foreground animate-in fade-in slide-in-from-bottom-3 duration-200"
        >
          <div className="flex size-5 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Info className="size-3.5" />
          </div>
          <span>{toastFila}</span>
        </div>
      )}

      <Dialog open={fila.length > 0}>
        <DialogContent
          className="sm:max-w-md [&>button]:hidden"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader className="gap-1.5 text-left">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Cobrança recorrente {fila.length > 1 ? `(1 de ${fila.length})` : ''}
              </span>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Calendar className="size-3" aria-hidden="true" />
                {rotuloDoMes(itemAtual.competencia)}
              </span>
            </div>
            <DialogTitle className="text-lg font-bold">
              {ehDespesa ? `Já pagou? ${itemAtual.descricao}` : `Já recebeu? ${itemAtual.descricao}`}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {ehDespesa
                ? `${itemAtual.descricao} — competência de ${rotuloDoMes(itemAtual.competencia)}`
                : `${itemAtual.descricao} — recebimento de ${rotuloDoMes(itemAtual.competencia)}`}
            </DialogDescription>
          </DialogHeader>

          {erro && (
            <Alert variant="destructive" className="py-2.5">
              <AlertCircle className="size-4" />
              <AlertDescription className="text-xs">{erro}</AlertDescription>
            </Alert>
          )}

          <div className="my-2 rounded-xl border border-border/70 bg-muted/40 p-4 flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-muted-foreground">Valor</span>
              <span
                className={cn(
                  'text-xl font-bold font-mono num-tabular',
                  ehDespesa ? 'text-despesa' : 'text-receita',
                )}
              >
                <ValorMonetario valor={itemAtual.valor} tipo={itemAtual.tipo} />
              </span>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground border-t border-border/40 pt-2">
              <span className="flex items-center gap-1.5">
                <Clock className="size-3.5" aria-hidden="true" />
                Vencimento previsto
              </span>
              <span className="font-mono">{itemAtual.data}</span>
            </div>
          </div>

          {confirmandoPagamento ? (
            <div className="flex flex-col gap-3 py-1 animate-in fade-in duration-150">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="dataPagamentoPopup" className="text-xs font-medium">
                  {ehDespesa ? 'Data do pagamento' : 'Data do recebimento'}
                </Label>
                <Input
                  id="dataPagamentoPopup"
                  type="date"
                  value={dataPagamento}
                  onChange={(e) => setDataPagamento(e.target.value)}
                  disabled={pendente}
                />
              </div>

              <div className="flex flex-col gap-2 pt-2">
                <Button
                  type="button"
                  size="toque"
                  disabled={pendente}
                  onClick={() => handleResponder('pago', dataPagamento)}
                  className="w-full"
                >
                  {pendente ? 'Confirmando…' : ehDespesa ? 'Confirmar pagamento' : 'Confirmar recebimento'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="toque"
                  disabled={pendente}
                  onClick={() => setConfirmandoPagamento(false)}
                  className="w-full text-xs"
                >
                  Voltar
                </Button>
              </div>
            </div>
          ) : (
            <DialogFooter className="flex flex-col gap-2 sm:flex-col sm:space-x-0 pt-2">
              <Button
                type="button"
                size="toque"
                disabled={pendente}
                onClick={() => setConfirmandoPagamento(true)}
                className="w-full"
              >
                <Check className="size-4 mr-1.5" aria-hidden="true" />
                {ehDespesa ? 'Sim, paguei' : 'Sim, recebi'}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="toque"
                disabled={pendente}
                onClick={() => handleResponder('ainda_nao')}
                className="w-full"
              >
                Ainda não
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
