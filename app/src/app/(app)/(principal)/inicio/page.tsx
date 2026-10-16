import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import { ChevronLeft, ChevronRight, PieChart } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { hojeEmSaoPaulo, ehMesValido, limitesDoMes, rotuloDoMes, somarMeses } from '@/lib/hoje'
import { ResumoDoMes } from '@/components/inicio/resumo-do-mes'
import { SaldoDasContas } from '@/components/inicio/saldo-das-contas'
import { ListaTransacoesInterativa } from '@/components/transacoes/lista-transacoes-interativa'
import { OuvinteRealtime } from '@/components/inicio/ouvinte-realtime'
import {
  AvisoLancamentoSalvo,
  type LancamentoSalvoResumo,
} from '@/components/inicio/aviso-lancamento-salvo'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EstadoVazio } from '@/components/ui/estado-vazio'
import { INICIO, VAZIO_INICIAL } from '@/features/transacoes/copy'
import { ScrollReveal } from '@/components/ui/scroll-reveal'
import { cn } from '@/lib/utils'

export const metadata: Metadata = { title: INICIO.titulo }

const LIMITE_INICIAL = 20

interface PropsDaPagina {
  searchParams: Promise<{ mes?: string; novo?: string; qtd?: string }>
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function PaginaInicio({ searchParams }: PropsDaPagina) {
  await connection()

  const {
    mes: mesPedido,
    novo: novoPedido,
    qtd: qtdPedida,
  } = await searchParams

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: idDoMembro } = await supabase.rpc('get_user_member_id_self')
  if (!idDoMembro) redirect('/onboarding')

  const mesAtual = hojeEmSaoPaulo().slice(0, 7)
  const mes = ehMesValido(mesPedido) ? mesPedido : mesAtual
  const { inicio, fim } = limitesDoMes(mes)

  const idNovo = novoPedido && UUID.test(novoPedido) ? novoPedido : null
  const qtdNumero = Number.parseInt(qtdPedida ?? '1', 10)
  const qtdSalva =
    Number.isFinite(qtdNumero) && qtdNumero >= 1 && qtdNumero <= 50 ? qtdNumero : 1

  const [resumos, contas, lancamentos, categorias, resFamilia, resMembros, resNovo] = await Promise.all([
    supabase.from('v_monthly_summary').select('*').order('month', { ascending: false }),
    supabase
      .from('v_account_balances')
      .select('*')
      .is('archived_at', null)
      .order('sort_order', { ascending: true }),
    supabase
      .from('transactions')
      .select('*', { count: 'exact' })
      .gte('date', inicio)
      .lte('date', fim)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(0, LIMITE_INICIAL - 1),
    supabase.from('categories').select('id, name'),
    supabase.from('families').select('id').single(),
    supabase.from('family_members').select('id, display_name'),
    idNovo
      ? supabase
          .from('transactions')
          .select('id, description, amount, type, is_paid, date')
          .eq('id', idNovo)
          .maybeSingle()
      : Promise.resolve(null),
  ])

  const linhaNova = resNovo?.data ?? null
  const lancamentoSalvo: LancamentoSalvoResumo | null = linhaNova
    ? {
        descricao: linhaNova.description,
        valor: linhaNova.amount,
        tipo: linhaNova.type,
        pago: linhaNova.is_paid,
        data: linhaNova.date,
      }
    : null

  const familyId = resFamilia.data?.id ?? ''

  const falhouAlgo = Boolean(
    resumos.error || contas.error || lancamentos.error || categorias.error,
  )

  const linhasDeResumo = resumos.data ?? []
  const temHistorico = linhasDeResumo.some((linha) => (linha.tx_count ?? 0) > 0)
  const resumoDoMes = linhasDeResumo.find((linha) => linha.month === mes)

  const listaDeContas = contas.data ?? []
  const mapaContas = Object.fromEntries(
    listaDeContas.map((c) => [c.account_id ?? '', c.name ?? '']),
  )
  const mapaCategorias = Object.fromEntries(
    (categorias.data ?? []).map((c) => [c.id, c.name]),
  )
  const membros = (resMembros.data ?? []).map((m) => ({
    id: m.id,
    display_name: m.display_name,
  }))

  const hrefDoMes = (m: string) => (m === mesAtual ? '/inicio' : `/inicio?mes=${m}`)

  const total = lancamentos.count ?? 0

  const classeNavMes = buttonVariants({ variant: 'outline', size: 'icone-toque' })

