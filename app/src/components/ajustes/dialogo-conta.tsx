'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Edit2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { parseBRLInput } from '@/lib/format'
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
import { AJUSTES_CONTAS } from '@/features/ajustes/copy'
import type { Database } from '@/types/database'

type Conta = Database['public']['Tables']['accounts']['Row']

export interface DialogoContaProps {
  familiaId: string
  contaParaEditar?: Conta | null
  gatilho?: React.ReactNode
}

export function DialogoConta({
  familiaId,
  contaParaEditar,
  gatilho,
}: DialogoContaProps) {
  const router = useRouter()
  const [aberto, setAberto] = React.useState(false)
  const [nome, setNome] = React.useState(contaParaEditar?.name ?? '')
  const [tipo, setTipo] = React.useState(contaParaEditar?.type ?? 'corrente')
  const [saldoInicial, setSaldoInicial] = React.useState(
    contaParaEditar?.initial_balance !== undefined && contaParaEditar?.initial_balance !== null
      ? String(contaParaEditar.initial_balance).replace('.', ',')
      : '0,00',
  )
  const [diaFechamento, setDiaFechamento] = React.useState(
    contaParaEditar?.closing_day ? String(contaParaEditar.closing_day) : '',
  )
  const [diaVencimento, setDiaVencimento] = React.useState(
    contaParaEditar?.due_day ? String(contaParaEditar.due_day) : '',
  )
  const [pendente, setPendente] = React.useState(false)
  const [erro, setErro] = React.useState<string | null>(null)

  const ehCartao = tipo === 'cartao'

  const aoEnviar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nome.trim()) {
      setErro('Informe o nome da conta.')
      return
    }

    if (ehCartao) {
      const f = Number(diaFechamento)
      const v = Number(diaVencimento)
      if (!f || f < 1 || f > 31 || !v || v < 1 || v > 31) {
        setErro('Cartão de crédito exige dia de fechamento e vencimento entre 1 e 31.')
        return
      }
    }

    setPendente(true)
    setErro(null)

    try {
      const saldoNum = parseBRLInput(saldoInicial)
      const supabase = createClient()

      const payload = {
        name: nome.trim(),
        type: tipo,
        initial_balance: Number.isNaN(saldoNum) ? 0 : saldoNum,
        closing_day: ehCartao ? Number(diaFechamento) : null,
        due_day: ehCartao ? Number(diaVencimento) : null,
      }

      if (contaParaEditar) {
        const { error } = await supabase
          .from('accounts')
          .update(payload)
          .eq('id', contaParaEditar.id)

        if (error) {
          setErro(error.message || 'Erro ao atualizar conta.')
          setPendente(false)
          return
        }
      } else {
        const { error } = await supabase.from('accounts').insert({
          ...payload,
          family_id: familiaId,
        })

        if (error) {
          setErro(error.message || 'Erro ao criar conta.')
          setPendente(false)
          return
        }
      }

      setAberto(false)
      setPendente(false)
      router.refresh()
    } catch {
      setErro('Erro de conexão ao salvar conta.')
      setPendente(false)
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        {gatilho ?? (
          <Button variant="default" size="toque" className="gap-2">
            <Plus className="size-4" aria-hidden="true" />
            {AJUSTES_CONTAS.novaConta}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {contaParaEditar ? AJUSTES_CONTAS.editarConta : AJUSTES_CONTAS.novaConta}
          </DialogTitle>
          <DialogDescription>{AJUSTES_CONTAS.subtitulo}</DialogDescription>
        </DialogHeader>

        <form onSubmit={aoEnviar} className="flex flex-col gap-4">
          {erro && (
            <Alert variant="destructive">
              <AlertDescription>{erro}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nome-conta">{AJUSTES_CONTAS.nome}</Label>
            <Input
              id="nome-conta"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder={AJUSTES_CONTAS.nomePlaceholder}
              required
              className="min-h-[44px]"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tipo-conta">{AJUSTES_CONTAS.tipo}</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger id="tipo-conta" className="min-h-[44px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="corrente">Conta corrente</SelectItem>
                <SelectItem value="cartao">Cartão de crédito</SelectItem>
                <SelectItem value="beneficio">Benefício (Vale refeição/alimentação)</SelectItem>
                <SelectItem value="investimento">Investimento</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="saldo-inicial">{AJUSTES_CONTAS.saldoInicial}</Label>
            <Input
              id="saldo-inicial"
              inputMode="decimal"
              value={saldoInicial}
              onChange={(e) => setSaldoInicial(e.target.value)}
              placeholder="0,00"
              className="min-h-[44px]"
            />
          </div>

          {ehCartao && (
            <div className="grid grid-cols-2 gap-3 border-t border-border/60 pt-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="dia-fechamento">{AJUSTES_CONTAS.diaFechamento}</Label>
                <Input
                  id="dia-fechamento"
                  type="number"
                  min="1"
                  max="31"
                  value={diaFechamento}
                  onChange={(e) => setDiaFechamento(e.target.value)}
                  placeholder="25"
                  required
                  className="min-h-[44px]"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="dia-vencimento">{AJUSTES_CONTAS.diaVencimento}</Label>
                <Input
                  id="dia-vencimento"
                  type="number"
                  min="1"
                  max="31"
                  value={diaVencimento}
                  onChange={(e) => setDiaVencimento(e.target.value)}
                  placeholder="5"
                  required
                  className="min-h-[44px]"
                />
              </div>
            </div>
          )}

          <DialogFooter className="mt-2">
            <Button
              type="button"
              variant="outline"
              size="toque"
              onClick={() => setAberto(false)}
              disabled={pendente}
            >
              Cancelar
            </Button>
            <Button type="submit" size="toque" disabled={pendente}>
              {pendente ? AJUSTES_CONTAS.salvando : AJUSTES_CONTAS.salvar}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
