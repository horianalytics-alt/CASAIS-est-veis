'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  CreditCard,
  Edit2,
  Plus,
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { AJUSTES_FORMAS } from '@/features/ajustes/copy'
import { tocarSomErro, tocarSomSucesso } from '@/features/sons/sons'
import {
  adicionarFormasPagamento,
  renomearFormaPagamento,
  arquivarFormaPagamento,
  excluirFormaPagamento,
  contarUsoFormaPagamento,
} from '@/actions/formas-pagamento'
import {
  LIMITE_CARACTERES,
  LIMITE_NOMES,
  separarNomes,
  chaveDeComparacao,
} from '@/lib/lista-nomes'
import { cn } from '@/lib/utils'

type FormaPagamentoRow = Database['public']['Tables']['payment_methods']['Row']

interface FormLoteFormasValores {
  nomes: string
}


export function GerenciadorFormasPagamento({
  formasIniciais,
}: {
  formasIniciais: FormaPagamentoRow[]
}) {
  const router = useRouter()
  const [pendenteLote, iniciarLote] = React.useTransition()
  const [pendenteItem, iniciarItem] = React.useTransition()

  const [resultadoLote, setResultadoLote] = React.useState<
    ResultadoAction<{ criadas: { id: string; nome: string }[]; ignoradas: string[] }> | null
  >(null)
  const [resumoSalvo, setResumoSalvo] = React.useState<string | null>(null)
  const [erroItem, setErroItem] = React.useState<string | null>(null)

  const [editandoId, setEditandoId] = React.useState<string | null>(null)
  const [novoNome, setNovoNome] = React.useState('')

  const [formaParaExcluir, setFormaParaExcluir] =
    React.useState<FormaPagamentoRow | null>(null)
  const [usoExclusao, setUsoExclusao] = React.useState<{
    lancamentos: number
  } | null>(null)
  const [carregandoUso, setCarregandoUso] = React.useState(false)

  const [arquivadasAberto, setArquivadasAberto] = React.useState(false)

  const { register, handleSubmit, watch, reset } =
    useForm<FormLoteFormasValores>({
      defaultValues: {
        nomes: '',
      },
    })

  const textoNomes = watch('nomes')

  const ativas = formasIniciais.filter((f) => !f.archived_at)
  const arquivadas = formasIniciais.filter((f) => Boolean(f.archived_at))

  const previa = React.useMemo(() => {
    const { nomes, descartados } = separarNomes(textoNomes || '')
    const chavesExistentes = new Set(ativas.map((f) => chaveDeComparacao(f.name)))

    const itens = nomes.map((nome) => ({
      nome,
      jaExiste: chavesExistentes.has(chaveDeComparacao(nome)),
      muitoLongo: nome.length > LIMITE_CARACTERES,
    }))

    return {
      itens,
      descartados,
    }
  }, [textoNomes, ativas])

  const aoAdicionarLote = handleSubmit((valores) => {
    setResultadoLote(null)
    setResumoSalvo(null)
    iniciarLote(async () => {
      const res = await adicionarFormasPagamento({
        nomes: valores.nomes,
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
        reset({ nomes: '' })
        router.refresh()
      } else {
        tocarSomErro()
      }
    })
  })

  const iniciarEdicao = (forma: FormaPagamentoRow) => {
    setErroItem(null)
    setEditandoId(forma.id)
    setNovoNome(forma.name)
  }

  const salvarEdicao = (forma: FormaPagamentoRow) => {
    setErroItem(null)
    iniciarItem(async () => {
      const res = await renomearFormaPagamento({
        id: forma.id,
        nome: novoNome,
      })
      if (!res.ok) {
        setErroItem(res.erro)
        tocarSomErro()
        return
      }
      tocarSomSucesso()
      setEditandoId(null)
      router.refresh()
    })
  }

  const alternarArquivamento = (forma: FormaPagamentoRow, arquivar: boolean) => {
    setErroItem(null)
    iniciarItem(async () => {
      const res = await arquivarFormaPagamento({ id: forma.id, arquivar })
      if (!res.ok) {
        setErroItem(res.erro)
        tocarSomErro()
        return
      }
      tocarSomSucesso()
      if (formaParaExcluir?.id === forma.id) {
        setFormaParaExcluir(null)
      }
      router.refresh()
    })
  }

  const abrirModalExclusao = async (forma: FormaPagamentoRow) => {
    setErroItem(null)
    setFormaParaExcluir(forma)
    setUsoExclusao(null)
    setCarregandoUso(true)
    const res = await contarUsoFormaPagamento({ id: forma.id })
    setCarregandoUso(false)
    if (res.ok) {
      setUsoExclusao(res.dados)
    } else {
      setUsoExclusao({ lancamentos: 0 })
    }
  }

  const confirmarExclusao = () => {
    if (!formaParaExcluir) return
    iniciarItem(async () => {
      const res = await excluirFormaPagamento({ id: formaParaExcluir.id })
      if (!res.ok) {
        setErroItem(res.erro)
        tocarSomErro()
        setFormaParaExcluir(null)
        return
      }
      tocarSomSucesso()
      setFormaParaExcluir(null)
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
        aria-labelledby="titulo-lote-formas"
        className="bg-card border-border/80 flex flex-col gap-4 rounded-xl border p-5 shadow-xs"
      >
        <div>
          <h2
            id="titulo-lote-formas"
            className="text-foreground text-base font-semibold"
          >
            {AJUSTES_FORMAS.loteTitulo}
          </h2>
          <p className="text-muted-foreground text-xs">
            {AJUSTES_FORMAS.loteDica}
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

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nomes-formas">Nomes das formas de pagamento</Label>
            <textarea
              id="nomes-formas"
              rows={3}
              placeholder={AJUSTES_FORMAS.lotePlaceholder}
              disabled={pendenteLote}
              aria-invalid={errosLote?.nomes ? true : undefined}
              aria-describedby={errosLote?.nomes ? 'erro-nomes-formas' : undefined}
              className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-[84px] w-full rounded-lg border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              {...register('nomes')}
            />
            <CampoErro id="erro-nomes-formas" mensagens={errosLote?.nomes} />
          </div>

          {/* Prévia ao vivo */}
          {(previa.itens.length > 0 || previa.descartados.length > 0) && (
            <div className="border-border/70 bg-muted/30 flex flex-col gap-2 rounded-lg border p-3">
              <span className="text-muted-foreground text-xs font-medium">
                {AJUSTES_FORMAS.previaTitulo} ({previa.itens.length}/{LIMITE_NOMES})
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
                        ({AJUSTES_FORMAS.jaExisteBadge})
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
                    {dup} ({AJUSTES_FORMAS.duplicadaNoLoteBadge})
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
                ? AJUSTES_FORMAS.salvandoLote
                : AJUSTES_FORMAS.salvarLote}
            </Button>
          </div>
        </form>
      </section>

      {erroItem && (
        <Alert variant="destructive">
          <AlertDescription>{erroItem}</AlertDescription>
        </Alert>
      )}

      {/* Lista de Formas Ativas */}
      <section aria-labelledby="titulo-formas-ativas" className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2
            id="titulo-formas-ativas"
            className="text-muted-foreground text-xs font-semibold uppercase tracking-wider"
          >
            {AJUSTES_FORMAS.ativasTitulo} ({ativas.length})
          </h2>
        </div>

        <div className="bg-card border-border/80 divide-border flex flex-col divide-y rounded-xl border shadow-xs overflow-hidden">
          {ativas.map((forma) => {
            const estaEditando = editandoId === forma.id

            return (
              <div
                key={forma.id}
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                {estaEditando ? (
                  <div className="flex flex-1 flex-wrap items-center gap-2">
                    <Input
                      value={novoNome}
                      onChange={(e) => setNovoNome(e.target.value)}
                      maxLength={LIMITE_CARACTERES}
                      disabled={pendenteItem}
                      aria-label="Novo nome da forma de pagamento"
                      className="min-h-[44px] flex-1 min-w-[160px]"
                    />
                    <Button
                      type="button"
                      size="toque"
                      onClick={() => salvarEdicao(forma)}
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
                        <CreditCard className="size-4" aria-hidden="true" />
                      </div>
                      <span className="text-foreground text-sm font-semibold">
                        {forma.name}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="toque"
                        onClick={() => iniciarEdicao(forma)}
                        disabled={pendenteItem}
                        className="gap-1.5 text-xs"
                      >
                        <Edit2 className="size-3.5" aria-hidden="true" />
                        {AJUSTES_FORMAS.renomear}
                      </Button>

                      <Button
                        type="button"
                        variant="outline"
                        size="toque"
                        onClick={() => alternarArquivamento(forma, true)}
                        disabled={pendenteItem}
                        className="gap-1.5 text-xs"
                      >
                        <Archive className="size-3.5" aria-hidden="true" />
                        {AJUSTES_FORMAS.arquivar}
                      </Button>

                      <Button
                        type="button"
                        variant="ghost"
                        size="icone-toque"
                        onClick={() => abrirModalExclusao(forma)}
                        disabled={pendenteItem}
                        aria-label={`Excluir ${forma.name}`}
                        title={AJUSTES_FORMAS.excluir}
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
              {AJUSTES_FORMAS.arquivadasTitulo} ({arquivadas.length})
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
              {arquivadas.map((forma) => (
                <div
                  key={forma.id}
                  className="flex items-center justify-between gap-3 p-4 opacity-75"
                >
                  <span className="text-foreground text-sm font-medium line-through">
                    {forma.name}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="toque"
                      onClick={() => alternarArquivamento(forma, false)}
                      disabled={pendenteItem}
                      className="gap-1.5 text-xs"
                    >
                      <ArchiveRestore className="size-3.5" aria-hidden="true" />
                      {AJUSTES_FORMAS.reativar}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icone-toque"
                      onClick={() => abrirModalExclusao(forma)}
                      disabled={pendenteItem}
                      aria-label={`Excluir ${forma.name}`}
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
        open={formaParaExcluir !== null}
        onOpenChange={(ab) => {
          if (!ab) setFormaParaExcluir(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-pendente" aria-hidden="true" />
              {AJUSTES_FORMAS.excluirTitulo}
            </DialogTitle>
            <DialogDescription>
              {carregandoUso ? (
                'Verificando lançamentos vinculados a esta forma de pagamento…'
              ) : usoExclusao && usoExclusao.lancamentos > 0 ? (
                <>
                  Esta forma de pagamento está em{' '}
                  <strong>{usoExclusao.lancamentos}</strong>{' '}
                  {usoExclusao.lancamentos === 1 ? 'lançamento' : 'lançamentos'}.
                  Eles ficarão sem forma de pagamento definida. Prefere arquivar?
                </>
              ) : (
                <>
                  Tem certeza que deseja excluir a forma de pagamento{' '}
                  <strong>{formaParaExcluir?.name}</strong>?
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="mt-4 flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              size="toque"
              onClick={() => setFormaParaExcluir(null)}
              disabled={pendenteItem}
            >
              {AJUSTES_FORMAS.cancelar}
            </Button>

            {usoExclusao && usoExclusao.lancamentos > 0 && formaParaExcluir ? (
              <>
                <Button
                  type="button"
                  variant="default"
                  size="toque"
                  onClick={() => alternarArquivamento(formaParaExcluir, true)}
                  disabled={pendenteItem || carregandoUso}
                >
                  {AJUSTES_FORMAS.confirmarArquivarPreferencial}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="toque"
                  onClick={confirmarExclusao}
                  disabled={pendenteItem || carregandoUso}
                >
                  {AJUSTES_FORMAS.confirmarExcluirMesmoAssim}
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
                {AJUSTES_FORMAS.excluir}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
