import * as React from 'react'
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowRightLeft,
  Check,
  Clock,
  PiggyBank,
  User,
  Tag,
  CreditCard,
  Pencil,
  Trash2,
} from 'lucide-react'
import { BadgeTipo } from '@/components/financeiro/badge-tipo'
import {
  ValorMonetario,
  type TipoDeValor,
} from '@/components/financeiro/valor-monetario'
import { Checkbox } from '@/components/ui/checkbox'
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
    return 'border-l-[4px] border-l-purple-500 dark:border-l-purple-400'
  }
  switch (tipo) {
    case 'receita':
      return 'border-l-[4px] border-l-emerald-500 dark:border-l-emerald-400'
    case 'despesa':
      return 'border-l-[4px] border-l-rose-500 dark:border-l-rose-400'
    case 'investimento':
      return 'border-l-[4px] border-l-sky-500 dark:border-l-sky-400'
    case 'transferencia':
      return 'border-l-[4px] border-l-indigo-500 dark:border-l-indigo-400'
    default:
      return 'border-l-[4px] border-l-transparent'
  }
}

export interface TabelaTransacoesDesktopProps {
  transacoes: Transacao[]
  nomeCategoria: (id: string | null) => string | null | undefined
  nomeConta: (id: string) => string | undefined
  nomeMembro?: (id: string) => string | undefined
  /** Lançamento que acabou de ser salvo: linha com fundo de destaque. */
  idDestacado?: string | null
  selecionados?: Set<string>
  aoAlternarSelecao?: (id: string) => void
  aoAlternarTodos?: () => void
  todosSelecionados?: boolean
  aoEditar?: (transacao: Transacao) => void
  aoExcluir?: (transacao: Transacao) => void
}

