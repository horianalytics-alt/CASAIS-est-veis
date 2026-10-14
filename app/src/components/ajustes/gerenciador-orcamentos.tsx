'use client'

/**
 * Gerenciador de orçamentos mensais por categoria.
 *
 * Regras de UX (Briefing Rodada 7, decisões fechadas):
 * - Só categorias ATIVAS (archived_at === null) aparecem no seletor.
 * - Só tipos despesa ou investimento (receita nunca tem gasto na view).
 * - Salvar é upsert: mesma categoria + mês atualiza, não duplica.
 * - Mês padrão: mês atual em São Paulo (hojeEmSaoPaulo().slice(0, 7)).
 * - Excluir usa o id retornado pelo upsert (ou da lista existente).
 */

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  Pencil,
  Plus,
  Trash2,
  Target,
  Check,
  X,
  Loader2,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react'
import type { Database } from '@/types/database'
import { definirOrcamento, excluirOrcamento } from '@/actions/orcamentos'
import { parseBRLInput, formatBRL } from '@/lib/format'
import { hojeEmSaoPaulo, rotuloDoMes, somarMeses } from '@/lib/hoje'
import { tocarSomErro, tocarSomSucesso } from '@/features/sons/sons'
import { AJUSTES_ORCAMENTOS } from '@/features/ajustes/copy'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { CampoErro } from '@/components/ui/campo-erro'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type CategoriaRow = Database['public']['Tables']['categories']['Row']

export interface OrcamentoExistente {
  /** budget_id da v_orcamento_progresso */
  id: string
  category_id: string | null
  category_name: string | null
  /** 'YYYY-MM' */
  month: string
  budget_amount: number | null
}

const ROTULOS_TIPO: Record<string, string> = {
  despesa: 'Despesa',
  investimento: 'Investimento',
}

