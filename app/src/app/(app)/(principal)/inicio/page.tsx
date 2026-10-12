import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import { ChevronLeft, ChevronRight, PieChart } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { hojeEmSaoPaulo, ehMesValido, limitesDoMes, rotuloDoMes, somarMeses } from '@/lib/hoje'
import { ResumoDoMes } from '@/components/inicio/resumo-do-mes'
import { SaldoDasContas } from '@/components/inicio/saldo-das-contas'
import { ItemTransacao } from '@/components/transacoes/item-transacao'
import { TabelaTransacoesDesktop } from '@/components/transacoes/tabela-transacoes-desktop'
import { PaginacaoLancamentos } from '@/components/transacoes/paginacao-lancamentos'
import { OuvinteRealtime } from '@/components/inicio/ouvinte-realtime'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EstadoVazio } from '@/components/ui/estado-vazio'
import { INICIO, VAZIO_INICIAL } from '@/features/transacoes/copy'
import { cn } from '@/lib/utils'

export const metadata: Metadata = { title: INICIO.titulo }

const POR_PAGINA = 20

interface PropsDaPagina {
  searchParams: Promise<{ mes?: string; pagina?: string }>
}

/**
 * Início: indicadores do mês, saldo das contas e lista de lançamentos.
 *
 * Server Component. Os dados dependem da sessão do pedido, então a rota é
 * dinâmica; o `loading.tsx` ao lado é a fronteira de <Suspense> que deixa a
 * casca estática e faz streaming do conteúdo. Cada leitura passa pelo RLS do
 * usuário (client com a sessão dele, nunca service_role).
 */
