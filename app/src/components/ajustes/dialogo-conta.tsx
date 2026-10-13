'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Controller, useForm } from 'react-hook-form'
import { Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { parseBRLInput } from '@/lib/format'
import type { ResultadoAction } from '@/actions/resultado'
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
import { CampoErro } from '@/components/ui/campo-erro'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AJUSTES_CONTAS } from '@/features/ajustes/copy'
import { tocarSomErro, tocarSomSucesso } from '@/features/sons/sons'
import type { Database } from '@/types/database'

type Conta = Database['public']['Tables']['accounts']['Row']
export type TipoConta = 'corrente' | 'beneficio' | 'cartao' | 'investimento'

export interface DialogoContaProps {
  familiaId: string
  contaParaEditar?: Conta | null
  gatilho?: React.ReactNode
}

interface FormContaValores {
  nome: string
  tipo: TipoConta
  saldoInicial: string
  diaFechamento: string
  diaVencimento: string
}

async function acaoCriarConta(
  familiaId: string,
  input: {
    nome: string
    tipo: TipoConta
    saldoInicial: number
    diaFechamento?: number | null
    diaVencimento?: number | null
  },
): Promise<ResultadoAction<{ id: string }>> {
  const nome = input.nome.trim()
  if (!nome) {
    return {
      ok: false,
      erro: 'Informe o nome da conta.',
      camposComErro: { nome: ['Informe o nome da conta.'] },
    }
  }
  if (input.tipo === 'cartao') {
    const f = input.diaFechamento
    const v = input.diaVencimento
    if (!f || f < 1 || f > 31) {
      return {
        ok: false,
        erro: 'Informe um dia de fechamento entre 1 e 31.',
        camposComErro: { diaFechamento: ['Informe um dia entre 1 e 31.'] },
      }
    }
    if (!v || v < 1 || v > 31) {
      return {
        ok: false,
        erro: 'Informe um dia de vencimento entre 1 e 31.',
        camposComErro: { diaVencimento: ['Informe um dia entre 1 e 31.'] },
      }
    }
  }

  const supabase = createClient()
  const { data, error } = await supabase
    .from('accounts')
    .insert({
      family_id: familiaId,
      name: nome,
      type: input.tipo,
      initial_balance: input.saldoInicial,
      closing_day: input.tipo === 'cartao' ? (input.diaFechamento ?? null) : null,
      due_day: input.tipo === 'cartao' ? (input.diaVencimento ?? null) : null,
    })
    .select('id')
    .single()

  if (error || !data) {
    return { ok: false, erro: error?.message ?? 'Erro ao criar conta.' }
  }
  return { ok: true, dados: { id: data.id } }
}

async function acaoEditarConta(input: {
  id: string
  nome?: string
  diaFechamento?: number | null
  diaVencimento?: number | null
}): Promise<ResultadoAction<void>> {
  const nome = input.nome?.trim()
  if (!nome) {
    return {
      ok: false,
      erro: 'Informe o nome da conta.',
      camposComErro: { nome: ['Informe o nome da conta.'] },
    }
  }

  const supabase = createClient()
  const { error } = await supabase
    .from('accounts')
    .update({
      name: nome,
      closing_day: input.diaFechamento ?? null,
      due_day: input.diaVencimento ?? null,
    })
    .eq('id', input.id)

  if (error) {
    return { ok: false, erro: error.message }
  }
  return { ok: true, dados: undefined }
}

