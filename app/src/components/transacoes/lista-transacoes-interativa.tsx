'use client'

import * as React from 'react'
import {
  ArrowDownLeft,
  ArrowUpDown,
  ArrowUpRight,
  Filter,
  Search,
  Tag,
  X,
} from 'lucide-react'
import { ItemTransacao } from './item-transacao'
import { TabelaTransacoesDesktop } from './tabela-transacoes-desktop'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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

type TipoOrdenacao = 'data_desc' | 'data_asc' | 'valor_desc' | 'valor_asc'

export function ListaTransacoesInterativa({
  transacoes,
  membros,
  mapaContas,
  mapaCategorias,
  idDestacado,
}: ListaTransacoesInterativaProps) {
  const [filtroMembro, setFiltroMembro] = React.useState<string>('todos')
  const [filtroTipo, setFiltroTipo] = React.useState<string>('todos')
  const [filtroCategoria, setFiltroCategoria] = React.useState<string>('todas')
  const [busca, setBusca] = React.useState<string>('')
  const [ordenacao, setOrdenacao] = React.useState<TipoOrdenacao>('data_desc')

  // Mapa de id do membro para display_name
  const mapaMembros = React.useMemo(() => {
    return new Map(membros.map((m) => [m.id, m.display_name]))
  }, [membros])

  // Lista de categorias presentes nas transações deste mês
  const categoriasPresentes = React.useMemo(() => {
    const ids = new Set<string>()
    let temSemCategoria = false
    for (const t of transacoes) {
      if (t.category_id) {
        ids.add(t.category_id)
      } else {
        temSemCategoria = true
      }
    }
    const lista = Array.from(ids).map((id) => ({
      id,
      nome: mapaCategorias[id] || 'Categoria',
    }))
    lista.sort((a, b) => a.nome.localeCompare(b.nome))
    if (temSemCategoria) {
      lista.push({ id: '__sem_categoria__', nome: 'Sem categoria' })
    }
    return lista
  }, [transacoes, mapaCategorias])

  // Checagem se algum filtro não-padrão está ativo
  const temFiltroAtivo =
    filtroMembro !== 'todos' ||
    filtroTipo !== 'todos' ||
    filtroCategoria !== 'todas' ||
    busca.trim() !== '' ||
    ordenacao !== 'data_desc'

  const limparFiltros = () => {
    setFiltroMembro('todos')
    setFiltroTipo('todos')
    setFiltroCategoria('todas')
    setBusca('')
    setOrdenacao('data_desc')
  }

  // Filtragem e ordenação reativa instantânea em memória
  const transacoesFiltradas = React.useMemo(() => {
    const termo = busca.trim().toLowerCase()
    const termoNumero = termo.replace(/[^\d.,]/g, '').replace(',', '.')
    const valorBuscado = Number.parseFloat(termoNumero)
    const ehBuscaNumerica = !Number.isNaN(valorBuscado) && termoNumero.length > 0

    const filtradas = transacoes.filter((t) => {
      // 1. Membro
      if (filtroMembro !== 'todos' && t.paid_by_member_id !== filtroMembro) {
        return false
      }

      // 2. Tipo
      if (filtroTipo !== 'todos' && t.type !== filtroTipo) {
        return false
      }

      // 3. Categoria
      if (filtroCategoria !== 'todas') {
        if (filtroCategoria === '__sem_categoria__') {
          if (t.category_id) return false
        } else if (t.category_id !== filtroCategoria) {
          return false
        }
      }

      // 4. Busca por texto na descrição ou por valor
      if (termo) {
        const bateDescricao = t.description.toLowerCase().includes(termo)
        const bateValor =
          ehBuscaNumerica &&
          (t.amount.toString().includes(termoNumero) ||
            Math.abs(t.amount - valorBuscado) < 0.01)

        if (!bateDescricao && !bateValor) {
          return false
        }
      }

      return true
    })

    // Ordenação
    return filtradas.sort((a, b) => {
      if (ordenacao === 'data_asc') {
        return a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at)
      }
      if (ordenacao === 'valor_desc') {
        return b.amount - a.amount
      }
      if (ordenacao === 'valor_asc') {
        return a.amount - b.amount
      }
      // data_desc padrão
      return b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at)
    })
  }, [transacoes, filtroMembro, filtroTipo, filtroCategoria, busca, ordenacao])

  return (
    <div className="flex flex-col gap-4">
      {/* 1. Barra de Filtros Rápidos (Pills) e Contador */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-border/60">
        <div className="flex flex-wrap items-center gap-2">
          {/* Filtro por Membro */}
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
        <div className="flex items-center gap-2">
          {temFiltroAtivo && (
            <button
              type="button"
              onClick={limparFiltros}
              className="text-xs text-primary font-medium hover:underline flex items-center gap-1"
            >
              <X className="size-3" aria-hidden="true" />
              Limpar filtros
            </button>
          )}
          <span className="text-muted-foreground text-xs font-medium">
            {transacoesFiltradas.length}{' '}
            {transacoesFiltradas.length === 1 ? 'lançamento' : 'lançamentos'}
          </span>
        </div>
      </div>

      {/* 2. Barra de Busca, Categoria e Ordenação */}
      <div className="flex flex-wrap items-center gap-2.5">
        {/* Campo de Busca Rápida (Texto ou Valor) */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
          <Input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar descrição ou valor (ex: Mercado ou 150)..."
            className="h-8 pl-8 pr-7 text-xs rounded-lg border-border/80 bg-muted/30 focus:bg-background"
          />
          {busca && (
            <button
              type="button"
              onClick={() => setBusca('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5"
              aria-label="Limpar busca"
            >
              <X className="size-3" />
            </button>
          )}
        </div>

        {/* Filtro por Categoria */}
        {categoriasPresentes.length > 0 && (
          <div className="w-auto min-w-[140px]">
            <Select value={filtroCategoria} onValueChange={setFiltroCategoria}>
              <SelectTrigger size="sm" className="h-8 text-xs gap-1.5 rounded-lg border-border/80 bg-muted/30">
                <Tag className="size-3 text-muted-foreground shrink-0" />
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as categorias</SelectItem>
                {categoriasPresentes.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Ordenação por Data / Valor */}
        <div className="w-auto min-w-[150px]">
          <Select value={ordenacao} onValueChange={(v) => setOrdenacao(v as TipoOrdenacao)}>
            <SelectTrigger size="sm" className="h-8 text-xs gap-1.5 rounded-lg border-border/80 bg-muted/30">
              <ArrowUpDown className="size-3 text-muted-foreground shrink-0" />
              <SelectValue placeholder="Ordenar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="data_desc">Data: mais recentes</SelectItem>
              <SelectItem value="data_asc">Data: mais antigos</SelectItem>
              <SelectItem value="valor_desc">Valor: maior primeiro</SelectItem>
              <SelectItem value="valor_asc">Valor: menor primeiro</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* 3. Conteúdo da Lista / Tabela */}
      {transacoesFiltradas.length === 0 ? (
        <div className="py-8 text-center flex flex-col items-center justify-center gap-2">
          <p className="text-muted-foreground text-sm">
            Nenhum lançamento encontrado para os filtros selecionados.
          </p>
          {temFiltroAtivo && (
            <button
              type="button"
              onClick={limparFiltros}
              className="text-xs text-primary font-semibold hover:underline"
            >
              Limpar filtros
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Mobile / Tablet (< 1024px): Lista em cartões modernos */}
          <ul className="flex flex-col gap-2.5 lg:hidden animate-in fade-in duration-200">
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
          <div className="animate-in fade-in duration-200">
            <TabelaTransacoesDesktop
              transacoes={transacoesFiltradas}
              nomeConta={(id) => mapaContas[id]}
              nomeCategoria={(id) => (id ? mapaCategorias[id] : null)}
              nomeMembro={(id) => mapaMembros.get(id)}
              idDestacado={idDestacado}
            />
          </div>
        </>
      )}
    </div>
  )
}