export default async function PaginaInicio({ searchParams }: PropsDaPagina) {
  // Depende da sessão do pedido: declara isso antes de qualquer leitura de
  // relógio (o client do Supabase lê Date.now ao tratar o token). Mesma causa
  // e mesma cura do onboarding.
  await connection()

  const { mes: mesPedido, pagina: paginaPedida } = await searchParams

  const supabase = await createClient()

  // getUser valida o token no servidor de Auth; getSession só leria o cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: idDoMembro } = await supabase.rpc('get_user_member_id_self')
  if (!idDoMembro) redirect('/onboarding')

  const mesAtual = hojeEmSaoPaulo().slice(0, 7)
  const mes = ehMesValido(mesPedido) ? mesPedido : mesAtual
  const { inicio, fim } = limitesDoMes(mes)

  const paginaNumero = Number.parseInt(paginaPedida ?? '1', 10)
  const pagina = Number.isFinite(paginaNumero) && paginaNumero > 0 ? paginaNumero : 1
  const de = (pagina - 1) * POR_PAGINA

  const [resumos, contas, lancamentos, categorias, resFamilia] = await Promise.all([
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
      .range(de, de + POR_PAGINA - 1),
    supabase.from('categories').select('id, name'),
    supabase.from('families').select('id').single(),
  ])

  const familyId = resFamilia.data?.id ?? ''

  const falhouAlgo = Boolean(
    resumos.error || contas.error || lancamentos.error || categorias.error,
  )

  const linhasDeResumo = resumos.data ?? []
  const temHistorico = linhasDeResumo.some((linha) => (linha.tx_count ?? 0) > 0)
  const resumoDoMes = linhasDeResumo.find((linha) => linha.month === mes)

  const listaDeContas = contas.data ?? []
  const nomeDaConta = new Map(
    listaDeContas.map((c) => [c.account_id ?? '', c.name ?? '']),
  )
  const nomeDaCategoria = new Map((categorias.data ?? []).map((c) => [c.id, c.name]))

  const hrefDoMes = (m: string) => (m === mesAtual ? '/inicio' : `/inicio?mes=${m}`)

  // Página além do fim: o PostgREST responde 416 (vira `lancamentos.error`) ou
  // devolve vazio. Em vez de mostrar "página 99 de 1" ou um alerta de erro,
  // volta à primeira página do mês. Sem laço: a primeira página não cai aqui.
  if (pagina > 1 && (lancamentos.error || (lancamentos.data ?? []).length === 0)) {
    redirect(hrefDoMes(mes))
  }

  const total = lancamentos.count ?? 0
  const totalDePaginas = Math.max(1, Math.ceil(total / POR_PAGINA))

  const hrefDaPagina = (p: number) =>
    p === 1 ? hrefDoMes(mes) : `/inicio?mes=${mes}&pagina=${p}`

  const classeNavMes = buttonVariants({ variant: 'outline', size: 'icone-toque' })

  // Casa sem nenhum lançamento: a primeira tela real do produto.
  if (!falhouAlgo && !temHistorico) {
    return (
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-[var(--esp-6)] px-[var(--esp-4)] py-[var(--esp-6)]">
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
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-[var(--esp-6)] px-[var(--esp-4)] py-[var(--esp-6)]">
      <div className="flex items-center justify-between gap-[var(--esp-3)]">
        <Link
          href={hrefDoMes(somarMeses(mes, -1))}
          aria-label={INICIO.mesAnterior}
          className={classeNavMes}
        >
          <ChevronLeft aria-hidden="true" />
        </Link>
        <h1 className="text-center text-[length:var(--texto-titulo)] leading-[var(--texto-titulo-lh)] font-semibold first-letter:uppercase">
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

      {falhouAlgo ? (
        <Alert variant="destructive">
          <AlertDescription>{INICIO.avisoErroDeLeitura}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex items-center justify-between gap-[var(--esp-2)]">
        <span className="text-muted-foreground text-[length:var(--texto-apoio)]">
          Visão geral do mês
        </span>
        <Link
          href={`/analises?mes=${mes}`}
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-[var(--esp-2)]')}
        >
          <PieChart className="size-4" aria-hidden="true" />
          <span>Ver gráficos & análises</span>
        </Link>
      </div>

      <div className="grid gap-[var(--esp-6)] lg:grid-cols-[22rem_1fr] lg:items-start">
        <div className="flex flex-col gap-[var(--esp-6)]">
          <ResumoDoMes
            entrou={resumoDoMes?.income_paid ?? 0}
            saiu={resumoDoMes?.expense_paid ?? 0}
            aPagar={resumoDoMes?.payable ?? 0}
          />
          <SaldoDasContas contas={listaDeContas} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-[length:var(--texto-subtitulo)] leading-[var(--texto-subtitulo-lh)] font-semibold">
              {INICIO.tituloLancamentos}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(lancamentos.data ?? []).length === 0 ? (
              <EstadoVazio
                titulo={INICIO.semLancamentosNoMes}
                descricao={INICIO.semLancamentosNoMesDica}
              />
            ) : (
              <>
                {/* Mobile / Tablet (< 1024px): Lista em cartões */}
                <ul className="divide-border flex flex-col divide-y lg:hidden">
                  {(lancamentos.data ?? []).map((t) => (
                    <ItemTransacao
                      key={t.id}
                      transacao={t}
                      nomeConta={nomeDaConta.get(t.account_id)}
                      nomeCategoria={
                        t.category_id ? nomeDaCategoria.get(t.category_id) : null
                      }
                    />
                  ))}
                </ul>

                {/* Desktop (>= 1024px): Tabela rica de lançamentos */}
                <TabelaTransacoesDesktop
                  transacoes={lancamentos.data ?? []}
                  nomeConta={(id) => nomeDaConta.get(id)}
                  nomeCategoria={(id) => (id ? nomeDaCategoria.get(id) : null)}
                />
              </>
            )}
            <PaginacaoLancamentos
              pagina={pagina}
              totalDePaginas={totalDePaginas}
              hrefDaPagina={hrefDaPagina}
            />
          </CardContent>
        </Card>
      </div>

      {/* Ouvinte em Tempo Real via Supabase Realtime (item 9.8) */}
      {familyId && (
        <OuvinteRealtime
          familyId={familyId}
          mesExibido={mes}
          idsIniciais={(lancamentos.data ?? []).map((t) => t.id)}
        />
      )}
    </main>
  )
}
