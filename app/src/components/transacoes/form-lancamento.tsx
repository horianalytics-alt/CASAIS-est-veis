'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRightLeft, CreditCard, Plus, Trash2 } from 'lucide-react'
import { Controller, useFieldArray, useForm } from 'react-hook-form'
import { salvarLancamento, type EntradaDeLancamento, type Lancamento } from '@/actions/lancamento'
import type { ResultadoAction } from '@/actions/resultado'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button, buttonVariants } from '@/components/ui/button'
import { CampoErro } from '@/components/ui/campo-erro'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LANCAR } from '@/features/transacoes/copy'
import { getInvoicePeriod, invoicePeriodLabel } from '@/lib/invoice'
import { cn } from '@/lib/utils'

export interface OpcaoDeConta {
  id: string
  nome: string
  tipo: string
  closing_day: number | null
  due_day: number | null
}

export interface OpcaoDeCategoria {
  id: string
  nome: string
  tipo: string
}

export interface FormLancamentoProps {
  contas: OpcaoDeConta[]
  categorias: OpcaoDeCategoria[]
  hoje: string
}

type TipoDoFormulario = 'despesa' | 'receita' | 'transferencia'

interface CamposSimples {
  tipo: TipoDoFormulario
  descricao: string
  valor: string
  data: string
  contaId: string
  contaDestinoId: string
  categoriaId: string
  parcelas: number
  estaPago: boolean
  dataDoPagamento: string
}

interface ItemLote {
  tipo: 'despesa' | 'receita'
  descricao: string
  valor: string
  data: string
  contaId: string
  categoriaId: string
  estaPago: boolean
}

interface CamposLote {
  itens: ItemLote[]
}

const SEM_CATEGORIA = '__sem_categoria__'

const OPCOES_DE_TIPO: { valor: TipoDoFormulario; rotulo: string }[] = [
  { valor: 'despesa', rotulo: LANCAR.despesa },
  { valor: 'receita', rotulo: LANCAR.receita },
  { valor: 'transferencia', rotulo: LANCAR.transferencia },
]

const OPCOES_DE_PARCELAS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 18, 24]

