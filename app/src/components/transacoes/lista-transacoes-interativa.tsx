'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowDownLeft,
  ArrowUpDown,
  ArrowUpRight,
  Filter,
  Search,
  Tag,
  X,
  Trash2,
  SlidersHorizontal,
  Check,
  CheckSquare,
  AlertCircle,
  Loader2,
} from 'lucide-react'
import { ItemTransacao } from './item-transacao'
import { TabelaTransacoesDesktop } from './tabela-transacoes-desktop'
import { DialogoExcluirLancamento } from './dialogo-excluir-lancamento'
import { DialogoEditarLancamento } from './dialogo-editar-lancamento'
import { DialogoEditarEmMassa } from './dialogo-editar-em-massa'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { excluirLancamento, carregarMaisLancamentos } from '@/actions/lancamento'
import { hapticFeedback } from '@/lib/haptics'
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
  listaContas?: Array<{ id: string; name: string }>
  listaCategorias?: Array<{ id: string; name: string }>
  idDestacado?: string | null
  totalContagem?: number
  mes?: string
}

type TipoOrdenacao = 'data_desc' | 'data_asc' | 'valor_desc' | 'valor_asc'

export function ListaTransacoesInterativa({
  transacoes,
  membros,
  mapaContas,
  mapaCategorias,
  listaContas,
  listaCategorias,
  idDestacado,
  totalContagem,
  mes,
}: ListaTransacoesInterativaProps) {
  const router = useRouter()

  // Scroll Infinito: estado interno acumulativo dos lançamentos
  const [itens, setItens] = React.useState<Transacao[]>(transacoes)
  const [temMais, setTemMais] = React.useState<boolean>(
    Boolean(totalContagem !== undefined && transacoes.length < totalContagem),
  )
  const [carregandoMais, setCarregandoMais] = React.useState(false)
  const mesAnteriorRef = React.useRef(mes)

  // Sincroniza estado quando as props do servidor mudam (ex: troca de mês ou router.refresh)
  React.useEffect(() => {
    if (mesAnteriorRef.current !== mes) {
      mesAnteriorRef.current = mes
      setItens(transacoes)
      setTemMais(Boolean(totalContagem !== undefined && transacoes.length < totalContagem))
      return
    }

    setItens((anteriores) => {
      if (anteriores.length <= transacoes.length) {
        return transacoes
      }
      const idsDoServidor = new Set(transacoes.map((t) => t.id))
      const cauda = anteriores.slice(transacoes.length).filter((t) => !idsDoServidor.has(t.id))
      return [...transacoes, ...cauda]
    })

    if (totalContagem !== undefined) {
      setTemMais(itens.length < totalContagem)
    }
  }, [transacoes, totalContagem, mes])

  const carregarMais = React.useCallback(async () => {
    if (carregandoMais || !temMais || !mes) return
    setCarregandoMais(true)
    try {
      const res = await carregarMaisLancamentos({
        mes,
        offset: itens.length,
        limite: 20,
      })
      if (res.ok) {
        const novos = res.dados.transacoes
        setItens((anteriores) => {
          const ids = new Set(anteriores.map((t) => t.id))
          const novosUnicos = novos.filter((t) => !ids.has(t.id))
          return [...anteriores, ...novosUnicos]
        })
        setTemMais(res.dados.temMais)
      } else {
        setTemMais(false)
      }
    } catch {
      setTemMais(false)
    } finally {
      setCarregandoMais(false)
    }
  }, [carregandoMais, temMais, mes, itens.length])

  const sentinelaRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const sentinela = sentinelaRef.current
    if (!sentinela || !temMais) return

    const observer = new IntersectionObserver(
      (entries) => {
        const [primeira] = entries
        if (primeira?.isIntersecting) {
          carregarMais()
        }
      },
      {
        root: null,
        rootMargin: '250px',
        threshold: 0.01,
      },
    )

    observer.observe(sentinela)
    return () => observer.disconnect()
  }, [temMais, carregarMais])

  // Filtros
  const [filtroMembro, setFiltroMembro] = React.useState<string>('todos')
  const [filtroTipo, setFiltroTipo] = React.useState<string>('todos')
  const [filtroCategoria, setFiltroCategoria] = React.useState<string>('todas')
  const [busca, setBusca] = React.useState<string>('')
  const [ordenacao, setOrdenacao] = React.useState<TipoOrdenacao>('data_desc')

  // Seleção múltipla
  const [selecionados, setSelecionados] = React.useState<Set<string>>(new Set())
  const [modoSelecaoManual, setModoSelecaoManual] = React.useState(false)
  const modoSelecaoAtivo = modoSelecaoManual || selecionados.size > 0

  // Diálogos de Exclusão
  const [transacaoParaExcluir, setTransacaoParaExcluir] = React.useState<Transacao | null>(null)
  const [modalExcluirMassaAberto, setModalExcluirMassaAberto] = React.useState(false)
  const [pendenteExclusao, setPendenteExclusao] = React.useState(false)

  // Diálogos de Edição
  const [transacaoParaEditar, setTransacaoParaEditar] = React.useState<Transacao | null>(null)
  const [modalEditarMassaAberto, setModalEditarMassaAberto] = React.useState(false)

  // Feedback Toast temporário
  const [mensagemFeedback, setMensagemFeedback] = React.useState<string | null>(null)

  const dispararFeedback = React.useCallback((msg: string) => {
    setMensagemFeedback(msg)
    setTimeout(() => {
      setMensagemFeedback((atual) => (atual === msg ? null : atual))
    }, 4000)
  }, [])

  // Deriva listas de contas e categorias
  const contasDisponiveis = React.useMemo(() => {
    if (listaContas && listaContas.length > 0) return listaContas
    return Object.entries(mapaContas).map(([id, name]) => ({ id, name }))
  }, [listaContas, mapaContas])

  const categoriasDisponiveis = React.useMemo(() => {
    if (listaCategorias && listaCategorias.length > 0) return listaCategorias
    return Object.entries(mapaCategorias).map(([id, name]) => ({ id, name }))
  }, [listaCategorias, mapaCategorias])

  // Identifica se há transferência entre os itens selecionados
  const temTransferenciaNaSelecao = React.useMemo(() => {
    return Array.from(selecionados).some((id) => {
      const t = itens.find((tr) => tr.id === id)
      return t?.type === 'transferencia'
    })
  }, [selecionados, itens])

  // Mapa de id do membro para display_name
  const mapaMembros = React.useMemo(() => {
    return new Map(membros.map((m) => [m.id, m.display_name]))
  }, [membros])

  // Lista de categorias presentes nas transações deste mês
  const categoriasPresentes = React.useMemo(() => {
    const ids = new Set<string>()
    let temSemCategoria = false
    for (const t of itens) {
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
  }, [itens, mapaCategorias])

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

    const filtradas = itens.filter((t) => {
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
  }, [itens, filtroMembro, filtroTipo, filtroCategoria, busca, ordenacao])

  // Lógica de Seleção Múltipla
  const alternarSelecao = React.useCallback((id: string) => {
    hapticFeedback.selection()
    setSelecionados((antigos) => {
      const novos = new Set(antigos)
      if (novos.has(id)) {
        novos.delete(id)
      } else {
        novos.add(id)
      }
      return novos
    })
  }, [])

  const todosFiltradosSelecionados =
    transacoesFiltradas.length > 0 &&
    transacoesFiltradas.every((t) => selecionados.has(t.id))

  const alternarTodos = React.useCallback(() => {
    hapticFeedback.medium()
    if (todosFiltradosSelecionados) {
      setSelecionados(new Set())
    } else {
      setSelecionados(new Set(transacoesFiltradas.map((t) => t.id)))
    }
  }, [todosFiltradosSelecionados, transacoesFiltradas])

  const desmarcarTodos = React.useCallback(() => {
    setSelecionados(new Set())
    setModoSelecaoManual(false)
  }, [])

  // Ações de Exclusão
  const confirmarExclusaoIndividual = async (escopo: 'single' | 'series') => {
    if (!transacaoParaExcluir) return
    setPendenteExclusao(true)

    const res = await excluirLancamento(transacaoParaExcluir.id, escopo)
    setPendenteExclusao(false)

    if (res.ok) {
      dispararFeedback(
        escopo === 'series'
          ? 'Série de lançamentos excluída com sucesso.'
          : 'Lançamento excluído com sucesso.',
      )
      setItens((anteriores) => anteriores.filter((t) => t.id !== transacaoParaExcluir.id))
      setSelecionados((antigos) => {
        const novos = new Set(antigos)
        novos.delete(transacaoParaExcluir.id)
        return novos
      })
      setTransacaoParaExcluir(null)
      router.refresh()
    } else {
      dispararFeedback(res.erro || 'Erro ao excluir lançamento.')
    }
  }

  const confirmarExclusaoEmMassa = async () => {
    if (selecionados.size === 0) return
    setPendenteExclusao(true)

    const ids = Array.from(selecionados)
    let excluidosContador = 0

    // Executa exclusão individual de cada selecionado via Server Action
    await Promise.all(
      ids.map(async (id) => {
        const res = await excluirLancamento(id, 'single')
        if (res.ok) excluidosContador++
      }),
    )

    const idSet = new Set(ids)
    setItens((anteriores) => anteriores.filter((t) => !idSet.has(t.id)))
    setPendenteExclusao(false)
    setModalExcluirMassaAberto(false)
    setSelecionados(new Set())

    dispararFeedback(`${excluidosContador} lançamentos excluídos com sucesso.`)
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-4 relative">
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
            {totalContagem && totalContagem > transacoesFiltradas.length && !temFiltroAtivo
              ? `${transacoesFiltradas.length} de ${totalContagem} lançamentos`
              : `${transacoesFiltradas.length} ${transacoesFiltradas.length === 1 ? 'lançamento' : 'lançamentos'}`}
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

        {/* Botão de Modo de Seleção / Seleção em Massa (PCs, Tablets, Notebooks e Mobile) */}
        <Button
          type="button"
          variant={modoSelecaoAtivo ? 'default' : 'outline'}
          size="sm"
          onClick={() => {
            hapticFeedback.light()
            if (modoSelecaoAtivo) {
              setModoSelecaoManual(false)
              setSelecionados(new Set())
            } else {
              setModoSelecaoManual(true)
            }
          }}
          className={cn(
            'h-8 text-xs gap-1.5 rounded-lg shrink-0 transition-colors',
            modoSelecaoAtivo
              ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
              : 'border-border/80 bg-muted/30 hover:bg-muted/60 text-muted-foreground hover:text-foreground',
          )}
        >
          <CheckSquare className="size-3.5" />
          <span>{modoSelecaoAtivo ? 'Concluir seleção' : 'Selecionar'}</span>
        </Button>

        {modoSelecaoAtivo && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={alternarTodos}
            className="h-8 text-xs gap-1.5 rounded-lg text-primary hover:bg-primary/10 font-medium shrink-0"
          >
            <span>{todosFiltradosSelecionados ? 'Desmarcar todos' : 'Selecionar todos'}</span>
          </Button>
        )}
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
          {/* Mobile / Tablet (< 1024px): Lista em cartões modernos com scroll reveal item a item */}
          <ul className="flex flex-col gap-2.5 lg:hidden">
            {transacoesFiltradas.map((t, idx) => (
              <ItemTransacao
                key={t.id}
                transacao={t}
                indice={idx}
                nomeConta={mapaContas[t.account_id]}
                nomeCategoria={t.category_id ? mapaCategorias[t.category_id] : null}
                nomeMembro={mapaMembros.get(t.paid_by_member_id)}
                destacado={t.id === idDestacado}
                selecionado={selecionados.has(t.id)}
                modoSelecao={modoSelecaoAtivo}
                aoAlternarSelecao={alternarSelecao}
                aoIniciarSelecao={(id) => {
                  hapticFeedback.medium()
                  setSelecionados(new Set([id]))
                  setModoSelecaoManual(true)
                }}
                aoEditar={(item) => setTransacaoParaEditar(item)}
                aoExcluir={(item) => setTransacaoParaExcluir(item)}
              />
            ))}
          </ul>

          {/* Desktop (>= 1024px): Tabela rica de lançamentos */}
          <div className="hidden lg:block animate-in fade-in duration-200">
            <TabelaTransacoesDesktop
              transacoes={transacoesFiltradas}
              nomeConta={(id) => mapaContas[id]}
              nomeCategoria={(id) => (id ? mapaCategorias[id] : null)}
              nomeMembro={(id) => mapaMembros.get(id)}
              idDestacado={idDestacado}
              selecionados={selecionados}
              aoAlternarSelecao={alternarSelecao}
              aoAlternarTodos={alternarTodos}
              todosSelecionados={todosFiltradosSelecionados}
              aoEditar={(item) => setTransacaoParaEditar(item)}
              aoExcluir={(item) => setTransacaoParaExcluir(item)}
            />
          </div>

          {/* Sentinela de Scroll Infinito e Indicadores */}
          <div className="w-full flex flex-col items-center justify-center">
            {temMais && (
              <div
                ref={sentinelaRef}
                className="h-10 w-full pointer-events-none opacity-0"
                aria-hidden="true"
              />
            )}

            {carregandoMais && (
              <div
                role="status"
                aria-live="polite"
                className="flex items-center justify-center gap-2.5 py-4 text-muted-foreground animate-in fade-in duration-200"
              >
                <Loader2 className="size-4 animate-spin text-primary" aria-hidden="true" />
                <span className="text-xs font-medium">Carregando mais lançamentos...</span>
              </div>
            )}

            {!temMais && itens.length > 0 && totalContagem && totalContagem > 15 && (
              <div className="flex items-center justify-center gap-2.5 py-5 text-muted-foreground/60 select-none">
                <span className="h-px w-8 sm:w-12 bg-border/60" />
                <span className="text-[11px] font-medium tracking-wide uppercase">
                  Todos os {itens.length} lançamentos exibidos
                </span>
                <span className="h-px w-8 sm:w-12 bg-border/60" />
              </div>
            )}
          </div>
        </>
      )}

      {/* 4. Barra Flutuante de Ações em Massa (Aparece quando >= 1 item selecionado) */}
      {selecionados.size > 0 && (
        <div className="fixed bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 sm:gap-3 bg-card/95 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-border shadow-xl animate-in fade-in slide-in-from-bottom-4 duration-200">
          <div className="flex items-center gap-1.5 pr-2 border-r border-border/80">
            <span className="flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-[11px] font-bold">
              {selecionados.size}
            </span>
            <span className="text-xs font-semibold text-foreground hidden sm:inline">
              {selecionados.size === 1 ? 'selecionado' : 'selecionados'}
            </span>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              hapticFeedback.light()
              setModalEditarMassaAberto(true)
            }}
            className="h-8 gap-1.5 text-xs rounded-xl"
          >
            <SlidersHorizontal className="size-3.5" />
            <span>Editar lote</span>
          </Button>

          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => {
              hapticFeedback.warning()
              setModalExcluirMassaAberto(true)
            }}
            className="h-8 gap-1.5 text-xs rounded-xl"
          >
            <Trash2 className="size-3.5" />
            <span>Excluir</span>
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => {
              hapticFeedback.selection()
              desmarcarTodos()
            }}
            className="h-8 w-8 text-muted-foreground hover:text-foreground rounded-xl"
            title="Desmarcar todos"
            aria-label="Desmarcar todos"
          >
            <X className="size-4" />
          </Button>
        </div>
      )}

      {/* 5. Modal de Exclusão Individual */}
      <DialogoExcluirLancamento
        aberto={Boolean(transacaoParaExcluir)}
        onOpenChange={(aberto) => {
          if (!aberto) setTransacaoParaExcluir(null)
        }}
        transacao={transacaoParaExcluir}
        nomeConta={transacaoParaExcluir ? mapaContas[transacaoParaExcluir.account_id] : null}
        nomeCategoria={
          transacaoParaExcluir?.category_id
            ? mapaCategorias[transacaoParaExcluir.category_id]
            : null
        }
        aoConfirmar={confirmarExclusaoIndividual}
        pendente={pendenteExclusao}
      />

      {/* 6. Modal de Exclusão em Massa */}
      <DialogoExcluirLancamento
        aberto={modalExcluirMassaAberto}
        onOpenChange={setModalExcluirMassaAberto}
        quantidadeEmMassa={selecionados.size}
        aoConfirmar={confirmarExclusaoEmMassa}
        pendente={pendenteExclusao}
      />

      {/* 7. Modal de Edição Individual */}
      <DialogoEditarLancamento
        aberto={Boolean(transacaoParaEditar)}
        onOpenChange={(aberto) => {
          if (!aberto) setTransacaoParaEditar(null)
        }}
        transacao={transacaoParaEditar}
        contas={contasDisponiveis}
        categorias={categoriasDisponiveis}
        membros={membros}
        onSalvo={() => {
          dispararFeedback('Lançamento atualizado com sucesso.')
        }}
      />

      {/* 8. Modal de Edição em Massa */}
      <DialogoEditarEmMassa
        aberto={modalEditarMassaAberto}
        onOpenChange={setModalEditarMassaAberto}
        idsSelecionados={Array.from(selecionados)}
        contas={contasDisponiveis}
        categorias={categoriasDisponiveis}
        membros={membros}
        temTransferenciaNaSelecao={temTransferenciaNaSelecao}
        onSalvo={(atualizados, total) => {
          if (atualizados === total) {
            dispararFeedback(
              `${total === 1 ? '1 lançamento atualizado' : `${total} lançamentos atualizados`} com sucesso.`,
            )
          } else {
            dispararFeedback(
              `${atualizados} de ${total} lançamentos foram atualizados com sucesso.`,
            )
          }
          setSelecionados(new Set())
        }}
      />

      {/* 9. Feedback Toast Inline */}
      {mensagemFeedback && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-20 right-4 z-50 flex items-center gap-2.5 rounded-xl border border-border/80 bg-card px-4 py-3 shadow-lg text-xs font-medium text-foreground animate-in fade-in slide-in-from-bottom-3 duration-200"
        >
          <div className="flex size-5 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <Check className="size-3.5" />
          </div>
          <span>{mensagemFeedback}</span>
          <button
            type="button"
            onClick={() => setMensagemFeedback(null)}
            className="ml-2 text-muted-foreground hover:text-foreground"
            aria-label="Fechar aviso"
          >
            <X className="size-3" />
          </button>
        </div>
      )}
    </div>
  )
}