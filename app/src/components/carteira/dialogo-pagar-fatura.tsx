'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { CreditCard, CheckCircle2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { todayISO } from '@/lib/format'
import { invoicePeriodLabel } from '@/lib/invoice'
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
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ValorMonetario } from '@/components/financeiro/valor-monetario'
import { PAGAR_FATURA } from '@/features/carteira/copy'

export interface ContaOrigem {
  id: string
  name: string | null
  current_balance?: number | null
}

export interface FaturaParaPagar {
  account_id: string
  account_name: string | null
  invoice_year: number
  invoice_month: number
  open_amount: number
}

export interface DialogoPagarFaturaProps {
  fatura: FaturaParaPagar
  contasOrigem: ContaOrigem[]
  gatilho?: React.ReactNode
}

export function DialogoPagarFatura({
  fatura,
  contasOrigem,
  gatilho,
}: DialogoPagarFaturaProps) {
  const router = useRouter()
  const [aberto, setAberto] = React.useState(false)
  const [contaOrigemId, setContaOrigemId] = React.useState<string>(
    contasOrigem[0]?.id ?? '',
  )
  const [dataPagamento, setDataPagamento] = React.useState<string>(todayISO())
  const [pendente, setPendente] = React.useState(false)
  const [erro, setErro] = React.useState<string | null>(null)
  const [sucesso, setSucesso] = React.useState(false)

  const periodoRotulo = invoicePeriodLabel(
    fatura.invoice_year,
    fatura.invoice_month,
  )

  const aoEnviar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!contaOrigemId) {
      setErro('Selecione a conta de onde o dinheiro sairá.')
      return
    }

    setPendente(true)
    setErro(null)

    try {
      const supabase = createClient()
      const { error: erroRpc } = await supabase.rpc('pay_invoice', {
        p_card_account_id: fatura.account_id,
        p_from_account_id: contaOrigemId,
        p_invoice_year: fatura.invoice_year,
        p_invoice_month: fatura.invoice_month,
        p_date: dataPagamento,
      })

      if (erroRpc) {
        setErro(erroRpc.message || 'Erro ao registrar pagamento da fatura.')
        setPendente(false)
        return
      }

      setSucesso(true)
      setPendente(false)
      setTimeout(() => {
        setAberto(false)
        setSucesso(false)
        router.refresh()
      }, 1000)
    } catch {
      setErro('Falha na conexão ao tentar pagar a fatura.')
      setPendente(false)
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        {gatilho ?? (
          <Button variant="default" size="toque" className="gap-2">
            <CreditCard className="size-4" aria-hidden="true" />
            {PAGAR_FATURA.botaoConfirmar}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{PAGAR_FATURA.titulo}</DialogTitle>
          <DialogDescription>{PAGAR_FATURA.subtitulo}</DialogDescription>
        </DialogHeader>

        {sucesso ? (
          <div className="flex flex-col items-center justify-center gap-3 py-6 text-center">
            <CheckCircle2 className="text-receita size-12" aria-hidden="true" />
            <p className="text-[length:var(--texto-corpo)] font-medium">
              {PAGAR_FATURA.sucesso}
            </p>
          </div>
        ) : (
          <form onSubmit={aoEnviar} className="flex flex-col gap-4">
            {erro && (
              <Alert variant="destructive">
                <AlertDescription>{erro}</AlertDescription>
              </Alert>
            )}

            <div className="bg-muted/50 border-input flex items-center justify-between rounded-lg border p-3">
              <div className="flex flex-col">
                <span className="text-muted-foreground text-xs">
                  {fatura.account_name ?? 'Cartão'}
                </span>
                <span className="text-sm font-semibold">{periodoRotulo}</span>
              </div>
              <div className="text-right">
                <span className="text-muted-foreground block text-xs">
                  {PAGAR_FATURA.valor}
                </span>
                <ValorMonetario
                  valor={fatura.open_amount}
                  tipo="despesa"
                  tamanho="destaque"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="conta-origem">{PAGAR_FATURA.contaOrigem}</Label>
              {contasOrigem.length === 0 ? (
                <p className="text-muted-foreground text-xs">
                  {PAGAR_FATURA.semSaldoOuOrigem}
                </p>
              ) : (
                <Select
                  value={contaOrigemId}
                  onValueChange={setContaOrigemId}
                  name="contaOrigem"
                >
                  <SelectTrigger id="conta-origem" className="min-h-[44px]">
                    <SelectValue placeholder={PAGAR_FATURA.contaOrigemPlaceholder} />
                  </SelectTrigger>
                  <SelectContent>
                    {contasOrigem.map((conta) => (
                      <SelectItem key={conta.id} value={conta.id}>
                        {conta.name ?? 'Conta'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="data-pagamento">{PAGAR_FATURA.dataPagamento}</Label>
              <Input
                id="data-pagamento"
                type="date"
                value={dataPagamento}
                onChange={(e) => setDataPagamento(e.target.value)}
                required
                className="min-h-[44px]"
              />
            </div>

            <DialogFooter className="mt-2">
              <Button
                type="button"
                variant="outline"
                size="toque"
                onClick={() => setAberto(false)}
                disabled={pendente}
              >
                {PAGAR_FATURA.botaoCancelar}
              </Button>
              <Button
                type="submit"
                variant="default"
                size="toque"
                disabled={pendente || contasOrigem.length === 0}
              >
                {pendente ? PAGAR_FATURA.pagando : PAGAR_FATURA.botaoConfirmar}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