export function FormLancamento({ contas, categorias, hoje }: FormLancamentoProps) {
  const router = useRouter()
  const [modo, setModo] = useState<'simples' | 'lote'>('simples')
  const [pendente, iniciarEnvio] = useTransition()
  const [resultado, setResultado] = useState<ResultadoAction<Lancamento[]> | null>(null)
  const [concluido, setConcluido] = useState(false)

  // -------------------------------------------------------------------------
  // Formulário Simples
  // -------------------------------------------------------------------------
  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    getValues,
  } = useForm<CamposSimples>({
    defaultValues: {
      tipo: 'despesa',
      descricao: '',
      valor: '',
      data: hoje,
      contaId: contas[0]?.id ?? '',
      contaDestinoId: contas[1]?.id ?? '',
      categoriaId: SEM_CATEGORIA,
      parcelas: 1,
      estaPago: true,
      dataDoPagamento: hoje,
    },
  })

  const pagamentoEditado = useRef(false)

  useEffect(() => {
    const assinatura = watch((_valores, { name }) => {
      if (!name) return
      setResultado((anterior) => {
        if (!anterior || anterior.ok || !anterior.camposComErro) return anterior
        if (!(name in anterior.camposComErro)) return anterior
        const { [name]: _removido, ...restantes } = anterior.camposComErro
        return Object.keys(restantes).length === 0
          ? null
          : { ...anterior, camposComErro: restantes }
      })
    })
    return () => assinatura.unsubscribe()
  }, [watch])

  const tipo = watch('tipo')
  const data = watch('data')
  const contaId = watch('contaId')
  const estaPago = watch('estaPago')
  const parcelas = watch('parcelas')

  const contaAtual = contas.find((c) => c.id === contaId)
  const ehCartao = contaAtual?.tipo === 'cartao' && contaAtual.closing_day != null

  // Rótulo de fatura ao vivo
  let rotuloFatura: string | null = null
  if (ehCartao && contaAtual && contaAtual.closing_day != null && data) {
    try {
      const periodo = getInvoicePeriod(data, contaAtual.closing_day)
      rotuloFatura = invoicePeriodLabel(periodo.year, periodo.month)
    } catch {
      rotuloFatura = null
    }
  }

  const categoriasDoTipo = categorias.filter(
    (c) => c.tipo === tipo || c.tipo === 'todos',
  )

  const contasDestinoDisponiveis = contas.filter((c) => c.id !== contaId)

  const erros = resultado && !resultado.ok ? resultado.camposComErro : undefined
  const erroGeral = resultado && !resultado.ok ? resultado.erro : undefined

  const aoEnviarSimples = handleSubmit((valores) => {
    setResultado(null)
    iniciarEnvio(async () => {
      const entrada: EntradaDeLancamento = {
        tipo: valores.tipo,
        descricao: valores.descricao,
        valor: valores.valor,
        data: valores.data,
        contaId: valores.contaId,
        contaDestinoId: valores.tipo === 'transferencia' ? valores.contaDestinoId : null,
        categoriaId:
          valores.tipo === 'transferencia' || valores.categoriaId === SEM_CATEGORIA
            ? null
            : valores.categoriaId,
        parcelas: valores.tipo === 'despesa' ? valores.parcelas : 1,
        estaPago: valores.estaPago,
        dataDoPagamento: valores.estaPago ? valores.dataDoPagamento || null : null,
      }

      const resposta = await salvarLancamento(entrada)
      setResultado(resposta)
      if (resposta.ok) {
        setConcluido(true)
        router.replace(`/inicio?mes=${valores.data.slice(0, 7)}`)
      }
    })
  })

  // -------------------------------------------------------------------------
  // Formulário em Lote
  // -------------------------------------------------------------------------
  const {
    register: registerLote,
    control: controlLote,
    handleSubmit: handleSubmitLote,
  } = useForm<CamposLote>({
    defaultValues: {
      itens: [
        {
          tipo: 'despesa',
          descricao: '',
          valor: '',
          data: hoje,
          contaId: contas[0]?.id ?? '',
          categoriaId: SEM_CATEGORIA,
          estaPago: true,
        },
        {
          tipo: 'despesa',
          descricao: '',
          valor: '',
          data: hoje,
          contaId: contas[0]?.id ?? '',
          categoriaId: SEM_CATEGORIA,
          estaPago: true,
        },
      ],
    },
  })

  const { fields: camposLote, append: adicionarItemLote, remove: removerItemLote } =
    useFieldArray({
      control: controlLote,
      name: 'itens',
    })

  const aoEnviarLote = handleSubmitLote((valores) => {
    setResultado(null)
    iniciarEnvio(async () => {
      const entradas: EntradaDeLancamento[] = valores.itens.map((item) => ({
        tipo: item.tipo,
        descricao: item.descricao,
        valor: item.valor,
        data: item.data,
        contaId: item.contaId,
        categoriaId: item.categoriaId === SEM_CATEGORIA ? null : item.categoriaId,
        estaPago: item.estaPago,
        dataDoPagamento: item.estaPago ? item.data || null : null,
        parcelas: 1,
      }))

      const resposta = await salvarLancamento(entradas)
      setResultado(resposta)
      if (resposta.ok) {
        setConcluido(true)
        const primeiraData = valores.itens[0]?.data || hoje
        router.replace(`/inicio?mes=${primeiraData.slice(0, 7)}`)
      }
    })
  })

  return (
    <div className="flex flex-col gap-[var(--esp-5)]">
      {/* Seletor de Modo: Simples ou Lote */}
      <Tabs
        value={modo}
        onValueChange={(v) => {
          setResultado(null)
          setModo(v as 'simples' | 'lote')
        }}
        className="w-full"
      >
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="simples">{LANCAR.modoSimples}</TabsTrigger>
          <TabsTrigger value="lote">{LANCAR.modoLote}</TabsTrigger>
        </TabsList>
      </Tabs>

      {modo === 'simples' ? (
        <form onSubmit={aoEnviarSimples} className="flex flex-col gap-[var(--esp-4)]" noValidate>
          {/* Seletor de Tipo */}
          <fieldset className="flex flex-col gap-[var(--esp-2)]">
            <legend className="text-[length:var(--texto-corpo)] leading-[var(--texto-corpo-lh)] font-medium">
              {LANCAR.tipoRotulo}
            </legend>
            <div className="mt-[var(--esp-2)] grid grid-cols-3 gap-[var(--esp-2)]">
              {OPCOES_DE_TIPO.map((opcao) => (
                <label
                  key={opcao.valor}
                  className={cn(
                    'border-input has-[:focus-visible]:ring-ring/50 has-[:focus-visible]:border-ring flex min-h-[44px] cursor-pointer items-center justify-center rounded-lg border px-[var(--esp-2)] text-center text-[length:var(--texto-apoio)] leading-[var(--texto-apoio-lh)] font-medium has-[:focus-visible]:ring-3 sm:text-[length:var(--texto-corpo)]',
                    tipo === opcao.valor
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background hover:bg-muted/40',
                  )}
                >
                  <input
                    type="radio"
                    value={opcao.valor}
                    className="sr-only"
                    {...register('tipo', {
                      onChange: (e) => {
                        const novoTipo = e.target.value
                        const atual = categorias.find((c) => c.id === getValues('categoriaId'))
                        if (atual && atual.tipo !== novoTipo && atual.tipo !== 'todos') {
                          setValue('categoriaId', SEM_CATEGORIA)
                        }
                      },
                    })}
                  />
                  {opcao.rotulo}
                </label>
              ))}
            </div>
            <CampoErro id="erro-tipo" mensagens={erros?.tipo} />
          </fieldset>

          {/* Descrição */}
          <div className="flex flex-col gap-[var(--esp-2)]">
            <Label htmlFor="descricao">{LANCAR.descricaoLabel}</Label>
            <Input
              id="descricao"
              placeholder={
                tipo === 'transferencia'
                  ? 'Ex.: Transferência para reserva'
                  : LANCAR.descricaoPlaceholder
              }
              autoComplete="off"
              disabled={pendente}
              aria-invalid={erros?.descricao ? true : undefined}
              aria-describedby={erros?.descricao ? 'erro-descricao' : undefined}
              {...register('descricao')}
            />
            <CampoErro id="erro-descricao" mensagens={erros?.descricao} />
          </div>

          {/* Valor */}
          <div className="flex flex-col gap-[var(--esp-2)]">
            <Label htmlFor="valor">{LANCAR.valorLabel}</Label>
            <Input
              id="valor"
              inputMode="decimal"
              placeholder={LANCAR.valorPlaceholder}
              autoComplete="off"
              className="font-mono num-tabular"
              disabled={pendente}
              aria-invalid={erros?.valor ? true : undefined}
              aria-describedby={cn('ajuda-valor', erros?.valor && 'erro-valor')}
              {...register('valor')}
            />
            <p
              id="ajuda-valor"
              className="text-muted-foreground text-[length:var(--texto-apoio)] leading-[var(--texto-apoio-lh)]"
            >
              {LANCAR.valorApoio}
            </p>
            <CampoErro id="erro-valor" mensagens={erros?.valor} />
          </div>

          {/* Data */}
          <div className="flex flex-col gap-[var(--esp-2)]">
            <Label htmlFor="data">{LANCAR.dataLabel}</Label>
            <Input
              id="data"
              type="date"
              disabled={pendente}
              aria-invalid={erros?.data ? true : undefined}
              aria-describedby={erros?.data ? 'erro-data' : undefined}
              {...register('data', {
                onChange: (e) => {
                  if (!pagamentoEditado.current && e.target.value) {
                    setValue('dataDoPagamento', e.target.value)
                  }
                },
              })}
            />
            <CampoErro id="erro-data" mensagens={erros?.data} />
          </div>

          {/* Conta de Origem */}
          <div className="flex flex-col gap-[var(--esp-2)]">
            <Label htmlFor="contaId">
              {tipo === 'transferencia' ? LANCAR.contaOrigemLabel : LANCAR.contaLabel}
            </Label>
            <Controller
              control={control}
              name="contaId"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange} disabled={pendente}>
                  <SelectTrigger
                    id="contaId"
                    className="w-full"
                    aria-invalid={erros?.contaId ? true : undefined}
                    aria-describedby={erros?.contaId ? 'erro-contaId' : undefined}
                  >
                    <SelectValue placeholder={LANCAR.contaPlaceholder} />
                  </SelectTrigger>
                  <SelectContent>
                    {contas.map((conta) => (
                      <SelectItem key={conta.id} value={conta.id}>
                        {conta.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <CampoErro id="erro-contaId" mensagens={erros?.contaId} />
          </div>

          {/* Rótulo de fatura ao vivo (para cartão de crédito) */}
          {rotuloFatura && tipo === 'despesa' ? (
            <div className="border-border-input flex items-center gap-[var(--esp-2)] rounded-lg border bg-muted/40 px-[var(--esp-3)] py-[var(--esp-2)] text-[length:var(--texto-apoio)] leading-[var(--texto-apoio-lh)] text-foreground">
              <CreditCard className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span>
                {LANCAR.vaiParaFatura(rotuloFatura)}{' '}
                <span className="text-muted-foreground">
                  (fechamento dia {contaAtual?.closing_day})
                </span>
                .
              </span>
            </div>
          ) : null}

          {/* Conta de Destino (somente para Transferência) */}
          {tipo === 'transferencia' ? (
            <div className="flex flex-col gap-[var(--esp-2)]">
              <Label htmlFor="contaDestinoId">
                <span className="flex items-center gap-[var(--esp-1)]">
                  <ArrowRightLeft className="size-3.5" aria-hidden="true" />
                  {LANCAR.contaDestinoLabel}
                </span>
              </Label>
              <Controller
                control={control}
                name="contaDestinoId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange} disabled={pendente}>
                    <SelectTrigger
                      id="contaDestinoId"
                      className="w-full"
                      aria-invalid={erros?.contaDestinoId ? true : undefined}
                      aria-describedby={erros?.contaDestinoId ? 'erro-contaDestinoId' : undefined}
                    >
                      <SelectValue placeholder={LANCAR.contaDestinoPlaceholder} />
                    </SelectTrigger>
                    <SelectContent>
                      {contasDestinoDisponiveis.map((conta) => (
                        <SelectItem key={conta.id} value={conta.id}>
                          {conta.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <CampoErro id="erro-contaDestinoId" mensagens={erros?.contaDestinoId} />
            </div>
          ) : (
            /* Categoria (oculta em transferências) */
            <div className="flex flex-col gap-[var(--esp-2)]">
              <Label htmlFor="categoriaId">
                {LANCAR.categoriaLabel}{' '}
                <span className="text-muted-foreground font-normal">{LANCAR.categoriaOpcional}</span>
              </Label>
              <Controller
                control={control}
                name="categoriaId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange} disabled={pendente}>
                    <SelectTrigger
                      id="categoriaId"
                      className="w-full"
                      aria-invalid={erros?.categoriaId ? true : undefined}
                      aria-describedby={erros?.categoriaId ? 'erro-categoriaId' : undefined}
                    >
                      <SelectValue placeholder={LANCAR.categoriaPlaceholder} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SEM_CATEGORIA}>{LANCAR.semCategoria}</SelectItem>
                      {categoriasDoTipo.map((categoria) => (
                        <SelectItem key={categoria.id} value={categoria.id}>
                          {categoria.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <CampoErro id="erro-categoriaId" mensagens={erros?.categoriaId} />
            </div>
          )}

          {/* Parcelas (somente para Despesas) */}
          {tipo === 'despesa' ? (
            <div className="flex flex-col gap-[var(--esp-2)]">
              <Label htmlFor="parcelas">{LANCAR.parcelasLabel}</Label>
              <Controller
                control={control}
                name="parcelas"
                render={({ field }) => (
                  <Select
                    value={String(field.value || 1)}
                    onValueChange={(v) => field.onChange(Number(v))}
                    disabled={pendente}
                  >
                    <SelectTrigger id="parcelas" className="w-full">
                      <SelectValue placeholder={LANCAR.parcelasPlaceholder} />
                    </SelectTrigger>
                    <SelectContent>
                      {OPCOES_DE_PARCELAS.map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n === 1 ? '1x (à vista)' : `${n}x`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {parcelas > 1 ? (
                <p className="text-muted-foreground text-[length:var(--texto-apoio)] leading-[var(--texto-apoio-lh)]">
                  As {parcelas} parcelas serão agendadas mês a mês automaticamente.
                </p>
              ) : null}
              <CampoErro id="erro-parcelas" mensagens={erros?.parcelas} />
            </div>
          ) : null}

          {/* Status: Pago */}
          <div className="flex flex-col gap-[var(--esp-2)]">
            <Controller
              control={control}
              name="estaPago"
              render={({ field }) => (
                <label className="border-input flex min-h-[44px] cursor-pointer items-center gap-[var(--esp-3)] rounded-lg border px-[var(--esp-3)]">
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={(marcado) => field.onChange(marcado === true)}
                    disabled={pendente}
                  />
                  <span className="text-[length:var(--texto-corpo)] leading-[var(--texto-corpo-lh)]">
                    {tipo === 'despesa'
                      ? LANCAR.statusRotuloDespesa
                      : tipo === 'receita'
                        ? LANCAR.statusRotuloReceita
                        : LANCAR.statusRotuloTransferencia}
                  </span>
                </label>
              )}
            />
            <CampoErro id="erro-estaPago" mensagens={erros?.estaPago} />
          </div>

          {/* Data do Pagamento */}
          {estaPago ? (
            <div className="flex flex-col gap-[var(--esp-2)]">
              <Label htmlFor="dataDoPagamento">
                {tipo === 'despesa'
                  ? LANCAR.dataPagamentoLabelDespesa
                  : tipo === 'receita'
                    ? LANCAR.dataPagamentoLabelReceita
                    : LANCAR.dataPagamentoLabelTransferencia}
              </Label>
              <Input
                id="dataDoPagamento"
                type="date"
                disabled={pendente}
                aria-invalid={erros?.dataDoPagamento ? true : undefined}
                aria-describedby={erros?.dataDoPagamento ? 'erro-dataDoPagamento' : undefined}
                {...register('dataDoPagamento', {
                  onChange: () => {
                    pagamentoEditado.current = true
                  },
                })}
              />
              <CampoErro id="erro-dataDoPagamento" mensagens={erros?.dataDoPagamento} />
            </div>
          ) : null}

          {/* Alerta de erro geral */}
          {erroGeral ? (
            <Alert variant="destructive">
              <AlertDescription>{erroGeral}</AlertDescription>
            </Alert>
          ) : null}

          {/* Ações */}
          <div className="flex flex-col gap-[var(--esp-2)]">
            <Button type="submit" size="toque" disabled={pendente || concluido} className="w-full">
              {pendente || concluido ? LANCAR.enviando : LANCAR.enviar}
            </Button>
            <Link
              href="/inicio"
              className={cn(buttonVariants({ variant: 'ghost', size: 'toque' }), 'w-full')}
            >
              {LANCAR.cancelar}
            </Link>
          </div>
        </form>
      ) : (
        /* Formulário em Lote */
        <form onSubmit={aoEnviarLote} className="flex flex-col gap-[var(--esp-4)]" noValidate>
          <div className="flex items-center justify-between">
            <span className="text-[length:var(--texto-apoio)] text-muted-foreground">
              {LANCAR.itensNoLote(camposLote.length)}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                adicionarItemLote({
                  tipo: 'despesa',
                  descricao: '',
                  valor: '',
                  data: hoje,
                  contaId: contas[0]?.id ?? '',
                  categoriaId: SEM_CATEGORIA,
                  estaPago: true,
                })
              }
              disabled={pendente}
              className="gap-[var(--esp-1)]"
            >
              <Plus className="size-4" aria-hidden="true" />
              {LANCAR.adicionarItem}
            </Button>
          </div>

          <div className="flex flex-col gap-[var(--esp-3)]">
            {camposLote.map((item, index) => (
              <div
                key={item.id}
                className="border-input flex flex-col gap-[var(--esp-3)] rounded-lg border bg-card p-[var(--esp-3)]"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[length:var(--texto-apoio)] font-semibold text-muted-foreground">
                    #{index + 1}
                  </span>
                  {camposLote.length > 1 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removerItemLote(index)}
                      disabled={pendente}
                      className="text-muted-foreground hover:text-destructive h-8 px-2"
                    >
                      <Trash2 className="size-3.5" aria-hidden="true" />
                      <span className="sr-only">{LANCAR.removerItem}</span>
                    </Button>
                  ) : null}
                </div>

                <div className="grid grid-cols-2 gap-[var(--esp-2)]">
                  {/* Tipo */}
                  <Controller
                    control={controlLote}
                    name={`itens.${index}.tipo`}
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange} disabled={pendente}>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="despesa">{LANCAR.despesa}</SelectItem>
                          <SelectItem value="receita">{LANCAR.receita}</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />

                  {/* Valor */}
                  <Input
                    placeholder="0,00"
                    inputMode="decimal"
                    className="font-mono num-tabular"
                    disabled={pendente}
                    {...registerLote(`itens.${index}.valor`)}
                  />
                </div>

                {/* Descrição */}
                <Input
                  placeholder="Descrição (ex.: Padaria)"
                  disabled={pendente}
                  {...registerLote(`itens.${index}.descricao`)}
                />

                <div className="grid grid-cols-2 gap-[var(--esp-2)]">
                  {/* Data */}
                  <Input
                    type="date"
                    disabled={pendente}
                    {...registerLote(`itens.${index}.data`)}
                  />

                  {/* Conta */}
                  <Controller
                    control={controlLote}
                    name={`itens.${index}.contaId`}
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange} disabled={pendente}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Conta" />
                        </SelectTrigger>
                        <SelectContent>
                          {contas.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
              </div>
            ))}
          </div>

          {erroGeral ? (
            <Alert variant="destructive">
              <AlertDescription>{erroGeral}</AlertDescription>
            </Alert>
          ) : null}

          <div className="flex flex-col gap-[var(--esp-2)]">
            <Button type="submit" size="toque" disabled={pendente || concluido} className="w-full">
              {pendente || concluido ? LANCAR.enviando : LANCAR.enviarLote(camposLote.length)}
            </Button>
            <Link
              href="/inicio"
              className={cn(buttonVariants({ variant: 'ghost', size: 'toque' }), 'w-full')}
            >
              {LANCAR.cancelar}
            </Link>
          </div>
        </form>
      )}
    </div>
  )
}
