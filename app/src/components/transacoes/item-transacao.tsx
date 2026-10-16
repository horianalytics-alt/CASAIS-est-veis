'use client'

import * as React from 'react'
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowRightLeft,
  Check,
  Clock,
  PiggyBank,
  User,
  CreditCard,
  Tag,
  Pencil,
  Trash2,
  Sparkles,
} from 'lucide-react'
import {
  ValorMonetario,
  type TipoDeValor,
} from '@/components/financeiro/valor-monetario'
import { Checkbox } from '@/components/ui/checkbox'
import { useInView } from '@/hooks/use-in-view'
import { hapticFeedback } from '@/lib/haptics'
import { INICIO } from '@/features/transacoes/copy'
import { isoToBR } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Database } from '@/types/database'

type Transacao = Database['public']['Tables']['transactions']['Row']

const TIPOS: readonly TipoDeValor[] = [
  'receita',
  'despesa',
  'investimento',
  'transferencia',
]

function tipoConhecido(tipo: string): TipoDeValor | undefined {
  return TIPOS.find((t) => t === tipo)
}

function getIconeETipo(tipo: string | undefined) {
  switch (tipo) {
    case 'receita':
      return { Icone: ArrowDownLeft, classe: 'bg-receita/10 text-receita border-receita/20' }
    case 'despesa':
      return { Icone: ArrowUpRight, classe: 'bg-despesa/10 text-despesa border-despesa/20' }
    case 'investimento':
      return { Icone: PiggyBank, classe: 'bg-investimento/10 text-investimento border-investimento/20' }
    case 'transferencia':
      return { Icone: ArrowRightLeft, classe: 'bg-transferencia/10 text-transferencia border-transferencia/20' }
    default:
      return { Icone: ArrowUpRight, classe: 'bg-muted text-muted-foreground border-border' }
  }
}

function getBordaTipo(tipo: string | undefined, ehBeneficio: boolean) {
  if (ehBeneficio) {
    return 'border-l-[5px] border-l-purple-500 dark:border-l-purple-400'
  }
  switch (tipo) {
    case 'receita':
      return 'border-l-[5px] border-l-emerald-500 dark:border-l-emerald-400'
    case 'despesa':
      return 'border-l-[5px] border-l-rose-500 dark:border-l-rose-400'
    case 'investimento':
      return 'border-l-[5px] border-l-sky-500 dark:border-l-sky-400'
    case 'transferencia':
      return 'border-l-[5px] border-l-indigo-500 dark:border-l-indigo-400'
    default:
      return 'border-l-[5px] border-l-border'
  }
}

export interface ItemTransacaoProps {
  transacao: Transacao
  nomeCategoria?: string | null
  nomeConta?: string | null
  nomeMembro?: string | null
  /** Posição na lista para stagger inicial suave */
  indice?: number
  /** Acabou de ser salvo: fundo de destaque para a pessoa achar na lista. */
  destacado?: boolean
  selecionado?: boolean
  modoSelecao?: boolean
  aoAlternarSelecao?: (id: string) => void
  aoIniciarSelecao?: (id: string) => void
  aoEditar?: (transacao: Transacao) => void
  aoExcluir?: (transacao: Transacao) => void
}

/**
 * Item de Transação no Mobile e Tablet:
 * - Card esticado de ponta a ponta (full-width)
 * - Scroll Reveal suave item a item conforme entra na tela
 * - Borda esquerda colorida semântica (Verde=Receita, Vermelho=Despesa, Azul=Investimento, Roxo=Vale)
 * - Checkbox oculto no estado normal: aparece apenas após clique longo ou no modo de seleção ativa
 * - Gesto nativo de Swipe to Delete para arrastar e revelar o botão de exclusão
 * - Ações táteis de edição e exclusão rápidas com haptic feedback
 */