  if (!falhouAlgo && !temHistorico) {
    return (
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-[var(--esp-6)] px-[var(--esp-4)] py-[var(--esp-6)]">
        <h1 className="sr-only">{INICIO.titulo}</h1>
        <SaldoDasContas contas={listaDeContas} />
        <Card>
          <CardContent>
            <EstadoVazio
              titulo={VAZIO_INICIAL.titulo}
              descricao={VAZIO_INICIAL.descricao}
              acao={
                <Link
                  href="/lancar"
                  className={buttonVariants({ size: 'toque' })}
                >
                  {VAZIO_INICIAL.acao}
                </Link>
              }
            />
          </CardContent>
        </Card>
      </main>
    )
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6">
      {/* Cabeçalho do Mês */}
      <div className="flex items-center justify-between gap-3">
        <Link
          href={hrefDoMes(somarMeses(mes, -1))}
          aria-label={INICIO.mesAnterior}
          className={classeNavMes}
        >
          <ChevronLeft aria-hidden="true" />
        </Link>
        <h1 className="text-center text-xl sm:text-2xl font-bold tracking-tight first-letter:uppercase">
          {rotuloDoMes(mes)}
        </h1>
        <Link
          href={hrefDoMes(somarMeses(mes, 1))}
          aria-label={INICIO.mesSeguinte}
          className={classeNavMes}
        >
          <ChevronRight aria-hidden="true" />
        </Link>
      </div>

      {idNovo ? (
        <AvisoLancamentoSalvo
          lancamento={lancamentoSalvo}
          quantidade={qtdSalva}
          hrefFechar={hrefDoMes(mes)}
        />
      ) : null}

      {falhouAlgo ? (
        <Alert variant="destructive">
          <AlertDescription>{INICIO.avisoErroDeLeitura}</AlertDescription>
        </Alert>
      ) : null}

      {/* Link de Atalho para Análises */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
          Visão Geral do Mês
        </span>
        <Link
          href={`/analises?mes=${mes}`}
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-2 text-xs')}
        >
          <PieChart className="size-3.5" aria-hidden="true" />
          <span>Ver gráficos & análises</span>
        </Link>
      </div>

      {/* 1. Indicadores do Mês (KPIs) com design modular e expressivo */}
      <ResumoDoMes
        entrou={resumoDoMes?.income_paid ?? 0}
        saiu={resumoDoMes?.expense_paid ?? 0}
        aPagar={resumoDoMes?.payable ?? 0}
        receitasTotal={resumoDoMes?.income_total ?? 0}
        despesasTotal={resumoDoMes?.expense_total ?? 0}
        investimentos={resumoDoMes?.investment_total ?? 0}
        aReceber={resumoDoMes?.receivable ?? 0}
      />

      {/* 2. Saldos das Contas como Cards Visuais */}
      <SaldoDasContas contas={listaDeContas} />

      {/* 3. Lançamentos com Barra de Filtros Interativos (Membros & Tipo) */}
      <ScrollReveal replayOnScroll>
        <Card id="lista-lancamentos" className="w-full min-w-0 scroll-mt-4 shadow-xs border-border/80">
          <CardHeader className="px-3.5 sm:px-6 py-3.5 sm:py-4 border-b border-border/60">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              {INICIO.tituloLancamentos}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 sm:p-6">
            {(lancamentos.data ?? []).length === 0 ? (
              <EstadoVazio
                titulo={INICIO.semLancamentosNoMes}
                descricao={INICIO.semLancamentosNoMesDica}
              />
            ) : (
              <ListaTransacoesInterativa
                transacoes={lancamentos.data ?? []}
                membros={membros}
                mapaContas={mapaContas}
                mapaCategorias={mapaCategorias}
                listaContas={listaDeContas.map((c) => ({ id: c.account_id ?? '', name: c.name ?? '' }))}
                listaCategorias={(categorias.data ?? []).map((c) => ({ id: c.id, name: c.name }))}
                idDestacado={idNovo}
                totalContagem={total}
                mes={mes}
              />
            )}
          </CardContent>
        </Card>
      </ScrollReveal>

      {/* Ouvinte em Tempo Real via Supabase Realtime */}
      {familyId && (
        <OuvinteRealtime
          familyId={familyId}
          mesExibido={mes}
          idsIniciais={(lancamentos.data ?? []).map((t) => t.id)}
          membros={membros}
          meuId={idDoMembro}
        />
      )}
    </main>
  )
}