'use client'

import { useEffect, useLayoutEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, ChevronDown, CreditCard, Plus, Trash2 } from 'lucide-react'
import { Controller, useFieldArray, useForm } from 'react-hook-form'
import { salvarLancamento, type EntradaDeLancamento, type Lancamento } from '@/actions/lancamento'
import { criarRecorrencia, type EntradaCriarRecorrencia } from '@/actions/recorrencia'
import { Switch } from '@/components/ui/switch'
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
import { tocarSomErro, tocarSomSucesso } from '@/features/sons/sons'
import { hapticFeedback } from '@/lib/haptics'
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
  grupoId: string | null
}

export interface OpcaoDeGrupo {
  id: string
  nome: string
}

export interface OpcaoDeMembro {
  id: string
  nome: string
}

export interface OpcaoDeFormaDePagamento {
  id: string
  nome: string
}

export interface FormLancamentoProps {
  contas: OpcaoDeConta[]
  categorias: OpcaoDeCategoria[]
  grupos?: OpcaoDeGrupo[]
  membros?: OpcaoDeMembro[]
  membroAtualId?: string
  formasDePagamento?: OpcaoDeFormaDePagamento[]
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
  responsavelId: string
  pagoPorId: string
  formaDePagamentoId: string
  observacao: string
  parcelas: number
  estaPago: boolean
  dataDoPagamento: string
  ehBeneficio: boolean
  ehFutil: boolean
  rotuloDoFutil: string
  repetirTodoMes: boolean
}

interface ItemLote {
  tipo: 'despesa' | 'receita'
  descricao: string
  valor: string
  data: string
  contaId: string
  categoriaId: string
  estaPago: boolean
  dataDoPagamento: string
  formaDePagamentoId: string
  observacao: string
  responsavelId: string
  pagoPorId: string
  ehBeneficio: boolean
  ehFutil: boolean
  rotuloDoFutil: string
}

interface CamposLote {
  itens: ItemLote[]
}

const SEM_CATEGORIA = '__sem_categoria__'
const SEM_RESPONSAVEL = '__sem_responsavel__'
const SEM_PAGADOR = '__sem_pagador__'
const SEM_FORMA_PAGAMENTO = '__sem_forma_pagamento__'

const OPCOES_DE_TIPO: { valor: TipoDoFormulario; rotulo: string }[] = [
  { valor: 'despesa', rotulo: LANCAR.despesa },
  { valor: 'receita', rotulo: LANCAR.receita },
  { valor: 'transferencia', rotulo: LANCAR.transferencia },
]

const OPCOES_DE_PARCELAS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 18, 24]

function valoresIniciaisSimples(
  hoje: string,
  contas: OpcaoDeConta[],
  membros?: OpcaoDeMembro[],
  membroAtualId?: string,
): CamposSimples {
  const primeiraConta = contas[0]
  const ehCartaoPrimeira = primeiraConta?.tipo === 'cartao'
  const pagadorPadrao =
    membroAtualId && membros?.some((m) => m.id === membroAtualId)
      ? membroAtualId
      : SEM_PAGADOR

  return {
    tipo: 'despesa',
    descricao: '',
    valor: '',
    data: hoje,
    contaId: primeiraConta?.id ?? '',
    contaDestinoId: contas[1]?.id ?? '',
    categoriaId: SEM_CATEGORIA,
    responsavelId: SEM_RESPONSAVEL,
    pagoPorId: pagadorPadrao,
    formaDePagamentoId: SEM_FORMA_PAGAMENTO,
    observacao: '',
    parcelas: 1,
    estaPago: ehCartaoPrimeira ? false : true,
    dataDoPagamento: hoje,
    ehBeneficio: false,
    ehFutil: false,
    rotuloDoFutil: '',
    repetirTodoMes: false,
  }
}

function itemLoteVazio(
  hoje: string,
  contas: OpcaoDeConta[],
  membros?: OpcaoDeMembro[],
  membroAtualId?: string,
): ItemLote {
  const primeiraConta = contas[0]
  const ehCartaoPrimeira = primeiraConta?.tipo === 'cartao'
  const pagadorPadrao =
    membroAtualId && membros?.some((m) => m.id === membroAtualId)
      ? membroAtualId
      : SEM_PAGADOR

  return {
    tipo: 'despesa',
    descricao: '',
    valor: '',
    data: hoje,
    contaId: primeiraConta?.id ?? '',
    categoriaId: SEM_CATEGORIA,
    estaPago: ehCartaoPrimeira ? false : true,
    dataDoPagamento: hoje,
    formaDePagamentoId: SEM_FORMA_PAGAMENTO,
    observacao: '',
    responsavelId: SEM_RESPONSAVEL,
    pagoPorId: pagadorPadrao,
    ehBeneficio: false,
    ehFutil: false,
    rotuloDoFutil: '',
  }
}

/**
 * Destino depois de salvar: o mês do lançamento, com `novo` (id para o Início
 * mostrar o aviso e destacar a linha) e `qtd` quando foi lote.
 *
 * Em parcelado a action devolve uma linha por parcela; o id escolhido é o da
 * parcela que cai no mês de destino, para o destaque aparecer na lista aberta.
 */