export function ItemTransacao({
  transacao,
  nomeCategoria,
  nomeConta,
  nomeMembro,
  indice,
  destacado = false,
  selecionado = false,
  modoSelecao = false,
  aoAlternarSelecao,
  aoIniciarSelecao,
  aoEditar,
  aoExcluir,
}: ItemTransacaoProps) {
  const { ref: itemRef, inView } = useInView<HTMLLIElement>({
    threshold: 0.08,
    replayOnScroll: true,
  })

  const tipo = tipoConhecido(transacao.type)
  const { Icone, classe } = getIconeETipo(tipo)
  const bordaClasse = getBordaTipo(tipo, Boolean(transacao.is_benefit))
  const mostraStatus = tipo === 'receita' || tipo === 'despesa'

  // Estados para gesto de Swipe to Delete e Long Press
  const [arrastoX, setArrastoX] = React.useState(0)
  const arrastoXRef = React.useRef(0)
  const [emArrasto, setEmArrasto] = React.useState(false)
  const toqueInicioRef = React.useRef<{ x: number; y: number } | null>(null)
  const travaDirecaoRef = React.useRef<'horizontal' | 'vertical' | null>(null)
  const timerLongPressRef = React.useRef<NodeJS.Timeout | null>(null)
  const swipeAbertoRef = React.useRef(false)
  const ignorarCliqueRef = React.useRef(false)

  // Quando entra no modo de seleção em lote, fecha qualquer card aberto por swipe
  React.useEffect(() => {
    if (modoSelecao && arrastoX !== 0) {
      setArrastoX(0)
      arrastoXRef.current = 0
      swipeAbertoRef.current = false
    }
  }, [modoSelecao, arrastoX])

  const iniciarGesto = (clientX: number, clientY: number) => {
    if (modoSelecao) return
    toqueInicioRef.current = { x: clientX, y: clientY }
    travaDirecaoRef.current = null

    // Long Press para ativar modo de seleção em massa (450ms)
    timerLongPressRef.current = setTimeout(() => {
      ignorarCliqueRef.current = true
      setArrastoX(0)
      arrastoXRef.current = 0
      swipeAbertoRef.current = false
      aoIniciarSelecao?.(transacao.id)
      hapticFeedback.medium()
    }, 450)
  }

  const moverGesto = (clientX: number, clientY: number) => {
    if (!toqueInicioRef.current || modoSelecao) return
    const deltaX = clientX - toqueInicioRef.current.x
    const deltaY = clientY - toqueInicioRef.current.y

    // Se moveu além de 8px, cancela o long press
    if (Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8) {
      if (timerLongPressRef.current) {
        clearTimeout(timerLongPressRef.current)
        timerLongPressRef.current = null
      }
    }

    // Trava de direção para não bloquear rolagem vertical da página
    if (!travaDirecaoRef.current) {
      if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 6) {
        travaDirecaoRef.current = 'vertical'
        return
      }
      if (Math.abs(deltaX) > 6) {
        travaDirecaoRef.current = 'horizontal'
      }
    }

    if (travaDirecaoRef.current === 'horizontal') {
      setEmArrasto(true)
      const baseOffset = swipeAbertoRef.current ? -76 : 0
      const novoX = baseOffset + deltaX
      // Arrastar para a esquerda revela botão excluir
      const clampX = novoX < 0 ? Math.max(-85, novoX) : 0
      arrastoXRef.current = clampX
      setArrastoX(clampX)
    }
  }

  const finalizarGesto = () => {
    if (timerLongPressRef.current) {
      clearTimeout(timerLongPressRef.current)
      timerLongPressRef.current = null
    }
    toqueInicioRef.current = null
    travaDirecaoRef.current = null
    setEmArrasto(false)

    // Se arrastou mais que 40px para a esquerda, fixa aberto
    if (arrastoXRef.current < -40) {
      arrastoXRef.current = -76
      setArrastoX(-76)
      swipeAbertoRef.current = true
      ignorarCliqueRef.current = true
      hapticFeedback.light()
      setTimeout(() => {
        ignorarCliqueRef.current = false
      }, 350)
    } else {
      arrastoXRef.current = 0
      setArrastoX(0)
      swipeAbertoRef.current = false
    }
  }

  const aoClicarCard = () => {
    if (ignorarCliqueRef.current) {
      ignorarCliqueRef.current = false
      return
    }
    if (arrastoXRef.current < 0 || swipeAbertoRef.current) {
      arrastoXRef.current = 0
      setArrastoX(0)
      swipeAbertoRef.current = false
      return
    }
    if (modoSelecao && aoAlternarSelecao) {
      hapticFeedback.selection()
      aoAlternarSelecao(transacao.id)
    }
  }

  return (
    <li
      ref={itemRef}
      className={cn(
        'relative w-full overflow-hidden rounded-xl transition-all duration-400 ease-out',
        inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3.5',
      )}
      style={{
        transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
        transitionDelay: indice !== undefined ? `${Math.min((indice % 4) * 35, 120)}ms` : '0ms',
      }}
    >
      {/* Ação oculta de exclusão revelada por Swipe */}
      <div
        className={cn(
          'absolute inset-y-0 right-0 w-20 flex items-center justify-center bg-destructive text-destructive-foreground rounded-r-xl z-0 transition-opacity duration-150',
          arrastoX < 0 ? 'opacity-100' : 'opacity-0 pointer-events-none',
        )}
      >
        <button
          type="button"
          tabIndex={arrastoX < 0 ? 0 : -1}
          onClick={() => {
            setArrastoX(0)
            swipeAbertoRef.current = false
            hapticFeedback.warning()
            aoExcluir?.(transacao)
          }}
          className="size-full flex flex-col items-center justify-center gap-1 text-[11px] font-bold"
          aria-label={`Excluir ${transacao.description}`}
        >
          <Trash2 className="size-4" />
          <span>Excluir</span>
        </button>
      </div>

      {/* Conteúdo Principal do Card */}
      <div
        onClick={aoClicarCard}
        onPointerDown={(e) => {
          if (e.button !== 0) return
          iniciarGesto(e.clientX, e.clientY)
          try {
            ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
          } catch {}
        }}
        onPointerMove={(e) => {
          if (toqueInicioRef.current) {
            moverGesto(e.clientX, e.clientY)
          }
        }}
        onPointerUp={(e) => {
          finalizarGesto()
          try {
            ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
          } catch {}
        }}
        onPointerCancel={(e) => {
          finalizarGesto()
          try {
            ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
          } catch {}
        }}
        style={{
          transform: `translateX(${arrastoX}px)`,
          transition: emArrasto ? 'none' : 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        aria-current={destacado ? 'true' : undefined}
        className={cn(
          'group flex flex-col gap-2.5 p-3.5 sm:p-4 rounded-xl border border-border/70 bg-card hover:border-border hover:shadow-2xs transition-all relative z-10 select-none cursor-pointer touch-pan-y',
          bordaClasse,
          destacado && 'animate-flash-recente ring-2 ring-primary/50',
          selecionado && 'border-primary/60 ring-2 ring-primary/30 shadow-xs',
        )}
      >
        {/* Topo: Checkbox (no modo seleção ou hover desktop) + Ícone + Descrição + Valor e Ações */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            {/* Checkbox: sempre visível em modoSelecao, ou no hover em PCs/Notebooks */}
            {aoAlternarSelecao && (
              <div
                className={cn(
                  'shrink-0 items-center pr-1 transition-opacity duration-150',
                  modoSelecao
                    ? 'flex opacity-100 animate-in fade-in zoom-in-75 duration-150'
                    : 'hidden sm:flex opacity-0 group-hover:opacity-100',
                )}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <Checkbox
                  checked={selecionado}
                  onCheckedChange={() => {
                    hapticFeedback.selection()
                    aoAlternarSelecao(transacao.id)
                  }}
                  aria-label={`Selecionar ${transacao.description}`}
                />
              </div>
            )}

            <div className={cn('flex size-8 items-center justify-center rounded-lg border shrink-0', classe)}>
              <Icone className="size-4" aria-hidden="true" />
            </div>

            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="font-semibold text-sm text-foreground truncate" title={transacao.description}>
                  {transacao.description}
                </span>
                {/* Destaque para benefício / vale */}
                {transacao.is_benefit && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 font-bold border border-purple-500/20 shrink-0">
                    <Sparkles className="size-2.5" />
                    Vale
                  </span>
                )}
              </div>
              <span className="text-[11px] text-muted-foreground font-mono num-tabular">
                {isoToBR(transacao.date)}
              </span>
            </div>
          </div>

          <div className="shrink-0 flex flex-col items-end gap-1">
            {tipo ? (
              <ValorMonetario
                valor={transacao.amount}
                tipo={tipo}
                pago={transacao.is_paid}
                className="font-bold text-sm sm:text-base"
              />
            ) : null}

            {/* Ações diretas de clique */}
            {!modoSelecao && (aoEditar || aoExcluir) && (
              <div
                className="flex items-center gap-1"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              >
                {aoEditar && (
                  <button
                    type="button"
                    onClick={() => {
                      hapticFeedback.light()
                      aoEditar(transacao)
                    }}
                    className="size-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
                    title="Editar lançamento"
                    aria-label={`Editar ${transacao.description}`}
                  >
                    <Pencil className="size-3.5" />
                  </button>
                )}
                {aoExcluir && (
                  <button
                    type="button"
                    onClick={() => {
                      hapticFeedback.warning()
                      aoExcluir(transacao)
                    }}
                    className="size-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    title="Excluir lançamento"
                    aria-label={`Excluir ${transacao.description}`}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Base: Badges de Conta, Categoria, Membro e Status */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-border/40 text-xs">
          {/* Conta */}
          {nomeConta && (
            <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-muted/60 text-muted-foreground font-medium">
              <CreditCard className="size-3" aria-hidden="true" />
              <span className="truncate max-w-[120px]">{nomeConta}</span>
            </span>
          )}

          {/* Categoria */}
          {nomeCategoria && (
            <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-muted/60 text-muted-foreground font-medium">
              <Tag className="size-3" aria-hidden="true" />
              <span className="truncate max-w-[120px]">{nomeCategoria}</span>
            </span>
          )}

          {/* Membro que pagou */}
          {nomeMembro && (
            <span
              className={cn(
                'inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md font-medium border',
                nomeMembro.toLowerCase().includes('carol')
                  ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20'
                  : 'bg-primary/10 text-primary border-primary/20',
              )}
            >
              <User className="size-3" aria-hidden="true" />
              <span>{nomeMembro}</span>
            </span>
          )}

          {/* Status Pago / Pendente */}
          {mostraStatus && (
            <span
              className={cn(
                'inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md font-medium ml-auto',
                transacao.is_paid
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                  : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20',
              )}
            >
              {transacao.is_paid ? (
                <Check className="size-3" aria-hidden="true" />
              ) : (
                <Clock className="size-3" aria-hidden="true" />
              )}
              <span>{transacao.is_paid ? INICIO.pago : INICIO.pendente}</span>
            </span>
          )}
        </div>
      </div>
    </li>
  )
}