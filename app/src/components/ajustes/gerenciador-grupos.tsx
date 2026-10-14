'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Check, Edit2, FolderOpen, Plus, Trash2, X } from 'lucide-react'
import type { Database } from '@/types/database'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CampoErro } from '@/components/ui/campo-erro'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { AJUSTES_GRUPOS } from '@/features/ajustes/copy'
import { tocarSomErro, tocarSomSucesso } from '@/features/sons/sons'
import { adicionarGrupo, renomearGrupo, excluirGrupo } from '@/actions/grupos-categoria'
import { LIMITE_CARACTERES } from '@/lib/lista-nomes'

type GrupoRow = Database['public']['Tables']['category_groups']['Row']

interface GerenciadorGruposProps {
  gruposIniciais: GrupoRow[]
}

export function GerenciadorGrupos({ gruposIniciais }: GerenciadorGruposProps) {
  const router = useRouter()
  const [pendente, iniciarTransicao] = React.useTransition()

  const [erroGeral, setErroGeral] = React.useState<string | null>(null)
  const [erroNomeAdicionar, setErroNomeAdicionar] = React.useState<string[] | undefined>()
  const [novoNome, setNovoNome] = React.useState('')

  const [editandoId, setEditandoId] = React.useState<string | null>(null)
  const [nomeEditado, setNomeEditado] = React.useState('')
  const [erroRenomear, setErroRenomear] = React.useState<string[] | undefined>()

  const [grupoParaExcluir, setGrupoParaExcluir] = React.useState<GrupoRow | null>(null)
  const [msgSucesso, setMsgSucesso] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!msgSucesso) return
    const t = setTimeout(() => setMsgSucesso(null), 4000)
    return () => clearTimeout(t)
  }, [msgSucesso])

  const aoAdicionar = (e: React.FormEvent) => {
    e.preventDefault()
    const nome = novoNome.trim()
    if (!nome) return
    setErroGeral(null)
    setErroNomeAdicionar(undefined)
    iniciarTransicao(async () => {
      const res = await adicionarGrupo({ nome })
      if (res.ok) {
        tocarSomSucesso()
        setNovoNome('')
        router.refresh()
      } else {
        tocarSomErro()
        if (res.camposComErro?.nome) {
          setErroNomeAdicionar(res.camposComErro.nome)
        } else {
          setErroGeral(res.erro ?? AJUSTES_GRUPOS.erroGeral)
        }
      }
    })
  }

  const iniciarEdicao = (grupo: GrupoRow) => {
    setErroGeral(null)
    setErroRenomear(undefined)
    setEditandoId(grupo.id)
    setNomeEditado(grupo.name)
  }

  const cancelarEdicao = () => {
    setEditandoId(null)
    setErroRenomear(undefined)
  }

  const salvarRenomear = (grupo: GrupoRow) => {
    const nome = nomeEditado.trim()
    if (!nome) return
    setErroGeral(null)
    setErroRenomear(undefined)
    iniciarTransicao(async () => {
      const res = await renomearGrupo({ id: grupo.id, nome })
      if (res.ok) {
        tocarSomSucesso()
        setEditandoId(null)
        router.refresh()
      } else {
        tocarSomErro()
        if (res.camposComErro?.nome) {
          setErroRenomear(res.camposComErro.nome)
        } else {
          setErroGeral(res.erro ?? AJUSTES_GRUPOS.erroGeral)
        }
      }
    })
  }

  const confirmarExclusao = () => {
    if (!grupoParaExcluir) return
    setErroGeral(null)
    iniciarTransicao(async () => {
      const res = await excluirGrupo({ id: grupoParaExcluir.id })
      setGrupoParaExcluir(null)
      if (res.ok) {
        tocarSomSucesso()
        setMsgSucesso(AJUSTES_GRUPOS.grupoExcluido(res.dados.categoriasDesvinculadas))
        router.refresh()
      } else {
        tocarSomErro()
        setErroGeral(res.erro ?? AJUSTES_GRUPOS.erroGeral)
      }
    })
  }

  return (
    <section
      aria-labelledby="titulo-grupos-categoria"
      className="bg-card border-border/80 flex flex-col gap-4 rounded-xl border p-5 shadow-xs"
    >
      <div>
        <h2 id="titulo-grupos-categoria" className="text-foreground text-base font-semibold">
          {AJUSTES_GRUPOS.titulo}
        </h2>
        <p className="text-muted-foreground text-xs mt-0.5">{AJUSTES_GRUPOS.subtitulo}</p>
      </div>

      {erroGeral && (
        <Alert variant="destructive">
          <AlertDescription>{erroGeral}</AlertDescription>
        </Alert>
      )}
      {msgSucesso && (
        <Alert className="border-receita/30 bg-receita/10 text-receita">
          <AlertDescription>{msgSucesso}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={aoAdicionar} className="flex flex-col gap-2" noValidate>
        <Label htmlFor="novo-grupo">{AJUSTES_GRUPOS.nomeLabel}</Label>
        <div className="flex gap-2">
          <Input
            id="novo-grupo"
            value={novoNome}
            onChange={(e) => {
              setNovoNome(e.target.value)
              setErroNomeAdicionar(undefined)
            }}
            placeholder={AJUSTES_GRUPOS.adicionarPlaceholder}
            maxLength={LIMITE_CARACTERES}
            disabled={pendente}
            aria-invalid={erroNomeAdicionar ? true : undefined}
            aria-describedby={erroNomeAdicionar ? 'erro-nome-grupo' : undefined}
            className="flex-1 min-h-[44px]"
          />
          <Button
            type="submit"
            size="toque"
            disabled={pendente || !novoNome.trim()}
            className="gap-1.5 shrink-0"
          >
            <Plus className="size-4" aria-hidden="true" />
            {pendente ? AJUSTES_GRUPOS.adicionando : AJUSTES_GRUPOS.adicionarBotao}
          </Button>
        </div>
        <CampoErro id="erro-nome-grupo" mensagens={erroNomeAdicionar} />
      </form>

      {gruposIniciais.length === 0 ? (
        <p className="text-muted-foreground text-sm text-center py-4">
          {AJUSTES_GRUPOS.semGrupos}
        </p>
      ) : (
        <div className="bg-background border-border/70 divide-border flex flex-col divide-y rounded-lg border overflow-hidden">
          {gruposIniciais.map((grupo) => {
            const estaEditando = editandoId === grupo.id
            return (
              <div key={grupo.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                {estaEditando ? (
                  <div className="flex flex-1 flex-wrap items-center gap-2">
                    <Input
                      value={nomeEditado}
                      onChange={(e) => {
                        setNomeEditado(e.target.value)
                        setErroRenomear(undefined)
                      }}
                      maxLength={LIMITE_CARACTERES}
                      disabled={pendente}
                      aria-label="Novo nome do grupo"
                      aria-invalid={erroRenomear ? true : undefined}
                      aria-describedby={erroRenomear ? `erro-renomear-${grupo.id}` : undefined}
                      className="min-h-[44px] flex-1 min-w-[160px]"
                      autoFocus
                    />
                    <CampoErro id={`erro-renomear-${grupo.id}`} mensagens={erroRenomear} />
                    <Button
                      type="button"
                      size="toque"
                      onClick={() => salvarRenomear(grupo)}
                      disabled={pendente || !nomeEditado.trim()}
                      className="gap-1.5"
                    >
                      <Check className="size-4" aria-hidden="true" />
                      {AJUSTES_GRUPOS.salvarRenomear}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="toque"
                      onClick={cancelarEdicao}
                      disabled={pendente}
                    >
                      <X className="size-4" aria-hidden="true" />
                      {AJUSTES_GRUPOS.cancelar}
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <div className="bg-muted text-muted-foreground flex size-8 items-center justify-center rounded-lg border border-border shrink-0">
                        <FolderOpen className="size-4" aria-hidden="true" />
                      </div>
                      <span className="text-foreground text-sm font-medium">{grupo.name}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="toque"
                        onClick={() => iniciarEdicao(grupo)}
                        disabled={pendente}
                        className="gap-1.5 text-xs"
                      >
                        <Edit2 className="size-3.5" aria-hidden="true" />
                        {AJUSTES_GRUPOS.renomear}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icone-toque"
                        onClick={() => setGrupoParaExcluir(grupo)}
                        disabled={pendente}
                        aria-label={`Excluir grupo ${grupo.name}`}
                        title={AJUSTES_GRUPOS.excluir}
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
      )}

      <Dialog
        open={grupoParaExcluir !== null}
        onOpenChange={(ab) => {
          if (!ab) setGrupoParaExcluir(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-pendente" aria-hidden="true" />
              {AJUSTES_GRUPOS.excluirTitulo}
            </DialogTitle>
            <DialogDescription>
              {grupoParaExcluir ? AJUSTES_GRUPOS.excluirDescricao(grupoParaExcluir.name) : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              size="toque"
              onClick={() => setGrupoParaExcluir(null)}
              disabled={pendente}
            >
              {AJUSTES_GRUPOS.cancelar}
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="toque"
              onClick={confirmarExclusao}
              disabled={pendente}
            >
              {AJUSTES_GRUPOS.excluirConfirmar}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}