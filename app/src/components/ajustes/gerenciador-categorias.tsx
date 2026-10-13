'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  Edit2,
  Plus,
  Tag,
  Trash2,
  Check,
  X,
  AlertTriangle,
} from 'lucide-react'
import type { Database } from '@/types/database'
import type { ResultadoAction } from '@/actions/resultado'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
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
import { AJUSTES_CATEGORIAS } from '@/features/ajustes/copy'
import { tocarSomErro, tocarSomSucesso } from '@/features/sons/sons'
import {
  adicionarCategorias,
  renomearCategoria,
  alterarTipoCategoria,
  arquivarCategoria,
  excluirCategoria,
  contarUsoCategoria,
  type TipoCategoria,
} from '@/actions/categorias'
import {
  LIMITE_CARACTERES,
  LIMITE_NOMES,
  separarNomes,
  chaveDeComparacao,
} from '@/lib/lista-nomes'
import { cn } from '@/lib/utils'

type CategoriaRow = Database['public']['Tables']['categories']['Row']

const ROTULOS_TIPO: Record<string, string> = {
  despesa: 'Despesa',
  receita: 'Receita',
  investimento: 'Investimento',
  todos: 'Todos',
}

interface FormLoteValores {
  nomes: string
  tipo: TipoCategoria
}