function destinoAposSalvar(dataISO: string, salvos: Lancamento[], quantidade: number): string {
  const mes = dataISO.slice(0, 7)
  const parametros = new URLSearchParams({ mes })
  const doMes = salvos.find((l) => l.date.startsWith(mes)) ?? salvos[0]
  if (doMes) parametros.set('novo', doMes.id)
  if (quantidade > 1) parametros.set('qtd', String(quantidade))
  return `/inicio?${parametros.toString()}`
}

export function FormLancamento({
  contas,
  categorias,
  grupos = [],
  membros = [],
  membroAtualId,
  formasDePagamento = [],
  hoje,
}: FormLancamentoProps) {
  const router = useRouter()
  const [modo, setModo] = useState<'simples' | 'lote'>('simples')
  const [pendente, iniciarEnvio] = useTransition()
  const [resultado, setResultado] = useState<ResultadoAction<unknown> | null>(null)
  const [mensagemToast, setMensagemToast] = useState<string | null>(null)
  const [concluido, setConcluido] = useState(false)
  const [maisDetalhesAberto, setMaisDetalhesAberto] = useState(false)
  const [grupoFiltrado, setGrupoFiltrado] = useState<string | null>(null)
  const [detalhesLoteAbertos, setDetalhesLoteAbertos] = useState<Record<number, boolean>>({})

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
    reset,
  } = useForm<CamposSimples>({
    defaultValues: valoresIniciaisSimples(hoje, contas, membros, membroAtualId),
  })

  const pagamentoEditado = useRef(false)
  // Ligado só depois de um salvamento OK; ver o useLayoutEffect de reinício.
  const deveReiniciar = useRef(false)
  // Props mais recentes para o reinício: `reset()` sem argumento voltaria aos
  // valores do PRIMEIRO render (conta arquivada/reordenada, `hoje` velho).
  const propsAtuais = useRef({ hoje, contas, membros, membroAtualId })
  useEffect(() => {
    propsAtuais.current = { hoje, contas, membros, membroAtualId }
  }, [hoje, contas, membros, membroAtualId])

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
  const repetirTodoMes = watch('repetirTodoMes')
  const ehFutil = watch('ehFutil')

  const contaAtual = contas.find((c) => c.id === contaId)
  const ehContaCartao = contaAtual?.tipo === 'cartao'
  const ehCartao = ehContaCartao && contaAtual?.closing_day != null

  useEffect(() => {
    if (ehContaCartao) {
      setValue('estaPago', false)
    }
  }, [ehContaCartao, setValue])

  useEffect(() => {
    if (tipo === 'transferencia' && repetirTodoMes) {
      setValue('repetirTodoMes', false)
    }
  }, [tipo, repetirTodoMes, setValue])

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
    (c) =>
      (c.tipo === tipo || c.tipo === 'todos') &&
      (grupoFiltrado === null || c.grupoId === grupoFiltrado),
  )

  const contasDestinoDisponiveis = contas.filter((c) => c.id !== contaId)

  const erros = resultado && !resultado.ok ? resultado.camposComErro : undefined
  const erroGeral = resultado && !resultado.ok ? resultado.erro : undefined

  const aoEnviarSimples = handleSubmit((valores) => {
    setResultado(null)
    iniciarEnvio(async () => {
      const responsavelIdLimpo =
        valores.tipo === 'transferencia' || valores.responsavelId === SEM_RESPONSAVEL || !valores.responsavelId
          ? null
          : valores.responsavelId
      const pagoPorIdLimpo =
        valores.tipo === 'transferencia' || valores.pagoPorId === SEM_PAGADOR || !valores.pagoPorId
          ? null
          : valores.pagoPorId
      const formaDePagamentoIdLimpo =
        valores.formaDePagamentoId === SEM_FORMA_PAGAMENTO || !valores.formaDePagamentoId
          ? null
          : valores.formaDePagamentoId
      const observacaoLimpa = valores.observacao?.trim() || null

      if (valores.repetirTodoMes && (valores.tipo === 'despesa' || valores.tipo === 'receita')) {
        const ehDespesa = valores.tipo === 'despesa'
        const entradaRecorrencia: EntradaCriarRecorrencia = {
          tipo: valores.tipo,
          descricao: valores.descricao,
          valor: valores.valor,
          data: valores.data,
          contaId: valores.contaId,
          categoriaId:
            valores.categoriaId === SEM_CATEGORIA ? null : valores.categoriaId,
          responsavelId: responsavelIdLimpo,
          pagoPorId: pagoPorIdLimpo,
          formaDePagamentoId: formaDePagamentoIdLimpo,
          observacao: observacaoLimpa,
          estaPago: ehContaCartao ? false : valores.estaPago,
          dataDoPagamento:
            !ehContaCartao && valores.estaPago ? valores.dataDoPagamento || null : null,
          ehBeneficio: ehDespesa ? valores.ehBeneficio : false,
          ehFutil: ehDespesa ? valores.ehFutil : false,
          rotuloDoFutil:
            ehDespesa && valores.ehFutil && valores.rotuloDoFutil.trim()
              ? valores.rotuloDoFutil.trim()
              : null,
        }

        const resposta = await criarRecorrencia(entradaRecorrencia)
        setResultado(resposta)
        if (resposta.ok) {
          tocarSomSucesso()
          hapticFeedback.success()
          setConcluido(true)
          deveReiniciar.current = true
          setMensagemToast(`Recorrência criada! ${resposta.dados.lancamentosGerados} meses agendados.`)
          router.refresh()
          setTimeout(() => {
            router.replace(`/inicio?mes=${valores.data.slice(0, 7)}`)
          }, 1200)
        } else {
          tocarSomErro()
          hapticFeedback.warning()
        }
        return
      }

      const ehDespesa = valores.tipo === 'despesa'
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
        responsavelId: responsavelIdLimpo,
        pagoPorId: pagoPorIdLimpo,
        formaDePagamentoId: formaDePagamentoIdLimpo,
        observacao: observacaoLimpa,
        parcelas: ehDespesa ? valores.parcelas : 1,
        estaPago: ehContaCartao ? false : valores.estaPago,
        dataDoPagamento: !ehContaCartao && valores.estaPago ? valores.dataDoPagamento || null : null,
        ehBeneficio: ehDespesa ? valores.ehBeneficio : false,
        ehFutil: ehDespesa ? valores.ehFutil : false,
        rotuloDoFutil:
          ehDespesa && valores.ehFutil && valores.rotuloDoFutil.trim()
            ? valores.rotuloDoFutil.trim()
            : null,
      }

      const resposta = await salvarLancamento(entrada)
      setResultado(resposta)
      if (resposta.ok) {
        tocarSomSucesso()
        hapticFeedback.success()
        setConcluido(true)
        deveReiniciar.current = true
        setTimeout(() => {
          router.replace(destinoAposSalvar(valores.data, resposta.dados, 1))
        }, 120)
      } else {
        tocarSomErro()
        hapticFeedback.warning()
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
    watch: watchLote,
    reset: resetLote,
    setValue: setValueLote,
  } = useForm<CamposLote>({
    defaultValues: {
      itens: [
        itemLoteVazio(hoje, contas, membros, membroAtualId),
        itemLoteVazio(hoje, contas, membros, membroAtualId),
      ],
    },
  })

  const { fields: camposLote, append: adicionarItemLote, remove: removerItemLote } =
    useFieldArray({
      control: controlLote,
      name: 'itens',
    })

  const itensAssistidos = watchLote('itens')

  // -------------------------------------------------------------------------
  // Reinício ao sair da tela depois de salvar
  // -------------------------------------------------------------------------
  // Com `cacheComponents`, o Next 16 não desmonta a rota ao navegar: esconde em
  // <Activity hidden> e preserva estado e inputs. Sem isto, voltar ao Lançar
  // mostrava o lançamento anterior preenchido e o botão travado em "Salvando…"
  // (concluido=true), impedindo o próximo. Padrão da doc empacotada do Next:
  // node_modules/next/dist/docs/01-app/02-guides/preserving-ui-state.md,
  // "Resetting stale status messages". O cleanup roda quando a rota é
  // escondida, isto é, DEPOIS da navegação: o botão continua desabilitado até
  // a página mudar (sem duplo envio). Rascunho não salvo é preservado: só
  // reinicia quando `deveReiniciar` foi ligado por um salvamento bem-sucedido.
  useLayoutEffect(() => {
    return () => {
      if (!deveReiniciar.current) return
      deveReiniciar.current = false
      pagamentoEditado.current = false
      const { hoje: hojeAtual, contas: contasAtuais, membros: membrosAtuais, membroAtualId: membroAtualIdAtual } = propsAtuais.current
      reset(valoresIniciaisSimples(hojeAtual, contasAtuais, membrosAtuais, membroAtualIdAtual))
      resetLote({
        itens: [
          itemLoteVazio(hojeAtual, contasAtuais, membrosAtuais, membroAtualIdAtual),
          itemLoteVazio(hojeAtual, contasAtuais, membrosAtuais, membroAtualIdAtual),
        ],
      })
      setResultado(null)
      setConcluido(false)
      setModo('simples')
      setMensagemToast(null)
      setGrupoFiltrado(null)
      setMaisDetalhesAberto(false)
      setDetalhesLoteAbertos({})
    }
  }, [reset, resetLote])

  const aoEnviarLote = handleSubmitLote((valores) => {
    setResultado(null)
    iniciarEnvio(async () => {
      const entradas: EntradaDeLancamento[] = valores.itens.map((item) => {
        const contaDoItem = contas.find((c) => c.id === item.contaId)
        const ehCartaoItem = contaDoItem?.tipo === 'cartao'
        const estaPagoItem = ehCartaoItem ? false : item.estaPago
        const ehDespesa = item.tipo === 'despesa'
        return {
          tipo: item.tipo,
          descricao: item.descricao,
          valor: item.valor,
          data: item.data,
          contaId: item.contaId,
          categoriaId: item.categoriaId === SEM_CATEGORIA ? null : (item.categoriaId || null),
          estaPago: estaPagoItem,
          dataDoPagamento: !ehCartaoItem && estaPagoItem ? item.dataDoPagamento || item.data || null : null,
          formaDePagamentoId:
            item.formaDePagamentoId === SEM_FORMA_PAGAMENTO || !item.formaDePagamentoId
              ? null
              : item.formaDePagamentoId,
          observacao: item.observacao?.trim() || null,
          responsavelId:
            item.responsavelId === SEM_RESPONSAVEL || !item.responsavelId
              ? null
              : item.responsavelId,
          pagoPorId:
            item.pagoPorId === SEM_PAGADOR || !item.pagoPorId
              ? null
              : item.pagoPorId,
          parcelas: 1,
          ehBeneficio: ehDespesa ? item.ehBeneficio : false,
          ehFutil: ehDespesa ? item.ehFutil : false,
          rotuloDoFutil:
            ehDespesa && item.ehFutil && item.rotuloDoFutil.trim()
              ? item.rotuloDoFutil.trim()
              : null,
        }
      })

      const resposta = await salvarLancamento(entradas)
      setResultado(resposta)
      if (resposta.ok) {
        tocarSomSucesso()
        hapticFeedback.success()
        setConcluido(true)
        deveReiniciar.current = true
        const primeiraData = valores.itens[0]?.data || hoje
        setTimeout(() => {
          router.replace(destinoAposSalvar(primeiraData, resposta.dados, valores.itens.length))
        }, 120)
      } else {
        tocarSomErro()
        hapticFeedback.warning()
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
          <TabsTrigger
            value="simples"
            onClick={() => {
              setResultado(null)
              setModo('simples')
            }}
          >
            {LANCAR.modoSimples}
          </TabsTrigger>
          <TabsTrigger
            value="lote"
            onClick={() => {
              setResultado(null)
              setModo('lote')
            }}
          >
            {LANCAR.modoLote}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {modo === 'simples' ? (
        /* Formulário Simples */
        <form onSubmit={aoEnviarSimples} className="flex flex-col gap-[var(--esp-4)]" noValidate>
          {/* Tipo de lançamento (radio-group segmentado) */}
          <div className="flex flex-col gap-[var(--esp-2)]">
            <Label>{LANCAR.tipoRotulo}</Label>
            <div
              role="radiogroup"
              aria-label={LANCAR.tipoRotulo}
              className="grid grid-cols-3 gap-[var(--esp-2)]"
            >
              {OPCOES_DE_TIPO.map((opcao) => {
                const ativo = tipo === opcao.valor
                return (
                  <button
                    key={opcao.valor}
                    type="button"
                    role="radio"
                    aria-checked={ativo}
                    onClick={() => {
                      setValue('tipo', opcao.valor)
                      setValue('categoriaId', SEM_CATEGORIA)
                    }}
                    disabled={pendente}
                    className={cn(
                      'flex min-h-[44px] cursor-pointer items-center justify-center rounded-lg border text-[length:var(--texto-apoio)] font-medium transition-colors',
                      ativo
                        ? 'border-primary bg-primary text-primary-foreground font-semibold shadow-xs'
                        : 'border-input bg-card text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    {opcao.rotulo}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Descrição */}
          <div className="flex flex-col gap-[var(--esp-2)]">
            <Label htmlFor="descricao">{LANCAR.descricaoLabel}</Label>
            <Input
              id="descricao"
              placeholder={LANCAR.descricaoPlaceholder}
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
            <div className="relative">
              <span
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[length:var(--texto-corpo)] font-medium text-muted-foreground"
                aria-hidden="true"
              >
                R$
              </span>
              <Input
                id="valor"
                placeholder="0,00"
                inputMode="decimal"
                disabled={pendente}
                className="pl-9 font-mono text-[length:var(--texto-corpo)] num-tabular"
                aria-invalid={erros?.valor ? true : undefined}
                aria-describedby={erros?.valor ? 'erro-valor' : undefined}
                {...register('valor')}
              />
            </div>
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
                  if (!pagamentoEditado.current && estaPago) {
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
                    {contas.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <CampoErro id="erro-contaId" mensagens={erros?.contaId} />
            {rotuloFatura && (
              <p
                role="status"
                aria-live="polite"
                className="text-muted-foreground flex items-center gap-[var(--esp-1)] text-[length:var(--texto-apoio)] leading-[var(--texto-apoio-lh)]"
              >
                <CreditCard className="size-3.5 shrink-0" aria-hidden="true" />
                <span>{LANCAR.vaiParaFatura(rotuloFatura)}</span>
              </p>
            )}
          </div>

          {/* Conta de Destino (apenas para Transferência) */}
          {tipo === 'transferencia' ? (
            <div className="flex flex-col gap-[var(--esp-2)]">
              <Label htmlFor="contaDestinoId">{LANCAR.contaDestinoLabel}</Label>
              <Controller
                control={control}
                name="contaDestinoId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange} disabled={pendente}>
                    <SelectTrigger
                      id="contaDestinoId"
                      className="w-full"
                      aria-invalid={erros?.contaDestinoId ? true : undefined}
                      aria-describedby={
                        erros?.contaDestinoId ? 'erro-contaDestinoId' : undefined
                      }
                    >
                      <SelectValue placeholder={LANCAR.contaDestinoPlaceholder} />
                    </SelectTrigger>
                    <SelectContent>
                      {contasDestinoDisponiveis.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <CampoErro id="erro-contaDestinoId" mensagens={erros?.contaDestinoId} />
            </div>
          ) : (
            /* Categoria + filtro de grupo (oculto em transferências) */
            <div key="campo-categoria" className="flex flex-col gap-[var(--esp-2)]">
              {grupos.length > 0 && (
                <div className="flex flex-col gap-[var(--esp-2)]">
                  <Label htmlFor="filtro-grupo">{LANCAR.filtroGrupoLabel}</Label>
                  <Select
                    value={grupoFiltrado ?? '__todas__'}
                    onValueChange={(v) => {
                      const novoGrupo = v === '__todas__' ? null : v
                      setGrupoFiltrado(novoGrupo)
                      const catAtual = categorias.find((c) => c.id === getValues('categoriaId'))
                      if (catAtual && novoGrupo !== null && catAtual.grupoId !== novoGrupo) {
                        setValue('categoriaId', SEM_CATEGORIA)
                      }
                    }}
                    disabled={pendente}
                  >
                    <SelectTrigger id="filtro-grupo" className="w-full">
                      <SelectValue placeholder={LANCAR.filtroGrupoTodas} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__todas__">{LANCAR.filtroGrupoTodas}</SelectItem>
                      {grupos.map((g) => (
                        <SelectItem key={g.id} value={g.id}>
                          {g.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

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

          {/* Responsável (apenas receita ou despesa e quando houver membros) */}
          {tipo !== 'transferencia' && membros.length > 0 ? (
            <div className="flex flex-col gap-[var(--esp-2)]">
              <Label htmlFor="responsavelId">
                Responsável <span className="text-muted-foreground font-normal">(opcional)</span>
              </Label>
              <Controller
                control={control}
                name="responsavelId"
                render={({ field }) => (
                  <Select
                    value={field.value || SEM_RESPONSAVEL}
                    onValueChange={field.onChange}
                    disabled={pendente}
                  >
                    <SelectTrigger
                      id="responsavelId"
                      className="w-full"
                      aria-invalid={erros?.responsavelId ? true : undefined}
                      aria-describedby={erros?.responsavelId ? 'erro-responsavelId' : undefined}
                    >
                      <SelectValue placeholder="Sem responsável específico" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SEM_RESPONSAVEL}>Sem responsável específico</SelectItem>
                      {membros.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <CampoErro id="erro-responsavelId" mensagens={erros?.responsavelId} />
            </div>
          ) : null}

          {/* Pago por (apenas receita ou despesa e quando houver membros) */}
          {tipo !== 'transferencia' && membros.length > 0 ? (
            <div className="flex flex-col gap-[var(--esp-2)]">
              <Label htmlFor="pagoPorId">
                Pago por
              </Label>
              <Controller
                control={control}
                name="pagoPorId"
                render={({ field }) => (
                  <Select
                    value={field.value || SEM_PAGADOR}
                    onValueChange={field.onChange}
                    disabled={pendente}
                  >
                    <SelectTrigger
                      id="pagoPorId"
                      className="w-full"
                      aria-invalid={erros?.pagoPorId ? true : undefined}
                      aria-describedby={erros?.pagoPorId ? 'erro-pagoPorId' : undefined}
                    >
                      <SelectValue placeholder="Selecione quem pagou" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SEM_PAGADOR}>Sem pagador específico</SelectItem>
                      {membros.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <CampoErro id="erro-pagoPorId" mensagens={erros?.pagoPorId} />
            </div>
          ) : null}

          {/* Repetir todo mês (somente para Despesa ou Receita, mutuamente exclusivo com Parcelas) */}
          {(tipo === 'despesa' || tipo === 'receita') && parcelas <= 1 ? (
            <div className="flex items-center justify-between rounded-lg border border-input p-3 bg-card/40">
              <div className="flex flex-col gap-0.5">
                <Label htmlFor="repetirTodoMes" className="font-medium cursor-pointer">
                  Repetir todo mês
                </Label>
                <span className="text-[length:var(--texto-apoio)] leading-[var(--texto-apoio-lh)] text-muted-foreground">
                  Cria uma assinatura ou fixo agendado por 12 meses
                </span>
              </div>
              <Controller
                control={control}
                name="repetirTodoMes"
                render={({ field }) => (
                  <Switch
                    id="repetirTodoMes"
                    checked={field.value}
                    onCheckedChange={(checked) => {
                      field.onChange(checked)
                      if (checked) {
                        setValue('parcelas', 1)
                      }
                    }}
                    disabled={pendente}
                  />
                )}
              />
            </div>
          ) : null}

          {/* Parcelas (somente para Despesas e quando não repetir todo mês) */}
          {tipo === 'despesa' && !repetirTodoMes ? (
            <div className="flex flex-col gap-[var(--esp-2)]">
              <Label htmlFor="parcelas">{LANCAR.parcelasLabel}</Label>
              <Controller
                control={control}
                name="parcelas"
                render={({ field }) => (
                  <Select
                    value={String(field.value || 1)}
                    onValueChange={(v) => {
                      const num = Number(v)
                      field.onChange(num)
                      if (num > 1) {
                        setValue('repetirTodoMes', false)
                      }
                    }}
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

          {/* Status: Pago (oculto quando a conta é cartão — P-016) */}
          {!ehContaCartao ? (
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
          ) : null}

          {/* Data do Pagamento (apenas se pago e não for cartão) */}
          {!ehContaCartao && estaPago ? (
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

          {/* Mais detalhes (recolhido por padrão, apenas para Despesa) */}
          {tipo === 'despesa' ? (
            <div className="border-input rounded-lg border bg-card/50">
              <button
                type="button"
                onClick={() => setMaisDetalhesAberto((v) => !v)}
                aria-expanded={maisDetalhesAberto}
                className="flex min-h-[44px] w-full items-center justify-between px-[var(--esp-3)] text-left text-[length:var(--texto-apoio)] font-medium text-muted-foreground hover:text-foreground"
              >
                <span>{LANCAR.maisDetalhes}</span>
                <ChevronDown
                  className={cn(
                    'size-4 transition-transform duration-150',
                    maisDetalhesAberto && 'rotate-180',
                  )}
                  aria-hidden="true"
                />
              </button>

              {maisDetalhesAberto ? (
                <div className="border-input flex flex-col gap-[var(--esp-3)] border-t p-[var(--esp-3)]">
                  {formasDePagamento.length > 0 ? (
                    <div className="flex flex-col gap-[var(--esp-2)]">
                      <Label htmlFor="formaDePagamentoId">
                        Forma de pagamento <span className="text-muted-foreground font-normal">(opcional)</span>
                      </Label>
                      <Controller
                        control={control}
                        name="formaDePagamentoId"
                        render={({ field }) => (
                          <Select
                            value={field.value || SEM_FORMA_PAGAMENTO}
                            onValueChange={field.onChange}
                            disabled={pendente}
                          >
                            <SelectTrigger id="formaDePagamentoId" className="w-full">
                              <SelectValue placeholder="Sem forma de pagamento" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={SEM_FORMA_PAGAMENTO}>Sem forma de pagamento</SelectItem>
                              {formasDePagamento.map((f) => (
                                <SelectItem key={f.id} value={f.id}>
                                  {f.nome}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </div>
                  ) : null}

                  <div className="flex flex-col gap-[var(--esp-2)]">
                    <Label htmlFor="observacao">
                      Observação <span className="text-muted-foreground font-normal">(opcional)</span>
                    </Label>
                    <Input
                      id="observacao"
                      maxLength={500}
                      placeholder="Observação (opcional)"
                      disabled={pendente}
                      {...register('observacao')}
                    />
                  </div>

                  <Controller
                    control={control}
                    name="ehBeneficio"
                    render={({ field }) => (
                      <label className="border-input flex min-h-[44px] cursor-pointer items-center gap-[var(--esp-3)] rounded-lg border bg-background px-[var(--esp-3)]">
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={(marcado) => field.onChange(marcado === true)}
                          disabled={pendente}
                        />
                        <span className="text-[length:var(--texto-corpo)] leading-[var(--texto-corpo-lh)]">
                          {LANCAR.ehBeneficioLabel}
                        </span>
                      </label>
                    )}
                  />

                  <Controller
                    control={control}
                    name="ehFutil"
                    render={({ field }) => (
                      <label className="border-input flex min-h-[44px] cursor-pointer items-center gap-[var(--esp-3)] rounded-lg border bg-background px-[var(--esp-3)]">
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={(marcado) => field.onChange(marcado === true)}
                          disabled={pendente}
                        />
                        <span className="text-[length:var(--texto-corpo)] leading-[var(--texto-corpo-lh)]">
                          {LANCAR.ehFutilLabel}
                        </span>
                      </label>
                    )}
                  />

                  {ehFutil ? (
                    <div className="flex flex-col gap-[var(--esp-2)]">
                      <Label htmlFor="rotuloDoFutil">{LANCAR.rotuloDoFutilLabel}</Label>
                      <Input
                        id="rotuloDoFutil"
                        maxLength={60}
                        placeholder={LANCAR.rotuloDoFutilPlaceholder}
                        disabled={pendente}
                        aria-invalid={erros?.rotuloDoFutil ? true : undefined}
                        aria-describedby={erros?.rotuloDoFutil ? 'erro-rotuloDoFutil' : undefined}
                        {...register('rotuloDoFutil')}
                      />
                      <CampoErro id="erro-rotuloDoFutil" mensagens={erros?.rotuloDoFutil} />
                    </div>
                  ) : null}
                </div>
              ) : null}
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
              size="toque"
              onClick={() => adicionarItemLote(itemLoteVazio(hoje, contas, membros, membroAtualId))}
              disabled={pendente}
              className="gap-[var(--esp-1)]"
            >
              <Plus className="size-4" aria-hidden="true" />
              {LANCAR.adicionarItem}
            </Button>
          </div>

          <div className="flex flex-col gap-[var(--esp-3)]">
            {camposLote.map((item, index) => {
              const itemAtual = itensAssistidos?.[index]
              const ehDespesaItem = (itemAtual?.tipo ?? item.tipo) === 'despesa'
              const ehFutilItem = Boolean(itemAtual?.ehFutil)
              const detalheAberto = Boolean(detalhesLoteAbertos[index])
              const contaDoItem = contas.find((c) => c.id === (itemAtual?.contaId ?? item.contaId))
              const ehCartaoItem = contaDoItem?.tipo === 'cartao'

              return (
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
                        size="toque"
                        onClick={() => removerItemLote(index)}
                        disabled={pendente}
                        className="text-muted-foreground hover:text-destructive px-3"
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
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
                        <Select
                          value={field.value}
                          onValueChange={(novaContaId) => {
                            field.onChange(novaContaId)
                            const contaEscolhida = contas.find((c) => c.id === novaContaId)
                            if (contaEscolhida?.tipo === 'cartao') {
                              setValueLote(`itens.${index}.estaPago`, false)
                              setValueLote(`itens.${index}.dataDoPagamento`, '')
                            }
                          }}
                          disabled={pendente}
                        >
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

                  {/* Status Pago e Data do Pagamento (ocultos em conta cartão) */}
                  {!ehCartaoItem ? (
                    <div className="flex flex-col gap-[var(--esp-2)]">
                      <Controller
                        control={controlLote}
                        name={`itens.${index}.estaPago`}
                        render={({ field }) => (
                          <label className="border-input flex min-h-[40px] cursor-pointer items-center gap-[var(--esp-3)] rounded-lg border px-[var(--esp-3)] bg-background">
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={(marcado) => {
                                const pago = marcado === true
                                field.onChange(pago)
                                if (!pago) {
                                  setValueLote(`itens.${index}.dataDoPagamento`, '')
                                } else if (!itemAtual?.dataDoPagamento) {
                                  setValueLote(`itens.${index}.dataDoPagamento`, itemAtual?.data || hoje)
                                }
                              }}
                              disabled={pendente}
                            />
                            <span className="text-[length:var(--texto-apoio)]">
                              {ehDespesaItem ? LANCAR.statusRotuloDespesa : LANCAR.statusRotuloReceita}
                            </span>
                          </label>
                        )}
                      />

                      {itemAtual?.estaPago ? (
                        <div className="flex flex-col gap-1">
                          <Label htmlFor={`dataDoPagamento-${index}`} className="text-xs">
                            {ehDespesaItem ? LANCAR.dataPagamentoLabelDespesa : LANCAR.dataPagamentoLabelReceita}
                          </Label>
                          <Input
                            id={`dataDoPagamento-${index}`}
                            type="date"
                            disabled={pendente}
                            {...registerLote(`itens.${index}.dataDoPagamento`)}
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {/* Forma de pagamento e Observação */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-[var(--esp-2)]">
                    {formasDePagamento.length > 0 ? (
                      <div className="flex flex-col gap-1">
                        <Label htmlFor={`formaDePagamento-${index}`} className="text-xs">
                          Forma de pagamento
                        </Label>
                        <Controller
                          control={controlLote}
                          name={`itens.${index}.formaDePagamentoId`}
                          render={({ field }) => (
                            <Select
                              value={field.value || SEM_FORMA_PAGAMENTO}
                              onValueChange={field.onChange}
                              disabled={pendente}
                            >
                              <SelectTrigger id={`formaDePagamento-${index}`} className="w-full">
                                <SelectValue placeholder="Forma de pagamento" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={SEM_FORMA_PAGAMENTO}>Sem forma de pagamento</SelectItem>
                                {formasDePagamento.map((f) => (
                                  <SelectItem key={f.id} value={f.id}>
                                    {f.nome}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        />
                      </div>
                    ) : null}

                    <div className={cn('flex flex-col gap-1', formasDePagamento.length === 0 && 'sm:col-span-2')}>
                      <Label htmlFor={`observacao-${index}`} className="text-xs">
                        Observação
                      </Label>
                      <Input
                        id={`observacao-${index}`}
                        maxLength={500}
                        placeholder="Observação (opcional)"
                        disabled={pendente}
                        {...registerLote(`itens.${index}.observacao`)}
                      />
                    </div>
                  </div>

                  {/* Responsável e Pago por (quando houver membros) */}
                  {membros.length > 0 ? (
                    <div className="grid grid-cols-2 gap-[var(--esp-2)]">
                      <div className="flex flex-col gap-1">
                        <Label htmlFor={`responsavel-${index}`} className="text-xs">
                          Responsável
                        </Label>
                        <Controller
                          control={controlLote}
                          name={`itens.${index}.responsavelId`}
                          render={({ field }) => (
                            <Select
                              value={field.value || SEM_RESPONSAVEL}
                              onValueChange={field.onChange}
                              disabled={pendente}
                            >
                              <SelectTrigger id={`responsavel-${index}`} className="w-full">
                                <SelectValue placeholder="Sem responsável" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={SEM_RESPONSAVEL}>Sem responsável</SelectItem>
                                {membros.map((m) => (
                                  <SelectItem key={m.id} value={m.id}>
                                    {m.nome}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        />
                      </div>

                      <div className="flex flex-col gap-1">
                        <Label htmlFor={`pagoPor-${index}`} className="text-xs">
                          Pago por
                        </Label>
                        <Controller
                          control={controlLote}
                          name={`itens.${index}.pagoPorId`}
                          render={({ field }) => (
                            <Select
                              value={field.value || SEM_PAGADOR}
                              onValueChange={field.onChange}
                              disabled={pendente}
                            >
                              <SelectTrigger id={`pagoPor-${index}`} className="w-full">
                                <SelectValue placeholder="Quem pagou?" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={SEM_PAGADOR}>Sem pagador específico</SelectItem>
                                {membros.map((m) => (
                                  <SelectItem key={m.id} value={m.id}>
                                    {m.nome}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        />
                      </div>
                    </div>
                  ) : null}

                  {/* Mais detalhes por linha do lote (apenas Despesa, recolhido por padrão) */}
                  {ehDespesaItem ? (
                    <div className="border-input rounded-lg border bg-background/50">
                      <button
                        type="button"
                        onClick={() =>
                          setDetalhesLoteAbertos((ant) => ({
                            ...ant,
                            [index]: !ant[index],
                          }))
                        }
                        aria-expanded={detalheAberto}
                        className="flex min-h-[44px] w-full items-center justify-between px-[var(--esp-3)] text-left text-[length:var(--texto-apoio)] font-medium text-muted-foreground hover:text-foreground"
                      >
                        <span>{LANCAR.maisDetalhes}</span>
                        <ChevronDown
                          className={cn(
                            'size-4 transition-transform duration-150',
                            detalheAberto && 'rotate-180',
                          )}
                          aria-hidden="true"
                        />
                      </button>

                      {detalheAberto ? (
                        <div className="border-input flex flex-col gap-[var(--esp-2)] border-t p-[var(--esp-3)]">
                          <Controller
                            control={controlLote}
                            name={`itens.${index}.ehBeneficio`}
                            render={({ field }) => (
                              <label className="border-input flex min-h-[44px] cursor-pointer items-center gap-[var(--esp-3)] rounded-lg border bg-background px-[var(--esp-3)]">
                                <Checkbox
                                  checked={field.value}
                                  onCheckedChange={(marcado) => field.onChange(marcado === true)}
                                  disabled={pendente}
                                />
                                <span className="text-[length:var(--texto-apoio)]">
                                  {LANCAR.ehBeneficioLabel}
                                </span>
                              </label>
                            )}
                          />

                          <Controller
                            control={controlLote}
                            name={`itens.${index}.ehFutil`}
                            render={({ field }) => (
                              <label className="border-input flex min-h-[44px] cursor-pointer items-center gap-[var(--esp-3)] rounded-lg border bg-background px-[var(--esp-3)]">
                                <Checkbox
                                  checked={field.value}
                                  onCheckedChange={(marcado) => field.onChange(marcado === true)}
                                  disabled={pendente}
                                />
                                <span className="text-[length:var(--texto-apoio)]">
                                  {LANCAR.ehFutilLabel}
                                </span>
                              </label>
                            )}
                          />

                          {ehFutilItem ? (
                            <div className="flex flex-col gap-1 pt-1">
                              <Label htmlFor={`rotuloDoFutil-${index}`} className="text-xs">
                                {LANCAR.rotuloDoFutilLabel}
                              </Label>
                              <Input
                                id={`rotuloDoFutil-${index}`}
                                maxLength={60}
                                placeholder={LANCAR.rotuloDoFutilPlaceholder}
                                disabled={pendente}
                                {...registerLote(`itens.${index}.rotuloDoFutil`)}
                              />
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              )
            })}
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

      {/* Toast Feedback */}
      {mensagemToast ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-20 right-4 z-50 flex items-center gap-2.5 rounded-xl border border-border/80 bg-card px-4 py-3 shadow-lg text-xs font-medium text-foreground animate-in fade-in slide-in-from-bottom-3 duration-200"
        >
          <div className="flex size-5 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <Check className="size-3.5" />
          </div>
          <span>{mensagemToast}</span>
        </div>
      ) : null}
    </div>
  )
}
