'use client'

// 'use client' porque o formulário tem estado (React Hook Form), campos
// dependentes (categorias filtradas pelo tipo, data de pagamento que segue a
// data) e chama a action de forma imperativa. É folha: a page continua Server
// Component e passa só props serializáveis (arrays de objetos planos).

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Controller, useForm } from 'react-hook-form'
import { salvarLancamento, type Lancamento } from '@/actions/lancamento'
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
import { LANCAR } from '@/features/transacoes/copy'
import { cn } from '@/lib/utils'

export interface OpcaoDeConta {
  id: string
  nome: string
}

export interface OpcaoDeCategoria {
  id: string
  nome: string
  /** 'receita' | 'despesa' | 'investimento' | 'todos' — vem do banco como string. */
  tipo: string
}

export interface FormLancamentoProps {
  contas: OpcaoDeConta[]
  categorias: OpcaoDeCategoria[]
  /** ISO 'YYYY-MM-DD' calculado no servidor (fuso do casal): evita divergência de hidratação. */
  hoje: string
}

type TipoDoFormulario = 'despesa' | 'receita'

interface Campos {
  tipo: TipoDoFormulario
  descricao: string
  valor: string
  data: string
  contaId: string
  categoriaId: string
  estaPago: boolean
  dataDoPagamento: string
}

/** Radix Select não aceita `value=""` num item: este valor representa "sem categoria". */
const SEM_CATEGORIA = '__sem_categoria__'

const OPCOES_DE_TIPO: { valor: TipoDoFormulario; rotulo: string }[] = [
  { valor: 'despesa', rotulo: LANCAR.despesa },
  { valor: 'receita', rotulo: LANCAR.receita },
]