export function TabelaTransacoesDesktop({
  transacoes,
  nomeCategoria,
  nomeConta,
  nomeMembro,
  idDestacado = null,
  selecionados,
  aoAlternarSelecao,
  aoAlternarTodos,
  todosSelecionados = false,
  aoEditar,
  aoExcluir,
}: TabelaTransacoesDesktopProps) {
  const temSelecao = Boolean(aoAlternarSelecao)
  const temAcoes = Boolean(aoEditar || aoExcluir)

  return (
    <div className="hidden lg:block w-full overflow-x-auto">
      <table className="w-full table-fixed text-left border-collapse text-sm">
        <thead>
          <tr className="border-b border-border/80 text-muted-foreground text-xs uppercase tracking-wider">
            {temSelecao && (
              <th className="py-3 px-3 w-[40px] text-center">
                <Checkbox
                  checked={todosSelecionados}
                  onCheckedChange={aoAlternarTodos}
                  aria-label="Selecionar todos os lançamentos visíveis"
                />
              </th>
            )}
            <th className="py-3 px-3 font-semibold whitespace-nowrap w-[95px]">Data</th>
            <th className="py-3 px-3 font-semibold">Descrição</th>
            <th className="py-3 px-3 font-semibold whitespace-nowrap w-[130px]">Categoria</th>
            <th className="py-3 px-3 font-semibold whitespace-nowrap w-[135px]">Conta</th>
            <th className="py-3 px-3 font-semibold whitespace-nowrap w-[110px]">Quem pagou</th>
            <th className="py-3 px-3 font-semibold text-right whitespace-nowrap w-[125px]">Valor</th>
            <th className="py-3 px-3 font-semibold text-center whitespace-nowrap w-[105px]">
              Status
            </th>
            {temAcoes && (
              <th className="py-3 px-3 font-semibold text-center whitespace-nowrap w-[80px]">
                Ações
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {transacoes.map((t) => {
            const tipo = tipoConhecido(t.type)
            const { Icone, classe } = getIconeETipo(tipo)
            const categoria = t.category_id ? nomeCategoria(t.category_id) : null
            const conta = nomeConta(t.account_id)
            const membro = nomeMembro ? nomeMembro(t.paid_by_member_id) : null
            const mostraStatus = tipo === 'receita' || tipo === 'despesa'
            const destacado = t.id === idDestacado
            const estaSelecionado = Boolean(selecionados?.has(t.id))

            return (
              <tr
                key={t.id}
                aria-current={destacado ? 'true' : undefined}
                onClick={() => aoAlternarSelecao?.(t.id)}
                className={cn(
                  'transition-colors group hover:bg-muted/40 cursor-pointer select-none',
                  getBordaTipo(tipo, Boolean(t.is_benefit)),
                  destacado && 'bg-primary/10',
                  estaSelecionado && 'bg-primary/5',
                )}
              >
                {/* Checkbox de Seleção */}
                {temSelecao && (
                  <td className="py-3 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={estaSelecionado}
                      onCheckedChange={() => aoAlternarSelecao?.(t.id)}
                      aria-label={`Selecionar ${t.description}`}
                    />
                  </td>
                )}

                {/* Data */}
                <td className="py-3 px-3 whitespace-nowrap text-muted-foreground font-mono text-xs num-tabular">
                  {isoToBR(t.date)}
                </td>

                {/* Descrição e Ícone */}
                <td className="py-3 px-3 min-w-0">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={cn('flex size-7 items-center justify-center rounded-lg border shrink-0', classe)}>
                      <Icone className="size-3.5" aria-hidden="true" />
                    </div>
                    <span
                      className="font-medium text-foreground truncate min-w-0 flex-1"
                      title={t.description}
                    >
                      {t.description}
                    </span>
                    {t.is_benefit && (
                      <span className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 font-bold border border-purple-500/20 shrink-0">
                        Vale
                      </span>
                    )}
                    <BadgeTipo tipo={t.type} pago={t.is_paid} className="text-[10px] shrink-0" />
                  </div>
                </td>

                {/* Categoria */}
                <td className="py-3 px-3 text-muted-foreground text-xs whitespace-nowrap">
                  {categoria ? (
                    <span className="inline-flex items-center gap-1 bg-muted/60 px-2 py-0.5 rounded-md font-medium text-foreground text-xs max-w-[120px] truncate" title={categoria}>
                      <Tag className="size-3 text-muted-foreground shrink-0" aria-hidden="true" />
                      <span className="truncate">{categoria}</span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground/60">—</span>
                  )}
                </td>

                {/* Conta */}
                <td className="py-3 px-3 text-foreground text-xs whitespace-nowrap">
                  <span className="inline-flex items-center gap-1 max-w-[125px] truncate font-medium" title={conta ?? undefined}>
                    <CreditCard className="size-3 text-muted-foreground shrink-0" aria-hidden="true" />
                    <span className="truncate">{conta ?? '—'}</span>
                  </span>
                </td>

                {/* Quem pagou */}
                <td className="py-3 px-3 text-xs whitespace-nowrap">
                  {membro ? (
                    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-primary/10 text-primary font-medium">
                      <User className="size-3" aria-hidden="true" />
                      <span>{membro}</span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground/60">—</span>
                  )}
                </td>

                {/* Valor */}
                <td className="py-3 px-3 text-right whitespace-nowrap font-medium font-mono num-tabular">
                  {tipo ? (
                    <ValorMonetario
                      valor={t.amount}
                      tipo={tipo}
                      pago={t.is_paid}
                      className="font-semibold text-sm"
                    />
                  ) : null}
                </td>

                {/* Status */}
                <td className="py-3 px-3 text-center whitespace-nowrap">
                  {mostraStatus ? (
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded-full font-medium',
                        t.is_paid
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                          : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20',
                      )}
                    >
                      {t.is_paid ? (
                        <Check className="size-3" aria-hidden="true" />
                      ) : (
                        <Clock className="size-3" aria-hidden="true" />
                      )}
                      <span>{t.is_paid ? INICIO.pago : INICIO.pendente}</span>
                    </span>
                  ) : null}
                </td>

                {/* Ações (Editar & Excluir) */}
                {temAcoes && (
                  <td
                    className="py-3 px-3 text-center whitespace-nowrap"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-center gap-1">
                      {aoEditar && (
                        <button
                          type="button"
                          onClick={() => aoEditar(t)}
                          className="size-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
                          title="Editar lançamento"
                          aria-label={`Editar ${t.description}`}
                        >
                          <Pencil className="size-3.5" />
                        </button>
                      )}
                      {aoExcluir && (
                        <button
                          type="button"
                          onClick={() => aoExcluir(t)}
                          className="size-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          title="Excluir lançamento"
                          aria-label={`Excluir ${t.description}`}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}