export function GerenciadorCategorias({
  categoriasIniciais,
}: {
  categoriasIniciais: CategoriaRow[]
}) {
  const router = useRouter()
  const [pendenteLote, iniciarLote] = React.useTransition()
  const [pendenteItem, iniciarItem] = React.useTransition()

  const [resultadoLote, setResultadoLote] = React.useState<
    ResultadoAction<{ criadas: { id: string; nome: string }[]; ignoradas: string[] }> | null
  >(null)
  const [resumoSalvo, setResumoSalvo] = React.useState<string | null>(null)
  const [erroItem, setErroItem] = React.useState<string | null>(null)

  // Edição inline de nome/tipo
  const [editandoId, setEditandoId] = React.useState<string | null>(null)
  const [novoNome, setNovoNome] = React.useState('')
  const [novoTipo, setNovoTipo] = React.useState<TipoCategoria>('despesa')

  // Modal de exclusão com contagem de uso
  const [categoriaParaExcluir, setCategoriaParaExcluir] =
    React.useState<CategoriaRow | null>(null)
  const [usoExclusao, setUsoExclusao] = React.useState<{
    lancamentos: number
    orcamentos: number
  } | null>(null)
  const [carregandoUso, setCarregandoUso] = React.useState(false)

  // Seção recolhida de arquivadas
  const [arquivadasAberto, setArquivadasAberto] = React.useState(false)

  const { register, handleSubmit, watch, setValue, reset } =
    useForm<FormLoteValores>({
      defaultValues: {
        nomes: '',
        tipo: 'despesa',
      },
    })

  const textoNomes = watch('nomes')
  const tipoLote = watch('tipo')

  const ativas = categoriasIniciais.filter((c) => !c.archived_at)
  const arquivadas = categoriasIniciais.filter((c) => Boolean(c.archived_at))

  // Prévia ao vivo
  const previa = React.useMemo(() => {
    const { nomes, descartados } = separarNomes(textoNomes || '')
    const chavesExistentesDoTipo = new Set(
      ativas
        .filter((c) => c.type === tipoLote)
        .map((c) => chaveDeComparacao(c.name)),
    )

    const itens = nomes.map((nome) => ({
      nome,
      jaExiste: chavesExistentesDoTipo.has(chaveDeComparacao(nome)),
      muitoLongo: nome.length > LIMITE_CARACTERES,
    }))

    return {
      itens,
      descartados,
      excedeLimiteNomes: nomes.length > LIMITE_NOMES,
    }
  }, [textoNomes, tipoLote, ativas])

  const aoAdicionarLote = handleSubmit((valores) => {
    setResultadoLote(null)
    setResumoSalvo(null)
    iniciarLote(async () => {
      const res = await adicionarCategorias({
        nomes: valores.nomes,
        tipo: valores.tipo,
      })
      setResultadoLote(res)
      if (res.ok) {
        tocarSomSucesso()
        const qtdCriadas = res.dados.criadas.length
        const qtdIgnoradas = res.dados.ignoradas.length
        const partes: string[] = []
        partes.push(
          `${qtdCriadas} ${qtdCriadas === 1 ? 'criada' : 'criadas'}`,
        )
        if (qtdIgnoradas > 0) {
          partes.push(
            `${qtdIgnoradas} já ${qtdIgnoradas === 1 ? 'existia' : 'existiam'} (${res.dados.ignoradas.join(', ')})`,
          )
        }
        setResumoSalvo(partes.join(' · '))
        reset({ nomes: '', tipo: valores.tipo })
        router.refresh()
      } else {
        tocarSomErro()
      }
    })
  })

  const iniciarEdicao = (cat: CategoriaRow) => {
    setErroItem(null)
    setEditandoId(cat.id)
    setNovoNome(cat.name)
    setNovoTipo((cat.type as TipoCategoria) ?? 'despesa')
  }

  const salvarEdicao = (cat: CategoriaRow) => {
    setErroItem(null)
    iniciarItem(async () => {
      if (novoNome.trim() !== cat.name) {
        const resNome = await renomearCategoria({
          id: cat.id,
          nome: novoNome,
        })
        if (!resNome.ok) {
          setErroItem(resNome.erro)
          tocarSomErro()
          return
        }
      }

      if (novoTipo !== cat.type) {
        const resTipo = await alterarTipoCategoria({
          id: cat.id,
          tipo: novoTipo,
        })
        if (!resTipo.ok) {
          setErroItem(resTipo.erro)
          tocarSomErro()
          return
        }
      }

      tocarSomSucesso()
      setEditandoId(null)
      router.refresh()
    })
  }

  const alternarArquivamento = (cat: CategoriaRow, arquivar: boolean) => {
    setErroItem(null)
    iniciarItem(async () => {
      const res = await arquivarCategoria({ id: cat.id, arquivar })
      if (!res.ok) {
        setErroItem(res.erro)
        tocarSomErro()
        return
      }
      tocarSomSucesso()
      if (categoriaParaExcluir?.id === cat.id) {
        setCategoriaParaExcluir(null)
      }
      router.refresh()
    })
  }

  const abrirModalExclusao = async (cat: CategoriaRow) => {
    setErroItem(null)
    setCategoriaParaExcluir(cat)
    setUsoExclusao(null)
    setCarregandoUso(true)
    const res = await contarUsoCategoria({ id: cat.id })
    setCarregandoUso(false)
    if (res.ok) {
      setUsoExclusao(res.dados)
    } else {
      setUsoExclusao({ lancamentos: 0, orcamentos: 0 })
    }
  }

  const confirmarExclusao = () => {
    if (!categoriaParaExcluir) return
    iniciarItem(async () => {
      const res = await excluirCategoria({ id: categoriaParaExcluir.id })
      if (!res.ok) {
        setErroItem(res.erro)
        tocarSomErro()
        setCategoriaParaExcluir(null)
        return
      }
      tocarSomSucesso()
      setCategoriaParaExcluir(null)
      router.refresh()
    })
  }

  const errosLote =
    resultadoLote && !resultadoLote.ok ? resultadoLote.camposComErro : undefined
  const erroGeralLote =
    resultadoLote && !resultadoLote.ok && !errosLote
      ? resultadoLote.erro
      : undefined

  return (
    <div className="flex flex-col gap-6">
      {/* Bloco: Adicionar várias de uma vez */}
      <section
        aria-labelledby="titulo-lote-categorias"
        className="bg-card border-border/80 flex flex-col gap-4 rounded-xl border p-5 shadow-xs"
      >
        <div>
          <h2
            id="titulo-lote-categorias"
            className="text-foreground text-base font-semibold"
          >
            {AJUSTES_CATEGORIAS.loteTitulo}
          </h2>
          <p className="text-muted-foreground text-xs">
            {AJUSTES_CATEGORIAS.loteDica}
          </p>
        </div>

        <form onSubmit={aoAdicionarLote} className="flex flex-col gap-4" noValidate>
          {erroGeralLote && (
            <Alert variant="destructive">
              <AlertDescription>{erroGeralLote}</AlertDescription>
            </Alert>
          )}

          {resumoSalvo && (
            <Alert className="border-receita/30 bg-receita/10 text-receita">
              <AlertDescription>{resumoSalvo}</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="nomes-categorias">Nomes das categorias</Label>
              <textarea
                id="nomes-categorias"
                rows={3}
                placeholder={AJUSTES_CATEGORIAS.lotePlaceholder}
                disabled={pendenteLote}
                aria-invalid={errosLote?.nomes ? true : undefined}
                aria-describedby={errosLote?.nomes ? 'erro-nomes-cat' : undefined}
                className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-[84px] w-full rounded-lg border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                {...register('nomes')}
              />
              <CampoErro id="erro-nomes-cat" mensagens={errosLote?.nomes} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tipo-lote-cat">{AJUSTES_CATEGORIAS.tipoLabel}</Label>
              <Select
                value={tipoLote}
                onValueChange={(v) => setValue('tipo', v as TipoCategoria)}
                disabled={pendenteLote}
              >
                <SelectTrigger id="tipo-lote-cat" className="min-h-[44px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="despesa">Despesa</SelectItem>
                  <SelectItem value="receita">Receita</SelectItem>
                  <SelectItem value="investimento">Investimento</SelectItem>
                  <SelectItem value="todos">Todos</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Prévia ao vivo */}
          {(previa.itens.length > 0 || previa.descartados.length > 0) && (
            <div className="border-border/70 bg-muted/30 flex flex-col gap-2 rounded-lg border p-3">
              <span className="text-muted-foreground text-xs font-medium">
                {AJUSTES_CATEGORIAS.previaTitulo} ({previa.itens.length}/{LIMITE_NOMES})
              </span>
              <div className="flex flex-wrap gap-1.5">
                {previa.itens.map((item, idx) => (
                  <Badge
                    key={`${item.nome}-${idx}`}
                    variant={
                      item.muitoLongo
                        ? 'destructive'
                        : item.jaExiste
                          ? 'secondary'
                          : 'default'
                    }
                    className={cn(
                      'gap-1.5 text-xs',
                      item.jaExiste && 'opacity-70 line-through',
                    )}
                  >
                    <span>{item.nome}</span>
                    {item.jaExiste && (
                      <span className="no-underline text-[10px]">
                        ({AJUSTES_CATEGORIAS.jaExisteBadge})
                      </span>
                    )}
                    {item.muitoLongo && (
                      <span className="text-[10px]">
                        (&gt;{LIMITE_CARACTERES} caract.)
                      </span>
                    )}
                  </Badge>
                ))}
                {previa.descartados.map((dup, idx) => (
                  <Badge
                    key={`dup-${dup}-${idx}`}
                    variant="outline"
                    className="text-muted-foreground text-xs opacity-60 line-through"
                  >
                    {dup} ({AJUSTES_CATEGORIAS.duplicadaNoLoteBadge})
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <Button
              type="submit"
              size="toque"
              disabled={pendenteLote || previa.itens.length === 0}
              className="gap-2"
            >
              <Plus className="size-4" aria-hidden="true" />
              {pendenteLote
                ? AJUSTES_CATEGORIAS.salvandoLote
                : AJUSTES_CATEGORIAS.salvarLote}
            </Button>
          </div>
        </form>
      </section>

      {erroItem && (
        <Alert variant="destructive">
          <AlertDescription>{erroItem}</AlertDescription>
        </Alert>
      )}

      {/* Lista de Categorias Ativas */}
      <section aria-labelledby="titulo-cat-ativas" className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2
            id="titulo-cat-ativas"
            className="text-muted-foreground text-xs font-semibold uppercase tracking-wider"
          >
            {AJUSTES_CATEGORIAS.ativasTitulo} ({ativas.length})
          </h2>
        </div>

        <div className="bg-card border-border/80 divide-border flex flex-col divide-y rounded-xl border shadow-xs overflow-hidden">
          {ativas.map((cat) => {
            const estaEditando = editandoId === cat.id

            return (
              <div
                key={cat.id}
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                {estaEditando ? (
                  <div className="flex flex-1 flex-wrap items-center gap-2">
                    <Input
                      value={novoNome}
                      onChange={(e) => setNovoNome(e.target.value)}
                      maxLength={LIMITE_CARACTERES}
                      disabled={pendenteItem}
                      aria-label="Novo nome da categoria"
                      className="min-h-[44px] flex-1 min-w-[160px]"
                    />
                    <Select
                      value={novoTipo}
                      onValueChange={(v) => setNovoTipo(v as TipoCategoria)}
                      disabled={pendenteItem}
                    >
                      <SelectTrigger
                        aria-label="Tipo da categoria"
                        className="min-h-[44px] w-[150px]"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="despesa">Despesa</SelectItem>
                        <SelectItem value="receita">Receita</SelectItem>
                        <SelectItem value="investimento">Investimento</SelectItem>
                        <SelectItem value="todos">Todos</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      size="toque"
                      onClick={() => salvarEdicao(cat)}
                      disabled={pendenteItem}
                      className="gap-1.5"
                    >
                      <Check className="size-4" aria-hidden="true" />
                      Salvar
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="toque"
                      onClick={() => setEditandoId(null)}
                      disabled={pendenteItem}
                    >
                      <X className="size-4" aria-hidden="true" />
                      Cancelar
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-3">
                      <div className="bg-muted text-foreground flex size-9 items-center justify-center rounded-lg border border-border">
                        <Tag className="size-4" aria-hidden="true" />
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-foreground text-sm font-semibold">
                          {cat.name}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {ROTULOS_TIPO[cat.type] ?? cat.type}
                        </Badge>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="toque"
                        onClick={() => iniciarEdicao(cat)}
                        disabled={pendenteItem}
                        className="gap-1.5 text-xs"
                      >
                        <Edit2 className="size-3.5" aria-hidden="true" />
                        {AJUSTES_CATEGORIAS.renomear}
                      </Button>

                      <Button
                        type="button"
                        variant="outline"
                        size="toque"
                        onClick={() => alternarArquivamento(cat, true)}
                        disabled={pendenteItem}
                        className="gap-1.5 text-xs"
                      >
                        <Archive className="size-3.5" aria-hidden="true" />
                        {AJUSTES_CATEGORIAS.arquivar}
                      </Button>

                      <Button
                        type="button"
                        variant="ghost"
                        size="icone-toque"
                        onClick={() => abrirModalExclusao(cat)}
                        disabled={pendenteItem}
                        aria-label={`Excluir ${cat.name}`}
                        title={AJUSTES_CATEGORIAS.excluir}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* Seção recolhida: Arquivadas */}
      {arquivadas.length > 0 && (
        <section className="border-border/70 bg-card/50 rounded-xl border overflow-hidden">
          <button
            type="button"
            onClick={() => setArquivadasAberto((v) => !v)}
            aria-expanded={arquivadasAberto}
            className="flex min-h-[48px] w-full items-center justify-between px-4 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            <span>
              {AJUSTES_CATEGORIAS.arquivadasTitulo} ({arquivadas.length})
            </span>
            <ChevronDown
              className={cn(
                'size-4 transition-transform duration-150',
                arquivadasAberto && 'rotate-180',
              )}
              aria-hidden="true"
            />
          </button>

          {arquivadasAberto && (
            <div className="divide-border border-border/70 flex flex-col divide-y border-t">
              {arquivadas.map((cat) => (
                <div
                  key={cat.id}
                  className="flex items-center justify-between gap-3 p-4 opacity-75"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-foreground text-sm font-medium line-through">
                      {cat.name}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {ROTULOS_TIPO[cat.type] ?? cat.type}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="toque"
                      onClick={() => alternarArquivamento(cat, false)}
                      disabled={pendenteItem}
                      className="gap-1.5 text-xs"
                    >
                      <ArchiveRestore className="size-3.5" aria-hidden="true" />
                      {AJUSTES_CATEGORIAS.reativar}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icone-toque"
                      onClick={() => abrirModalExclusao(cat)}
                      disabled={pendenteItem}
                      aria-label={`Excluir ${cat.name}`}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Diálogo de confirmação de exclusão */}
      <Dialog
        open={categoriaParaExcluir !== null}
        onOpenChange={(ab) => {
          if (!ab) setCategoriaParaExcluir(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-pendente" aria-hidden="true" />
              {AJUSTES_CATEGORIAS.excluirTitulo}
            </DialogTitle>
            <DialogDescription>
              {carregandoUso ? (
                'Verificando lançamentos vinculados a esta categoria…'
              ) : usoExclusao && usoExclusao.lancamentos > 0 ? (
                <>
                  Esta categoria está em{' '}
                  <strong>{usoExclusao.lancamentos}</strong>{' '}
                  {usoExclusao.lancamentos === 1 ? 'lançamento' : 'lançamentos'}.
                  Eles ficarão como &apos;Sem categoria&apos;. Prefere arquivar?
                  {usoExclusao.orcamentos > 0 && (
                    <span className="mt-2 block text-despesa">
                      Atenção: o orçamento vinculado a esta categoria também será
                      removido.
                    </span>
                  )}
                </>
              ) : (
                <>
                  Tem certeza que deseja excluir a categoria{' '}
                  <strong>{categoriaParaExcluir?.name}</strong>?
                  {usoExclusao && usoExclusao.orcamentos > 0 && (
                    <span className="mt-2 block text-despesa">
                      Atenção: o orçamento vinculado a esta categoria será
                      removido junto.
                    </span>
                  )}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="mt-4 flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              size="toque"
              onClick={() => setCategoriaParaExcluir(null)}
              disabled={pendenteItem}
            >
              {AJUSTES_CATEGORIAS.cancelar}
            </Button>

            {usoExclusao && usoExclusao.lancamentos > 0 && categoriaParaExcluir ? (
              <>
                <Button
                  type="button"
                  variant="default"
                  size="toque"
                  onClick={() => alternarArquivamento(categoriaParaExcluir, true)}
                  disabled={pendenteItem || carregandoUso}
                >
                  {AJUSTES_CATEGORIAS.confirmarArquivarPreferencial}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="toque"
                  onClick={confirmarExclusao}
                  disabled={pendenteItem || carregandoUso}
                >
                  {AJUSTES_CATEGORIAS.confirmarExcluirMesmoAssim}
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant="destructive"
                size="toque"
                onClick={confirmarExclusao}
                disabled={pendenteItem || carregandoUso}
              >
                {AJUSTES_CATEGORIAS.excluir}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
