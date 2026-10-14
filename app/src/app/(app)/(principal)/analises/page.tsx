import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import { ChevronLeft, ChevronRight, LayoutDashboard } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { hojeEmSaoPaulo, ehMesValido, limitesDoMes, rotuloDoMes, somarMeses } from '@/lib/hoje'
import { buttonVariants } from '@/components/ui/button'
import { ANALISES } from '@/features/analises/copy'
import { GraficoRoscaCategorias } from '@/components/analises/grafico-rosca-categorias'
import { GraficoBarrasMensais } from '@/components/analises/grafico-barras-mensais'
import { GraficoPareto } from '@/components/analises/grafico-pareto'
import { MapaDeCalorDias } from '@/components/analises/mapa-de-calor-dias'
import { IndicadoresInteligencia } from '@/components/analises/indicadores-inteligencia'
import { BotaoExportarCsv } from '@/components/analises/botao-exportar-csv'
import { PrevisaoFixos } from '@/components/analises/previsao-fixos'
import { GraficoOrcamento } from '@/components/analises/grafico-orcamento'
import { GraficoPatrimonio } from '@/components/analises/grafico-patrimonio'
import { SimuladorFutil } from '@/components/analises/simulador-futil'

export const metadata: Metadata = { title: ANALISES.titulo }

interface PropsDaPagina {
  searchParams: Promise<{ mes?: string }>
}

