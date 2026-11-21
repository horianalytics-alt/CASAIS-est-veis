'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  Calendar,
  Check,
  ChevronDown,
  Edit2,
  Landmark,
  PowerOff,
  Repeat,
} from 'lucide-react'
import { alterarValorRecorrencia, encerrarRecorrencia } from '@/actions/recorrencia'
import { ValorMonetario, type TipoDeValor } from '@/components/financeiro/valor-monetario'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AJUSTES_ASSINATURAS } from '@/features/ajustes/copy'
import { tocarSomErro, tocarSomSucesso } from '@/features/sons/sons'
import { hapticFeedback } from '@/lib/haptics'
import { rotuloDoMes } from '@/lib/hoje'
import type { RegraRecorrente } from '@/lib/queries/recorrencias'
import { cn } from '@/lib/utils'

export interface ContaInfo {
  id: string
  name: string
  type: string
  archived_at: string | null
}

export interface ListaAssinaturasProps {
  ativas: RegraRecorrente[]
  encerradas: RegraRecorrente[]
  contas: ContaInfo[]
  mesAtual: string
}

export function ListaAssinaturas({
  ativas,
  encerradas,
  contas,
  mesAtual,
}: ListaAssinaturasProps) {
  const router = useRouter()
  const contasMap = React.useMemo(() => {
    return new Map(contas.map((c) => [c.id, c]))
  }, [contas])

  const [encerradasAberto, setEncerradasAberto] = React.useState(false)

  // Diálogo Editar Valor
  const [regraEditar, setRegraEditar] = React.useState<RegraRecorrente | null>(null)
  const [valorEdicao, setValorEdicao] = React.useState('')
  const [mesEdicao, setMesEdicao] = React.useState(mesAtual)

  // Diálogo Encerrar
  const [regraEncerrar, setRegraEncerrar] = React.useState<RegraRecorrente | null>(null)
  const [ultimoMes, setUltimoMes] = React.useState(mesAtual)

  const [pendente, setPendente] = React.useState(false)
  const [erroModal, setErroModal] = React.useState<string | null>(null)
  const [toastMensagem, setToastMensagem] = React.useState<string | null>(null)

  function abrirEdicao(regra: RegraRecorrente) {
    setRegraEditar(regra)
    setValorEdicao(String(regra.amount))
    setMesEdicao(mesAtual)
    setErroModal(null)
  }

  function abrirEncerramento(regra: RegraRecorrente) {
    setRegraEncerrar(regra)
    setUltimoMes(mesAtual)
    setErroModal(null)
  }

  async function handleSalvarNovoValor(e: React.FormEvent) {
    e.preventDefault()
    if (!regraEditar) return

    setPendente(true)
    setErroModal(null)

    const res = await alterarValorRecorrencia({
      regraId: regraEditar.id,
      valor: valorEdicao,
      aPartirDe: mesEdicao,
    })

    if (res.ok) {
      tocarSomSucesso()
      hapticFeedback.success()
      setToastMensagem(`Valor atualizado a partir de ${rotuloDoMes(mesEdicao)}.`)
      setRegraEditar(null)
      router.refresh()
    } else {
      tocarSomErro()
      hapticFeedback.warning()
      setErroModal(res.erro)
    }
    setPendente(false)
  }

  async function handleConfirmarEncerramento(e: React.FormEvent) {
    e.preventDefault()
    if (!regraEncerrar) return

    setPendente(true)
    setErroModal(null)

    const res = await encerrarRecorrencia({
      regraId: regraEncerrar.id,
      ultimoMes: ultimoMes,
    })

    if (res.ok) {
      tocarSomSucesso()
      hapticFeedback.success()
      setToastMensagem(`Assinatura encerrada com cobrança até ${rotuloDoMes(ultimoMes)}.`)
      setRegraEncerrar(null)
      router.refresh()
    } else {
      tocarSomErro()
      hapticFeedback.warning()
      setErroModal(res.erro)
    }
    setPendente(false)
  }

  React.useEffect(() => {
    if (toastMensagem) {
      const timer = setTimeout(() => setToastMensagem(null), 4000)
      return () => clearTimeout(timer)
    }
  }, [toastMensagem])

  return (
    <div className="flex flex-col gap-6">
      {/* Toast Feedback */}
      {toastMensagem && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-20 right-4 z-50 flex items-center gap-2.5 rounded-xl border border-border/80 bg-card px-4 py-3 shadow-lg text-xs font-medium text-foreground animate-in fade-in slide-in-from-bottom-3 duration-200"
        >
          <div className="flex size-5 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <Check className="size-3.5" />
          </div>
          <span>{toastMensagem}</span>
        </div>
      )}

      {/* Seção 1: Assinaturas Ativas */}
      <section aria-labelledby="titulo-ativas" className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 id="titulo-ativas" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {AJUSTES_ASSINATURAS.ativasTitulo} ({ativas.length})
          </h2>
        </div>

        {ativas.length === 0 ? (
          <div className="rounded-xl border border-border/80 bg-card p-6 text-center shadow-xs">
            <Repeat className="mx-auto size-8 text-muted-foreground/60" aria-hidden="true" />
            <p className="mt-2 text-sm font-medium text-foreground">
              {AJUSTES_ASSINATURAS.semAtivas}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Ao criar um lançamento de despesa ou receita, ligue &ldquo;Repetir todo mês&rdquo; para adicioná-lo aqui.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {ativas.map((r) => {
              const conta = contasMap.get(r.account_id)
              const ehDespesa = r.type === 'despesa'
              const contaArquivada = conta?.archived_at != null

              return (
                <div
                  key={r.id}
                  className="rounded-xl border border-border/80 bg-card p-4 shadow-xs flex flex-col gap-3 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div
                        className={cn(
                          'flex size-9 shrink-0 items-center justify-center rounded-lg border',
                          ehDespesa
                            ? 'bg-despesa/10 text-despesa border-despesa/20'
                            : 'bg-receita/10 text-receita border-receita/20',
                        )}
                      >
                        {ehDespesa ? (
                          <ArrowDownRight className="size-4.5" aria-hidden="true" />
                        ) : (
                          <ArrowUpRight className="size-4.5" aria-hidden="true" />
                        )}
                      </div>

                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-semibold text-foreground truncate">
                          {r.description}
                        </span>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mt-0.5">
                          <span className="flex items-center gap-1">
                            <Landmark className="size-3" aria-hidden="true" />
                            {conta?.name ?? 'Conta'}
                          </span>
                          <span>•</span>
                          <span className="flex items-center gap-1 font-mono">
                            <Calendar className="size-3" aria-hidden="true" />
                            Dia {r.day_of_month}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-sm font-bold font-mono num-tabular">
                        <ValorMonetario valor={r.amount} tipo={r.type as TipoDeValor} />
                      </span>
                    </div>
                  </div>

                  {contaArquivada && (
                    <div>
                      <Badge
                        variant="outline"
                        className="border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400 text-[11px]"
                      >
                        {AJUSTES_ASSINATURAS.badgeArquivada}
                      </Badge>
                    </div>
                  )}

                  {/* Ações */}
                  <div className="flex items-center justify-end gap-2 border-t border-border/50 pt-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => abrirEdicao(r)}
                      className="h-8 text-xs gap-1.5"
                    >
                      <Edit2 className="size-3.5" aria-hidden="true" />
                      {AJUSTES_ASSINATURAS.editarValor}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => abrirEncerramento(r)}
                      className="h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5"
                    >
                      <PowerOff className="size-3.5" aria-hidden="true" />
                      {AJUSTES_ASSINATURAS.encerrar}
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Seção 2: Assinaturas Encerradas (Colapsável) */}
      <section aria-labelledby="titulo-encerradas" className="flex flex-col gap-3">
        <button
          type="button"
          onClick={() => setEncerradasAberto((v) => !v)}
          className="flex min-h-[44px] items-center justify-between text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
          aria-expanded={encerradasAberto}
        >
          <span>
            {AJUSTES_ASSINATURAS.encerradasTitulo} ({encerradas.length})
          </span>
          <ChevronDown
            className={cn(
              'size-4 transition-transform duration-150',
              encerradasAberto && 'rotate-180',
            )}
            aria-hidden="true"
          />
        </button>

        {encerradasAberto && (
          <div className="flex flex-col gap-3 animate-in fade-in duration-150">
            {encerradas.length === 0 ? (
              <div className="rounded-xl border border-border/80 bg-card p-4 text-center">
                <p className="text-xs text-muted-foreground">
                  {AJUSTES_ASSINATURAS.semEncerradas}
                </p>
              </div>
            ) : (
              encerradas.map((r) => {
                const conta = contasMap.get(r.account_id)
                const mesFim = r.end_period ? r.end_period.slice(0, 7) : null

                return (
                  <div
                    key={r.id}
                    className="rounded-xl border border-border/60 bg-muted/20 p-3.5 opacity-80 flex items-center justify-between gap-3"
                  >
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-semibold text-foreground truncate">
                        {r.description}
                      </span>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                        <span>{conta?.name ?? 'Conta'}</span>
                        <span>•</span>
                        <span>Encerrada em {mesFim ? rotuloDoMes(mesFim) : 'mês passado'}</span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-xs font-medium font-mono text-muted-foreground">
                        <ValorMonetario valor={r.amount} tipo={r.type as TipoDeValor} />
                      </span>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )}
      </section>

      {/* Diálogo Editar Valor */}
      {regraEditar && (
        <Dialog open={Boolean(regraEditar)} onOpenChange={(aberto) => !aberto && setRegraEditar(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base font-semibold">
                Editar valor da assinatura
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                {regraEditar.description}
              </DialogDescription>
            </DialogHeader>

            {erroModal && (
              <Alert variant="destructive" className="py-2.5">
                <AlertCircle className="size-4" />
                <AlertDescription className="text-xs">{erroModal}</AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleSalvarNovoValor} className="flex flex-col gap-4 py-1 text-xs">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="novoValorAssinatura" className="text-xs font-medium">
                  Novo valor (R$)
                </Label>
                <Input
                  id="novoValorAssinatura"
                  inputMode="decimal"
                  value={valorEdicao}
                  onChange={(e) => setValorEdicao(e.target.value)}
                  placeholder="0,00"
                  className="font-mono"
                  disabled={pendente}
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="mesInicioNovoValor" className="text-xs font-medium">
                  A partir do mês
                </Label>
                <Input
                  id="mesInicioNovoValor"
                  type="month"
                  value={mesEdicao}
                  onChange={(e) => setMesEdicao(e.target.value)}
                  disabled={pendente}
                  required
                />
              </div>

              <p className="text-[11px] text-muted-foreground bg-muted/40 p-2.5 rounded-lg border border-border/70">
                {AJUSTES_ASSINATURAS.dicaEditar}
              </p>

              <DialogFooter className="pt-2 gap-2 sm:gap-0">
                <Button
                  type="button"
                  variant="ghost"
                  size="toque"
                  disabled={pendente}
                  onClick={() => setRegraEditar(null)}
                >
                  Cancelar
                </Button>
                <Button type="submit" size="toque" disabled={pendente}>
                  {pendente ? 'Salvando…' : 'Salvar novo valor'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Diálogo Encerrar Assinatura */}
      {regraEncerrar && (
        <Dialog open={Boolean(regraEncerrar)} onOpenChange={(aberto) => !aberto && setRegraEncerrar(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base font-semibold text-destructive">
                Encerrar assinatura
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                {regraEncerrar.description}
              </DialogDescription>
            </DialogHeader>

            {erroModal && (
              <Alert variant="destructive" className="py-2.5">
                <AlertCircle className="size-4" />
                <AlertDescription className="text-xs">{erroModal}</AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleConfirmarEncerramento} className="flex flex-col gap-4 py-1 text-xs">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ultimoMesCobrado" className="text-xs font-medium">
                  Último mês cobrado
                </Label>
                <Input
                  id="ultimoMesCobrado"
                  type="month"
                  value={ultimoMes}
                  onChange={(e) => setUltimoMes(e.target.value)}
                  disabled={pendente}
                  required
                />
              </div>

              <p className="text-[11px] text-amber-700 dark:text-amber-400 bg-amber-500/10 p-2.5 rounded-lg border border-amber-500/30">
                {AJUSTES_ASSINATURAS.dicaEncerrar}
              </p>

              <DialogFooter className="pt-2 gap-2 sm:gap-0">
                <Button
                  type="button"
                  variant="ghost"
                  size="toque"
                  disabled={pendente}
                  onClick={() => setRegraEncerrar(null)}
                >
                  Cancelar
                </Button>
                <Button type="submit" variant="destructive" size="toque" disabled={pendente}>
                  {pendente ? 'Encerrando…' : 'Encerrar assinatura'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
