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

  const [resumos, categorias, contas, transacoesDoMes, metas] = await Promise.all([
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
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-[var(--esp-6)] px-[var(--esp-4)] py-[var(--esp-6)]">
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

      {/* Grid de Gráficos Principais */}
      <div className="grid gap-[var(--esp-6)] lg:grid-cols-2">
        <GraficoRoscaCategorias itens={itensCategorias} />
        <GraficoPareto itens={itensCategorias} />
      </div>

      {/* Evolução Mensal */}
      <GraficoBarrasMensais historico={historicoMensal} />

      {/* Previsão de fixos e parcelas (próximos 6 meses) */}
      <PrevisaoFixos meses={previsaoMeses} />

      {/* Mapa de Calor e Hábitos */}
      <div className="grid gap-[var(--esp-6)] lg:grid-cols-2">
        <MapaDeCalorDias anoMes={mes} transacoes={transacoes} />
        <div className="flex flex-col justify-between">
          <IndicadoresInteligencia
            totalBeneficios={totalBeneficios}
            totalFuteis={totalFuteis}
            rotulosFuteis={rotulosFuteis}
            metas={metasInfo}
          />
        </div>
      </div>
    </main>
  )
}