export default async function PaginaAnalises({ searchParams }: PropsDaPagina) {
  await connection()

  const { mes: mesPedido } = await searchParams

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

  const [resumos, categorias, contas, transacoesDoMes, metas, orcamentos, patrimonio] = await Promise.all([
    supabase
      .from('v_monthly_summary')
      .select('*')
      .order('month', { ascending: true }),
    supabase.from('categories').select('id, name'),
    supabase.from('accounts').select('id, name').is('archived_at', null),
    supabase
      .from('transactions')
      .select('id, date, amount, type, description, account_id, category_id, is_paid, is_benefit, is_futile, futile_label')
      .gte('date', inicio)
      .lte('date', fim)
      .order('date', { ascending: false }),
    supabase
      .from('account_goals')
      .select('account_id, amount'),
    // Onda 2 (Dash). RLS das views (security_invoker) resolve a família; o mês
    // é o da página, que vem de hojeEmSaoPaulo() — a view não filtra mês (UTC).
    supabase
      .from('v_orcamento_progresso')
      .select('budget_id, category_name, category_archived_at, budget_amount, spent_amount, remaining_amount, used_ratio, tx_count')
      .eq('month', mes),
    // Até o mês selecionado: um paid_date futuro nunca aparece como "agora".
    supabase
      .from('v_patrimonio_mensal')
      .select('month, net_change, total_balance')
      .lte('month', mes)
      .order('month', { ascending: false })
      .limit(12),
  ])

  const listaCategorias = categorias.data ?? []
  const mapaCategorias = new Map(listaCategorias.map((c) => [c.id, c.name]))

  const listaContas = contas.data ?? []
  const mapaContas = new Map(listaContas.map((c) => [c.id, c.name]))

  const transacoes = transacoesDoMes.data ?? []

  // 1. Agregação por categoria para a Rosca e Pareto
  const gastosPorCategoriaMap = new Map<string, number>()
  for (const t of transacoes) {
    if (t.type === 'despesa') {
      const nomeCat = t.category_id ? mapaCategorias.get(t.category_id) ?? 'Sem categoria' : 'Sem categoria'
      gastosPorCategoriaMap.set(nomeCat, (gastosPorCategoriaMap.get(nomeCat) ?? 0) + Number(t.amount))
    }
  }

  const itensCategorias = Array.from(gastosPorCategoriaMap.entries()).map(([nome, valor], idx) => ({
    id: `cat-${idx}`,
    nome,
    valor,
  }))

  // 2. Histórico para barras mensais (até o mês consultado) e Previsão dos próximos 6 meses
  const listaResumos = resumos.data ?? []
  const mapaResumos = new Map(listaResumos.map((r) => [r.month ?? '', r]))

  const historicoMensal = listaResumos
    .filter((r) => (r.month ?? '') <= mes)
    .map((r) => ({
      mes: r.month ?? '',
      receitas: Number(r.income_paid ?? 0),
      despesas: Number(r.expense_paid ?? 0),
    }))

  const previsaoMeses = [0, 1, 2, 3, 4, 5].map((offset) => {
    const m = somarMeses(mesAtual, offset)
    const r = mapaResumos.get(m)
    return {
      mes: m,
      rotulo: rotuloDoMes(m),
      ehMesAtual: m === mesAtual,
      aPagar: Number(r?.payable ?? 0),
      jaPago: Number(r?.expense_paid ?? 0),
      aReceber: Number(r?.receivable ?? 0),
    }
  })

  // 3. Inteligência: Benefícios e Fúteis
  let totalBeneficios = 0
  let totalFuteis = 0
  const rotulosFuteisMap = new Map<string, number>()

  for (const t of transacoes) {
    if (t.is_benefit) {
      totalBeneficios += Number(t.amount)
    }
    if (t.is_futile) {
      totalFuteis += Number(t.amount)
      const label = t.futile_label || 'Outros'
      rotulosFuteisMap.set(label, (rotulosFuteisMap.get(label) ?? 0) + Number(t.amount))
    }
  }

  // Mesmo conjunto de totalFuteis, somado em centavos inteiros (sem resíduo de
  // float) — é o valor de partida sugerido ao simulador.
  const futilDoMesCentavos = transacoes.reduce(
    (soma, t) => (t.is_futile ? soma + Math.round(Number(t.amount) * 100) : soma),
    0,
  )

  // Momento do dado (página dinâmica: render = leitura), no fuso do casal.
  const atualizadoEm = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date())

  const rotulosFuteis = Array.from(rotulosFuteisMap.entries())
    .map(([rotulo, total]) => ({ rotulo, total }))
    .sort((a, b) => b.total - a.total)

  // 4. Metas por conta
  const metasInfo = (metas.data ?? []).map((m) => ({
    contaNome: mapaContas.get(m.account_id) ?? 'Conta',
    saldoAtual: 0, // Saldo inicial/atual
    meta: Number(m.amount),
  }))

  // 5. Dados para Exportação CSV
  const transacoesExportaveis = transacoes.map((t) => ({
    data: t.date,
    descricao: t.description,
    valor: Number(t.amount),
    tipo: t.type,
    conta: mapaContas.get(t.account_id) ?? 'Conta',
    categoria: t.category_id ? mapaCategorias.get(t.category_id) : undefined,
    estaPago: t.is_paid,
  }))

  const hrefDoMes = (m: string) => `/analises?mes=${m}`
  const classeNavMes = buttonVariants({ variant: 'outline', size: 'icone-toque' })

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-[var(--esp-6)] px-[var(--esp-4)] py-[var(--esp-6)]">
      {/* Top Header */}
      <div className="flex flex-col gap-[var(--esp-3)] sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-[var(--esp-2)]">
          <Link
            href={`/inicio?mes=${mes}`}
            className={buttonVariants({ variant: 'ghost', size: 'sm' })}
          >
            <LayoutDashboard className="size-4" aria-hidden="true" />
            <span>Voltar ao início</span>
          </Link>
        </div>

        <div className="flex items-center justify-between gap-[var(--esp-3)]">
          <Link
            href={hrefDoMes(somarMeses(mes, -1))}
            aria-label="Mês anterior"
            className={classeNavMes}
          >
            <ChevronLeft aria-hidden="true" />
          </Link>
          <h1 className="text-center text-[length:var(--texto-titulo)] leading-[var(--texto-titulo-lh)] font-semibold first-letter:uppercase">
            {rotuloDoMes(mes)}
          </h1>
          <Link
            href={hrefDoMes(somarMeses(mes, 1))}
            aria-label="Próximo mês"
            className={classeNavMes}
          >
            <ChevronRight aria-hidden="true" />
          </Link>
        </div>

        <BotaoExportarCsv anoMes={mes} transacoes={transacoesExportaveis} />
      </div>

      {/* Orçamento do mês (Dash, PLANO.md 8.1): barra horizontal + marcador de meta */}
      <GraficoOrcamento
        linhas={orcamentos.data ?? []}
        erro={orcamentos.error !== null}
        mesRotulo={rotuloDoMes(mes)}
        emAndamento={mes === mesAtual}
        atualizadoEm={atualizadoEm}
      />

      {/* Grid de Gráficos Principais */}
      <div className="grid gap-[var(--esp-6)] xl:grid-cols-2">
        <GraficoRoscaCategorias itens={itensCategorias} />
        <GraficoPareto itens={itensCategorias} />
      </div>

      {/* Evolução Mensal */}
      <GraficoBarrasMensais historico={historicoMensal} />

      {/* Patrimônio (Dash, PLANO.md 8.2): linha, eixo único */}
      <GraficoPatrimonio
        linhas={patrimonio.data ?? []}
        erro={patrimonio.error !== null}
        mes={mes}
        mesAtual={mesAtual}
        atualizadoEm={atualizadoEm}
      />

      {/* Previsão de fixos e parcelas (próximos 6 meses) */}
      <PrevisaoFixos meses={previsaoMeses} />

      {/* Indicadores de Inteligência Financeira: Benefícios, Supérfluos e Metas */}
      <IndicadoresInteligencia
        totalBeneficios={totalBeneficios}
        totalFuteis={totalFuteis}
        rotulosFuteis={rotulosFuteis}
        metas={metasInfo}
      />

      {/* Simulador de gasto fútil (Dash, PLANO.md 8.3): stat + linha, eixo único */}
      <SimuladorFutil futilDoMesCentavos={futilDoMesCentavos} mesRotulo={rotuloDoMes(mes)} />

      {/* Mapa de Calor: Dias de Maior Gasto */}
      <MapaDeCalorDias anoMes={mes} transacoes={transacoes} />
    </main>
  )
}
