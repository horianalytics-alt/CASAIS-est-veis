'use client'

import * as React from 'react'
import { Filter, Users, Tag, ArrowDownLeft, ArrowUpRight, PiggyBank } from 'lucide-react'
import { ItemTransacao } from './item-transacao'
import { TabelaTransacoesDesktop } from './tabela-transacoes-desktop'
import { EstadoVazio } from '@/components/ui/estado-vazio'
import { cn } from '@/lib/utils'
import type { Database } from '@/types/database'

type Transacao = Database['public']['Tables']['transactions']['Row']

export interface MembroResumo {
  id: string
  display_name: string
}

export interface ListaTransacoesInterativaProps {
  transacoes: Transacao[]
  membros: MembroResumo[]
  mapaContas: Record<string, string>
  mapaCategorias: Record<string, string>
  idDestacado?: string | null
}

export function ListaTransacoesInterativa({
  transacoes,
  membros,
  mapaContas,
  mapaCategorias,
  idDestacado,
}: ListaTransacoesInterativaProps) {
  const [filtroMembro, setFiltroMembro] = React.useState<string>('todos')
  const [filtroTipo, setFiltroTipo] = React.useState<string>('todos')

  // Mapa de id do membro para display_name
  const mapaMembros = React.useMemo(() => {
    return new Map(membros.map((m) => [m.id, m.display_name]))
  }, [membros])

  // Filtragem reativa instantânea em memória
  const transacoesFiltradas = React.useMemo(() => {
    return transacoes.filter((t) => {
      if (filtroMembro !== 'todos' && t.paid_by_member_id !== filtroMembro) {
        return false
      }
      if (filtroTipo !== 'todos' && t.type !== filtroTipo) {
        return false
      }
      return true
    })
  }, [transacoes, filtroMembro, filtroTipo])

  return (
    <div className="flex flex-col gap-4">
      {/* Barra de Filtros Rápidos (Pills) no estilo do app antigo */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-border/60">
        <div className="flex flex-wrap items-center gap-2">
          {/* Filtro por Membro (quando há membros na casa) */}
          {membros.length > 1 && (
            <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-xl border border-border/60">
              <button
                type="button"
                onClick={() => setFiltroMembro('todos')}
                className={cn(
                  'px-3 py-1 text-xs font-semibold rounded-lg transition-all',
                  filtroMembro === 'todos'
                    ? 'bg-background text-foreground shadow-2xs border border-border/80'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                Todos
              </button>
              {membros.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setFiltroMembro(m.id)}
                  className={cn(
                    'px-3 py-1 text-xs font-semibold rounded-lg transition-all',
                    filtroMembro === m.id
                      ? 'bg-background text-foreground shadow-2xs border border-border/80'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {m.display_name}
                </button>
              ))}
            </div>
          )}

          {/* Filtro por Tipo */}
          <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-xl border border-border/60">
            <button
              type="button"
              onClick={() => setFiltroTipo('todos')}
              className={cn(
                'px-2.5 py-1 text-xs font-semibold rounded-lg transition-all',
                filtroTipo === 'todos'
                  ? 'bg-background text-foreground shadow-2xs border border-border/80'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Tudo
            </button>
            <button
              type="button"
              onClick={() => setFiltroTipo('despesa')}
              className={cn(
                'px-2.5 py-1 text-xs font-semibold rounded-lg transition-all',
                filtroTipo === 'despesa'
                  ? 'bg-despesa/15 text-despesa font-bold border border-despesa/30 shadow-2xs'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Despesas
            </button>
            <button
              type="button"
              onClick={() => setFiltroTipo('receita')}
              className={cn(
                'px-2.5 py-1 text-xs font-semibold rounded-lg transition-all',
                filtroTipo === 'receita'
                  ? 'bg-receita/15 text-receita font-bold border border-receita/30 shadow-2xs'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Receitas
            </button>
          </div>
        </div>

        {/* Contador de lançamentos visíveis */}
        <span className="text-muted-foreground text-xs font-medium">
          {transacoesFiltradas.length}{' '}
          {transacoesFiltradas.length === 1 ? 'lançamento' : 'lançamentos'}
        </span>
      </div>

      {/* Conteúdo da Lista / Tabela */}
      {transacoesFiltradas.length === 0 ? (
        <div className="py-8 text-center flex flex-col items-center justify-center gap-2">
          <p className="text-muted-foreground text-sm">
            Nenhum lançamento encontrado para os filtros selecionados.
          </p>
          {(filtroMembro !== 'todos' || filtroTipo !== 'todos') && (
            <button
              type="button"
              onClick={() => {
                setFiltroMembro('todos')
                setFiltroTipo('todos')
              }}
              className="text-xs text-primary font-semibold hover:underline"
            >
              Limpar filtros
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Mobile / Tablet (< 1024px): Lista em cartões modernos */}
          <ul className="flex flex-col gap-2.5 lg:hidden">
            {transacoesFiltradas.map((t) => (
              <ItemTransacao
                key={t.id}
                transacao={t}
                nomeConta={mapaContas[t.account_id]}
                nomeCategoria={t.category_id ? mapaCategorias[t.category_id] : null}
                nomeMembro={mapaMembros.get(t.paid_by_member_id)}
                destacado={t.id === idDestacado}
              />
            ))}
          </ul>

          {/* Desktop (>= 1024px): Tabela rica de lançamentos */}
          <TabelaTransacoesDesktop
            transacoes={transacoesFiltradas}
            nomeConta={(id) => mapaContas[id]}
            nomeCategoria={(id) => (id ? mapaCategorias[id] : null)}
            nomeMembro={(id) => mapaMembros.get(id)}
            idDestacado={idDestacado}
          />
        </>
      )}

    </div>
  )
}