export function GerenciadorOrcamentos({
  categorias,
  orcamentosIniciais,
}: {
  categorias: CategoriaRow[]
  orcamentosIniciais: OrcamentoExistente[]
}) {
  const router = useRouter()
  const mesAtual = React.useMemo(() => hojeEmSaoPaulo().slice(0, 7), [])

  // Mês selecionado para visualização no card
  const [mesVisualizado, setMesVisualizado] = React.useState(mesAtual)

  // -- estado do formulário de criação/edição --
  const [modalAberto, setModalAberto] = React.useState(false)
  const [editando, setEditando] = React.useState<OrcamentoExistente | null>(null)
  const [categoriaId, setCategoriaId] = React.useState('')
  const [mesForm, setMesForm] = React.useState(mesAtual)
  const [valorTexto, setValorTexto] = React.useState('')
  const [erroForm, setErroForm] = React.useState<string | null>(null)
  const [camposComErro, setCamposComErro] = React.useState<Record<string, string[]>>({})
  const [pendenteSalvar, setPendenteSalvar] = React.useState(false)

  // -- estado para exclusão com confirmação --
  const [orcamentoParaExcluir, setOrcamentoParaExcluir] =
    React.useState<OrcamentoExistente | null>(null)
  const [erroExclusao, setErroExclusao] = React.useState<string | null>(null)
  const [pendenteExcluir, setPendenteExcluir] = React.useState(false)

  // Filtro de categorias ativas de despesa ou investimento
  const categoriasElegiveis = React.useMemo(
    () =>
      categorias.filter(
        (c) =>
          c.archived_at === null &&
          (c.type === 'despesa' || c.type === 'investimento'),
      ),
    [categorias],
  )

  // Mapa de categorias por ID para consulta rápida
  const mapaCategorias = React.useMemo(
    () => new Map(categorias.map((c) => [c.id, c])),
    [categorias],
  )

  // Orçamentos existentes no mês selecionado no formulário
  const mapaOrcamentosDoMesForm = React.useMemo(() => {
    const filtrados = orcamentosIniciais.filter((o) => o.month === mesForm)
    return new Map(filtrados.map((o) => [o.category_id ?? '', o]))
  }, [orcamentosIniciais, mesForm])

  // Orçamentos exibidos na lista do mês visualizado
  const orcamentosDoMesVisualizado = React.useMemo(
    () => orcamentosIniciais.filter((o) => o.month === mesVisualizado),
    [orcamentosIniciais, mesVisualizado],
  )

  // Abre diálogo para criar novo orçamento no mês visualizado
  const abrirCriacao = () => {
    setEditando(null)
    setCategoriaId('')
    setMesForm(mesVisualizado)
    setValorTexto('')
    setErroForm(null)
    setCamposComErro({})
    setModalAberto(true)
  }

  // Abre diálogo para editar orçamento existente
  const abrirEdicao = (orc: OrcamentoExistente) => {
    setEditando(orc)
    setCategoriaId(orc.category_id ?? '')
    setMesForm(orc.month)
    setValorTexto(
      orc.budget_amount !== null
        ? String(orc.budget_amount).replace('.', ',')
        : '',
    )
    setErroForm(null)
    setCamposComErro({})
    setModalAberto(true)
  }

  // Ao alterar categoria no form, auto-carrega se já houver orçamento para ela no mês escolhido
  const aoMudarCategoria = (novaId: string) => {
    setCategoriaId(novaId)
    setCamposComErro((prev) => {
      const proximo = { ...prev }
      delete proximo.categoriaId
      return proximo
    })

    const existente = mapaOrcamentosDoMesForm.get(novaId)
    if (existente && !editando) {
      setEditando(existente)
      if (existente.budget_amount !== null) {
        setValorTexto(String(existente.budget_amount).replace('.', ','))
      }
    } else if (!existente && editando && editando.category_id !== novaId) {
      setEditando(null)
    }
  }

  // Ao alterar mês no form, checa se a categoria selecionada já tem orçamento no novo mês
  const aoMudarMesForm = (novoMes: string) => {
    setMesForm(novoMes)
    setCamposComErro((prev) => {
      const proximo = { ...prev }
      delete proximo.mes
      return proximo
    })

    const orcsDoNovoMes = orcamentosIniciais.filter((o) => o.month === novoMes)
    const existente = orcsDoNovoMes.find((o) => o.category_id === categoriaId)
    if (existente) {
      setEditando(existente)
      if (existente.budget_amount !== null) {
        setValorTexto(String(existente.budget_amount).replace('.', ','))
      }
    } else if (editando) {
      setEditando(null)
    }
  }

  // Submissão do formulário (definirOrcamento)
  const aoSubmeter = async (e: React.FormEvent) => {
    e.preventDefault()
    setErroForm(null)
    setCamposComErro({})

    if (!categoriaId) {
      setCamposComErro({ categoriaId: ['Escolha uma categoria.'] })
      return
    }

    const valor = parseBRLInput(valorTexto)
    if (Number.isNaN(valor)) {
      setCamposComErro({
        valor: ['Valor inválido. Use formato monetário como 250 ou 1.250,90.'],
      })
      return
    }

    setPendenteSalvar(true)
    const resposta = await definirOrcamento({
      categoriaId,
      mes: mesForm,
      valor,
    })
    setPendenteSalvar(false)

    if (!resposta.ok) {
      tocarSomErro()
      setErroForm(resposta.erro ?? AJUSTES_ORCAMENTOS.erroGeral)
      if (resposta.camposComErro) {
        setCamposComErro(resposta.camposComErro)
      }
      return
    }

    tocarSomSucesso()
    setModalAberto(false)
    setMesVisualizado(mesForm)
    router.refresh()
  }

  // Confirmação de exclusão (excluirOrcamento)
  const aoConfirmarExclusao = async () => {
    if (!orcamentoParaExcluir) return
    setPendenteExcluir(true)
    setErroExclusao(null)

    const resposta = await excluirOrcamento({ id: orcamentoParaExcluir.id })
    setPendenteExcluir(false)

    if (!resposta.ok) {
      tocarSomErro()
      setErroExclusao(resposta.erro ?? 'Não foi possível excluir o orçamento.')
      return
    }

    tocarSomSucesso()
    setOrcamentoParaExcluir(null)
    router.refresh()
  }

  return (
    <section
      aria-labelledby="titulo-orcamentos-categoria"
      className="bg-card border-border/80 flex flex-col rounded-xl border shadow-xs overflow-hidden"
    >
      {/* Top Header do Card */}
      <div className="flex flex-col gap-3 p-5 border-b border-border/70 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <div className="bg-primary/10 text-primary flex size-9 items-center justify-center rounded-lg border border-primary/20 shrink-0">
            <Target className="size-4.5" aria-hidden="true" />
          </div>
          <div>
            <h2
              id="titulo-orcamentos-categoria"
              className="text-foreground text-base font-semibold"
            >
              {AJUSTES_ORCAMENTOS.titulo}
            </h2>
            <p className="text-muted-foreground text-xs mt-0.5">
              {AJUSTES_ORCAMENTOS.subtitulo}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Navegação de meses */}
          <div className="flex items-center bg-muted/60 border border-border/70 rounded-lg p-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setMesVisualizado((m) => somarMeses(m, -1))}
              aria-label="Mês anterior"
              className="size-8 text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
            </Button>
            <span className="px-2 text-xs font-semibold text-foreground capitalize select-none min-w-[110px] text-center">
              {rotuloDoMes(mesVisualizado)}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setMesVisualizado((m) => somarMeses(m, 1))}
              aria-label="Próximo mês"
              className="size-8 text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <ChevronRight className="size-4" aria-hidden="true" />
            </Button>
          </div>

          <Button
            type="button"
            variant="default"
            size="toque"
            onClick={abrirCriacao}
            className="gap-1.5 shrink-0"
          >
            <Plus className="size-4" aria-hidden="true" />
            {AJUSTES_ORCAMENTOS.novoOrcamento}
          </Button>
        </div>
      </div>

      {/* Alerta de erro de exclusão */}
      {erroExclusao && (
        <div className="p-4 border-b border-border/70 bg-destructive/10">
          <Alert variant="destructive">
            <AlertDescription className="flex items-center justify-between gap-2">
              <span>{erroExclusao}</span>
              <button
                type="button"
                onClick={() => setErroExclusao(null)}
                className="shrink-0 text-destructive hover:opacity-80 cursor-pointer"
                aria-label="Fechar alerta"
              >
                <X className="size-4" />
              </button>
            </AlertDescription>
          </Alert>
        </div>
      )}

      {/* Lista de orçamentos do mês */}
      <div className="p-5">
        {orcamentosDoMesVisualizado.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground text-sm flex flex-col items-center justify-center gap-1.5">
            <p>{AJUSTES_ORCAMENTOS.semOrcamentos(rotuloDoMes(mesVisualizado))}</p>
          </div>
        ) : (
          <div className="bg-background border-border/70 divide-border/70 flex flex-col divide-y rounded-lg border overflow-hidden">
            {orcamentosDoMesVisualizado.map((orc) => {
              const cat = orc.category_id ? mapaCategorias.get(orc.category_id) : undefined
              const tipoFormatado = cat?.type ? ROTULOS_TIPO[cat.type] ?? cat.type : null

              return (
                <div
                  key={orc.id}
                  className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-foreground text-sm font-medium truncate">
                          {orc.category_name ?? 'Categoria'}
                        </span>
                        {tipoFormatado && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4.5 font-normal">
                            {tipoFormatado}
                          </Badge>
                        )}
                      </div>
                      <span className="text-muted-foreground text-xs mt-0.5">
                        Limite mensal
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                    <span className="text-foreground text-sm font-semibold font-mono tabular-nums">
                      {orc.budget_amount !== null
                        ? formatBRL(orc.budget_amount)
                        : '—'}
                    </span>

                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icone-toque"
                        onClick={() => abrirEdicao(orc)}
                        aria-label={`Editar orçamento de ${orc.category_name}`}
                        title={AJUSTES_ORCAMENTOS.editarOrcamento}
                        className="text-muted-foreground hover:text-foreground cursor-pointer"
                      >
                        <Pencil className="size-4" aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icone-toque"
                        onClick={() => setOrcamentoParaExcluir(orc)}
                        aria-label={`Excluir orçamento de ${orc.category_name}`}
                        title="Excluir orçamento"
                        className="text-muted-foreground hover:text-destructive cursor-pointer"
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Diálogo de Criar / Editar Orçamento */}
      <Dialog open={modalAberto} onOpenChange={setModalAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editando
                ? AJUSTES_ORCAMENTOS.editarOrcamento
                : AJUSTES_ORCAMENTOS.novoOrcamento}
            </DialogTitle>
            <DialogDescription>
              {editando
                ? AJUSTES_ORCAMENTOS.editarDescricao
                : AJUSTES_ORCAMENTOS.novoDescricao}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={aoSubmeter} className="flex flex-col gap-4 pt-1" noValidate>
            {erroForm && (
              <Alert variant="destructive">
                <AlertDescription>{erroForm}</AlertDescription>
              </Alert>
            )}

            {/* Categoria */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="orc-categoria">
                {AJUSTES_ORCAMENTOS.categoriaLabel}
              </Label>
              <Select
                value={categoriaId}
                onValueChange={aoMudarCategoria}
                disabled={pendenteSalvar}
              >
                <SelectTrigger id="orc-categoria" className="min-h-[44px]">
                  <SelectValue
                    placeholder={AJUSTES_ORCAMENTOS.categoriaPlaceholder}
                  />
                </SelectTrigger>
                <SelectContent>
                  {categoriasElegiveis.length === 0 ? (
                    <SelectItem value="__vazio__" disabled>
                      {AJUSTES_ORCAMENTOS.categoriaSemElegiveis}
                    </SelectItem>
                  ) : (
                    categoriasElegiveis.map((c) => {
                      const temNesseMes =
                        mapaOrcamentosDoMesForm.has(c.id) &&
                        c.id !== editando?.category_id

                      return (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                          {temNesseMes
                            ? ` ${AJUSTES_ORCAMENTOS.jaTemOrcamento}`
                            : ''}
                        </SelectItem>
                      )
                    })
                  )}
                </SelectContent>
              </Select>
              <CampoErro id="erro-orc-categoria" mensagens={camposComErro.categoriaId} />
            </div>

            {/* Mês */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="orc-mes">{AJUSTES_ORCAMENTOS.mesLabel}</Label>
              <Input
                id="orc-mes"
                type="month"
                value={mesForm}
                min="2000-01"
                max="2199-12"
                onChange={(e) => aoMudarMesForm(e.target.value)}
                required
                disabled={pendenteSalvar}
                className="min-h-[44px]"
              />
              <CampoErro id="erro-orc-mes" mensagens={camposComErro.mes} />
            </div>

            {/* Valor */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="orc-valor">{AJUSTES_ORCAMENTOS.limiteLabel}</Label>
              <Input
                id="orc-valor"
                type="text"
                inputMode="decimal"
                value={valorTexto}
                onChange={(e) => {
                  setValorTexto(e.target.value)
                  setCamposComErro((prev) => {
                    const proximo = { ...prev }
                    delete proximo.valor
                    return proximo
                  })
                }}
                placeholder={AJUSTES_ORCAMENTOS.limitePlaceholder}
                required
                disabled={pendenteSalvar}
                className="min-h-[44px] font-mono"
              />
              <CampoErro id="erro-orc-valor" mensagens={camposComErro.valor} />
            </div>

            <DialogFooter className="mt-2 flex-col sm:flex-row gap-2">
              <Button
                type="button"
                variant="outline"
                size="toque"
                onClick={() => setModalAberto(false)}
                disabled={pendenteSalvar}
              >
                {AJUSTES_ORCAMENTOS.cancelar}
              </Button>
              <Button
                type="submit"
                size="toque"
                disabled={pendenteSalvar || categoriasElegiveis.length === 0}
              >
                {pendenteSalvar ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    {AJUSTES_ORCAMENTOS.salvando}
                  </>
                ) : (
                  <>
                    <Check className="size-4" aria-hidden="true" />
                    {editando
                      ? AJUSTES_ORCAMENTOS.atualizar
                      : AJUSTES_ORCAMENTOS.salvar}
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Diálogo de Confirmação de Exclusão */}
      <Dialog
        open={orcamentoParaExcluir !== null}
        onOpenChange={(ab) => {
          if (!ab) setOrcamentoParaExcluir(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-pendente" aria-hidden="true" />
              {AJUSTES_ORCAMENTOS.excluirTitulo}
            </DialogTitle>
            <DialogDescription>
              {orcamentoParaExcluir &&
                AJUSTES_ORCAMENTOS.excluirDescricao(
                  orcamentoParaExcluir.category_name ?? 'Categoria',
                  rotuloDoMes(orcamentoParaExcluir.month),
                )}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="mt-4 flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              size="toque"
              onClick={() => setOrcamentoParaExcluir(null)}
              disabled={pendenteExcluir}
            >
              {AJUSTES_ORCAMENTOS.cancelar}
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="toque"
              onClick={aoConfirmarExclusao}
              disabled={pendenteExcluir}
            >
              {pendenteExcluir ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  {AJUSTES_ORCAMENTOS.excluindo}
                </>
              ) : (
                AJUSTES_ORCAMENTOS.excluirBotao
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}