export function DialogoConta({
  familiaId,
  contaParaEditar,
  gatilho,
}: DialogoContaProps) {
  const router = useRouter()
  const [aberto, setAberto] = React.useState(false)
  const [pendente, iniciarTransicao] = React.useTransition()
  const [resultado, setResultado] = React.useState<
    ResultadoAction<{ id: string } | void> | null
  >(null)

  const { register, control, handleSubmit, watch, reset } =
    useForm<FormContaValores>({
      defaultValues: {
        nome: contaParaEditar?.name ?? '',
        tipo: (contaParaEditar?.type as TipoConta) ?? 'corrente',
        saldoInicial:
          contaParaEditar?.initial_balance !== undefined &&
          contaParaEditar?.initial_balance !== null
            ? String(contaParaEditar.initial_balance).replace('.', ',')
            : '0,00',
        diaFechamento: contaParaEditar?.closing_day
          ? String(contaParaEditar.closing_day)
          : '',
        diaVencimento: contaParaEditar?.due_day
          ? String(contaParaEditar.due_day)
          : '',
      },
    })

  React.useEffect(() => {
    if (aberto) {
      setResultado(null)
      reset({
        nome: contaParaEditar?.name ?? '',
        tipo: (contaParaEditar?.type as TipoConta) ?? 'corrente',
        saldoInicial:
          contaParaEditar?.initial_balance !== undefined &&
          contaParaEditar?.initial_balance !== null
            ? String(contaParaEditar.initial_balance).replace('.', ',')
            : '0,00',
        diaFechamento: contaParaEditar?.closing_day
          ? String(contaParaEditar.closing_day)
          : '',
        diaVencimento: contaParaEditar?.due_day
          ? String(contaParaEditar.due_day)
          : '',
      })
    }
  }, [aberto, contaParaEditar, reset])

  const tipo = watch('tipo')
  const ehCartao = tipo === 'cartao'
  const editando = Boolean(contaParaEditar)

  const erros = resultado && !resultado.ok ? resultado.camposComErro : undefined
  const erroGeral =
    resultado && !resultado.ok && !erros ? resultado.erro : undefined

  const aoEnviar = handleSubmit((valores) => {
    setResultado(null)
    iniciarTransicao(async () => {
      const fechamentoNum =
        ehCartao && valores.diaFechamento.trim() !== ''
          ? Number(valores.diaFechamento)
          : null
      const vencimentoNum =
        ehCartao && valores.diaVencimento.trim() !== ''
          ? Number(valores.diaVencimento)
          : null

      if (contaParaEditar) {
        const res = await acaoEditarConta({
          id: contaParaEditar.id,
          nome: valores.nome,
          diaFechamento: ehCartao ? fechamentoNum : null,
          diaVencimento: ehCartao ? vencimentoNum : null,
        })
        setResultado(res)
        if (res.ok) {
          tocarSomSucesso()
          setAberto(false)
          router.refresh()
        } else {
          tocarSomErro()
        }
      } else {
        const saldoNum = parseBRLInput(valores.saldoInicial)
        const res = await acaoCriarConta(familiaId, {
          nome: valores.nome,
          tipo: valores.tipo,
          saldoInicial: Number.isNaN(saldoNum) ? 0 : saldoNum,
          diaFechamento: ehCartao ? fechamentoNum : null,
          diaVencimento: ehCartao ? vencimentoNum : null,
        })
        setResultado(res)
        if (res.ok) {
          tocarSomSucesso()
          setAberto(false)
          router.refresh()
        } else {
          tocarSomErro()
        }
      }
    })
  })

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
            {editando ? AJUSTES_CONTAS.editarConta : AJUSTES_CONTAS.novaConta}
          </DialogTitle>
          <DialogDescription>{AJUSTES_CONTAS.subtitulo}</DialogDescription>
        </DialogHeader>

        <form onSubmit={aoEnviar} className="flex flex-col gap-4" noValidate>
          {erroGeral && (
            <Alert variant="destructive">
              <AlertDescription>{erroGeral}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nome-conta">{AJUSTES_CONTAS.nome}</Label>
            <Input
              id="nome-conta"
              placeholder={AJUSTES_CONTAS.nomePlaceholder}
              disabled={pendente}
              aria-invalid={erros?.nome ? true : undefined}
              aria-describedby={erros?.nome ? 'erro-nome-conta' : undefined}
              className="min-h-[44px]"
              {...register('nome')}
            />
            <CampoErro id="erro-nome-conta" mensagens={erros?.nome} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tipo-conta">{AJUSTES_CONTAS.tipo}</Label>
            <Controller
              control={control}
              name="tipo"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={(v) => field.onChange(v as TipoConta)}
                  disabled={pendente || editando}
                >
                  <SelectTrigger id="tipo-conta" className="min-h-[44px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="corrente">Conta corrente</SelectItem>
                    <SelectItem value="cartao">Cartão de crédito</SelectItem>
                    <SelectItem value="beneficio">
                      Benefício (Vale refeição/alimentação)
                    </SelectItem>
                    <SelectItem value="investimento">Investimento</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
            {editando && (
              <span className="text-muted-foreground text-xs">
                {AJUSTES_CONTAS.tipoImutavelDica}
              </span>
            )}
            <CampoErro id="erro-tipo-conta" mensagens={erros?.tipo} />
          </div>

          {!editando && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="saldo-inicial">{AJUSTES_CONTAS.saldoInicial}</Label>
              <Input
                id="saldo-inicial"
                inputMode="decimal"
                placeholder="0,00"
                disabled={pendente}
                aria-invalid={erros?.saldoInicial ? true : undefined}
                aria-describedby={erros?.saldoInicial ? 'erro-saldo-conta' : undefined}
                className="min-h-[44px] font-mono num-tabular"
                {...register('saldoInicial')}
              />
              <CampoErro id="erro-saldo-conta" mensagens={erros?.saldoInicial} />
            </div>
          )}

          {ehCartao && (
            <div className="grid grid-cols-2 gap-3 border-t border-border/60 pt-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="dia-fechamento">{AJUSTES_CONTAS.diaFechamento}</Label>
                <Input
                  id="dia-fechamento"
                  type="number"
                  min="1"
                  max="31"
                  placeholder="25"
                  disabled={pendente}
                  aria-invalid={erros?.diaFechamento ? true : undefined}
                  aria-describedby={
                    erros?.diaFechamento ? 'erro-fechamento-conta' : undefined
                  }
                  className="min-h-[44px]"
                  {...register('diaFechamento')}
                />
                <CampoErro
                  id="erro-fechamento-conta"
                  mensagens={erros?.diaFechamento}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="dia-vencimento">{AJUSTES_CONTAS.diaVencimento}</Label>
                <Input
                  id="dia-vencimento"
                  type="number"
                  min="1"
                  max="31"
                  placeholder="5"
                  disabled={pendente}
                  aria-invalid={erros?.diaVencimento ? true : undefined}
                  aria-describedby={
                    erros?.diaVencimento ? 'erro-vencimento-conta' : undefined
                  }
                  className="min-h-[44px]"
                  {...register('diaVencimento')}
                />
                <CampoErro
                  id="erro-vencimento-conta"
                  mensagens={erros?.diaVencimento}
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