export function FormLancamento({ contas, categorias, hoje }: FormLancamentoProps) {
  const router = useRouter()
  const [pendente, iniciarEnvio] = useTransition()
  const [resultado, setResultado] = useState<ResultadoAction<Lancamento[]> | null>(null)
  const [concluido, setConcluido] = useState(false)

  const { register, control, handleSubmit, watch, setValue, getValues } =
    useForm<Campos>({
      defaultValues: {
        tipo: 'despesa',
        descricao: '',
        valor: '',
        data: hoje,
        contaId: contas[0]?.id ?? '',
        categoriaId: SEM_CATEGORIA,
        estaPago: true,
        dataDoPagamento: hoje,
      },
    })

  // true quando a pessoa mexeu na data do pagamento: dali em diante ela não
  // segue mais a data do lançamento.
  const pagamentoEditado = useRef(false)

  // Mexeu num campo: o erro DAQUELE campo já não descreve o que está na tela
  // (ficaria "Valor inválido" embaixo de um valor corrigido). Os erros dos
  // outros campos continuam; quando não sobra nenhum, o aviso geral some junto.
  // Os nomes do formulário são os mesmos que a action devolve em camposComErro.
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
  const estaPago = watch('estaPago')

  const categoriasDoTipo = categorias.filter(
    (c) => c.tipo === tipo || c.tipo === 'todos',
  )

  const erros = resultado && !resultado.ok ? resultado.camposComErro : undefined
  const erroGeral = resultado && !resultado.ok ? resultado.erro : undefined

  const aoEnviar = handleSubmit((valores) => {
    setResultado(null)
    iniciarEnvio(async () => {
      const resposta = await salvarLancamento({
        tipo: valores.tipo,
        descricao: valores.descricao,
        valor: valores.valor,
        data: valores.data,
        contaId: valores.contaId,
        categoriaId: valores.categoriaId === SEM_CATEGORIA ? null : valores.categoriaId,
        estaPago: valores.estaPago,
        // CHECK do banco: pago EXIGE data; não pago EXIGE nula.
        dataDoPagamento: valores.estaPago ? valores.dataDoPagamento || null : null,
      })
      setResultado(resposta)
      if (resposta.ok) {
        // `pendente` volta a false quando a action termina, antes de a
        // navegação acabar: sem esta trava um segundo toque duplicaria o lançamento.
        setConcluido(true)
        // Volta para o mês do lançamento, senão ele "sumiria" se a data for de
        // outro mês. A action já revalidou /inicio; não precisa de router.refresh.
        router.replace(`/inicio?mes=${valores.data.slice(0, 7)}`)
      }
    })
  })

  return (
    <form onSubmit={aoEnviar} className="flex flex-col gap-[var(--esp-4)]" noValidate>
      <fieldset className="flex flex-col gap-[var(--esp-2)]">
        <legend className="text-[length:var(--texto-corpo)] leading-[var(--texto-corpo-lh)] font-medium">{LANCAR.tipoRotulo}</legend>
        <div className="mt-[var(--esp-2)] grid grid-cols-2 gap-[var(--esp-2)]">
          {OPCOES_DE_TIPO.map((opcao) => (
            <label
              key={opcao.valor}
              className={cn(
                'border-input has-[:focus-visible]:ring-ring/50 has-[:focus-visible]:border-ring flex min-h-[44px] cursor-pointer items-center justify-center rounded-lg border px-[var(--esp-3)] text-[length:var(--texto-corpo)] leading-[var(--texto-corpo-lh)] font-medium has-[:focus-visible]:ring-3',
                tipo === opcao.valor
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background',
              )}
            >
              <input
                type="radio"
                value={opcao.valor}
                className="sr-only"
                {...register('tipo', {
                  // Trocar o tipo só descarta a categoria se ela não existe na
                  // outra lista (as de tipo "todos" servem aos dois).
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

      <div className="flex flex-col gap-[var(--esp-2)]">
        <Label htmlFor="descricao">{LANCAR.descricaoLabel}</Label>
        <Input
          id="descricao"
          placeholder={LANCAR.descricaoPlaceholder}
          autoComplete="off"
          disabled={pendente}
          aria-invalid={erros?.descricao ? true : undefined}
          aria-describedby={erros?.descricao ? 'erro-descricao' : undefined}
          {...register('descricao')}
        />
        <CampoErro id="erro-descricao" mensagens={erros?.descricao} />
      </div>

      <div className="flex flex-col gap-[var(--esp-2)]">
        <Label htmlFor="valor">{LANCAR.valorLabel}</Label>
        <Input
          id="valor"
          inputMode="decimal"
          placeholder={LANCAR.valorPlaceholder}
          autoComplete="off"
          // Campo de digitação de dinheiro: só mono + tabular. A classe de valor
          // exibido alinha à direita e joga o cursor para lá (L-010).
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

      <div className="flex flex-col gap-[var(--esp-2)]">
        <Label htmlFor="data">{LANCAR.dataLabel}</Label>
        <Input
          id="data"
          type="date"
          disabled={pendente}
          aria-invalid={erros?.data ? true : undefined}
          aria-describedby={erros?.data ? 'erro-data' : undefined}
          {...register('data', {
            // A data do pagamento acompanha a data enquanto a pessoa não a mexeu.
            onChange: (e) => {
              if (!pagamentoEditado.current && e.target.value) {
                setValue('dataDoPagamento', e.target.value)
              }
            },
          })}
        />
        <CampoErro id="erro-data" mensagens={erros?.data} />
      </div>

      <div className="flex flex-col gap-[var(--esp-2)]">
        <Label htmlFor="contaId">{LANCAR.contaLabel}</Label>
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
                {tipo === 'despesa' ? LANCAR.statusRotuloDespesa : LANCAR.statusRotuloReceita}
              </span>
            </label>
          )}
        />
        <CampoErro id="erro-estaPago" mensagens={erros?.estaPago} />
      </div>

      {estaPago ? (
        <div className="flex flex-col gap-[var(--esp-2)]">
          <Label htmlFor="dataDoPagamento">
            {tipo === 'despesa'
              ? LANCAR.dataPagamentoLabelDespesa
              : LANCAR.dataPagamentoLabelReceita}
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

      {erroGeral ? (
        <Alert variant="destructive">
          <AlertDescription>{erroGeral}</AlertDescription>
        </Alert>
      ) : null}

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
  )
}
