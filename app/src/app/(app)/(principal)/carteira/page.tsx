import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import Link from 'next/link'
import { Plus, Archive, Wallet } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { CartaoConta } from '@/components/carteira/cartao-conta'
import { SecaoFaturas } from '@/components/carteira/secao-faturas'
import { ValorSaldo } from '@/components/financeiro/valor-saldo'
import { ValorMonetario } from '@/components/financeiro/valor-monetario'
import { Button } from '@/components/ui/button'
import { EstadoVazio } from '@/components/ui/estado-vazio'
import { CARTEIRA } from '@/features/carteira/copy'
import { getInvoicePeriod } from '@/lib/invoice'
import { todayISO } from '@/lib/format'
import type { Database } from '@/types/database'

export const metadata: Metadata = {
  title: CARTEIRA.titulo,
  description: CARTEIRA.subtitulo,
}

type SaldoConta = Database['public']['Views']['v_account_balances']['Row']
type Fatura = Database['public']['Views']['v_invoices']['Row']

interface PaginaCarteiraProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function PaginaCarteira({ searchParams }: PaginaCarteiraProps) {
  await connection()

  const params = await searchParams
  const mostrarArquivadas = params.arquivadas === '1'

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: memberId } = await supabase.rpc('get_user_member_id_self')
  if (!memberId) redirect('/onboarding')

  // Busca saldos e faturas em paralelo
  const [resContas, resFaturas] = await Promise.all([
    supabase
      .from('v_account_balances')
      .select('*')
      .order('sort_order', { ascending: true }),
    supabase
      .from('v_invoices')
      .select('*')
      .order('invoice_year', { ascending: false })
      .order('invoice_month', { ascending: false }),
  ])

  const contas = (resContas.data ?? []) as SaldoConta[]
  const faturas = (resFaturas.data ?? []) as Fatura[]

  const contasAtivas = contas.filter((c) => !c.archived_at)
  const contasArquivadas = contas.filter((c) => Boolean(c.archived_at))

  // Contas disponíveis como origem de pagamento (não-cartões ativas)
  const contasOrigem = contasAtivas
    .filter((c) => c.type !== 'cartao' && c.account_id)
    .map((c) => ({
      id: c.account_id!,
      name: c.name,
      current_balance: c.current_balance,
    }))

  // D-1: Fatura do ciclo corrente por cartão (baseado na data de fechamento e data de hoje)
  const hoje = todayISO()
  const faturasCorrentesPorConta = new Map<string, Fatura>()
  for (const conta of contas) {
    if (conta.type === 'cartao' && conta.account_id && conta.closing_day) {
      const periodo = getInvoicePeriod(hoje, conta.closing_day)
      const fatura = faturas.find(
        (f) =>
          f.account_id === conta.account_id &&
          f.invoice_year === periodo.year &&
          f.invoice_month === periodo.month,
      )
      if (fatura) {
        faturasCorrentesPorConta.set(conta.account_id, fatura)
      }
    }
  }

  // Fatura aberta mais recente por cartão (para exibir no cartão correspondente se não houver corrente)
  const faturasAbertasPorConta = new Map<string, Fatura>()
  for (const fatura of faturas) {
    if (fatura.account_id && (fatura.open_amount ?? 0) > 0 && !faturasAbertasPorConta.has(fatura.account_id)) {
      faturasAbertasPorConta.set(fatura.account_id, fatura)
    }
  }

  // Cálculos do resumo patrimonial das contas ativas (exclui cartão do saldo total em conta)
  const contasBancarias = contasAtivas.filter((c) => c.type !== 'cartao')
  const totalSaldoAtivo = contasBancarias.reduce(
    (acc, c) => acc + (c.current_balance ?? 0),
    0,
  )
  const totalPendenteInflow = contasBancarias.reduce(
    (acc, c) => acc + (c.pending_inflow ?? 0),
    0,
  )
  const totalPendenteOutflow = contasBancarias.reduce(
    (acc, c) => acc + (c.pending_outflow ?? 0),
    0,
  )
  const totalSaldoPrevisto = totalSaldoAtivo + totalPendenteInflow - totalPendenteOutflow

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6">
      {/* Cabeçalho da Carteira */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-foreground text-2xl font-bold tracking-tight">
            {CARTEIRA.titulo}
          </h1>
          <p className="text-muted-foreground text-sm">
            {CARTEIRA.subtitulo}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {contasArquivadas.length > 0 && (
            <Button
              asChild
              variant="outline"
              size="toque"
              className="gap-2"
            >
              <Link
                href={
                  mostrarArquivadas
                    ? '/carteira'
                    : '/carteira?arquivadas=1'
                }
              >
                <Archive className="size-4" aria-hidden="true" />
                {mostrarArquivadas
                  ? CARTEIRA.ocultarArquivadas
                  : CARTEIRA.mostrarArquivadas}
              </Link>
            </Button>
          )}

          <Button asChild variant="default" size="toque" className="gap-2">
            <Link href="/lancar">
              <Plus className="size-4" aria-hidden="true" />
              Lançar
            </Link>
          </Button>
        </div>
      </div>

      {/* Resumo Patrimonial em Destaque */}
      <section
        aria-label="Resumo patrimonial das contas"
        className="bg-card border-border/80 flex flex-col gap-3 rounded-2xl border p-5 shadow-xs sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex flex-col">
          <span className="text-muted-foreground text-xs font-medium">
            {CARTEIRA.saldoTotal}
          </span>
          <div className="mt-1">
            <ValorSaldo valor={totalSaldoAtivo} tamanho="heroi" />
          </div>
          <span className="text-muted-foreground text-xs">
            {CARTEIRA.apoioSaldoTotal}
          </span>
        </div>

        {(totalPendenteInflow > 0 || totalPendenteOutflow > 0) && (
          <div className="border-border/60 flex flex-col gap-1 border-t pt-3 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-5">
            <span className="text-muted-foreground text-xs font-medium">
              {CARTEIRA.saldoPrevistoTotal}
            </span>
            <ValorSaldo valor={totalSaldoPrevisto} tamanho="destaque" />
            <div className="text-muted-foreground flex items-center gap-2 text-xs">
              {totalPendenteInflow > 0 && (
                <ValorMonetario valor={totalPendenteInflow} tipo="receita" pago={false} />
              )}
              {totalPendenteOutflow > 0 && (
                <ValorMonetario valor={totalPendenteOutflow} tipo="despesa" pago={false} />
              )}
            </div>
          </div>
        )}
      </section>

      {/* Grade de Cartões de Conta */}
      <section aria-labelledby="titulo-contas" className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2
            id="titulo-contas"
            className="text-foreground text-lg font-semibold"
          >
            {mostrarArquivadas ? CARTEIRA.contasArquivadas : CARTEIRA.contasAtivas}
          </h2>
          <span className="text-muted-foreground text-xs">
            {(mostrarArquivadas ? contasArquivadas : contasAtivas).length} contas
          </span>
        </div>

        {(mostrarArquivadas ? contasArquivadas : contasAtivas).length === 0 ? (
          <EstadoVazio
            titulo={CARTEIRA.semContas}
            descricao={CARTEIRA.semContasDica}
            acao={
              <Button asChild size="toque">
                <Link href="/lancar">
                  <Wallet className="size-4" aria-hidden="true" />
                  Lançar despesa ou receita
                </Link>
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {(mostrarArquivadas ? contasArquivadas : contasAtivas).map((conta) => (
              <CartaoConta
                key={conta.account_id ?? conta.name}
                conta={conta}
                faturaAtual={
                  conta.account_id
                    ? faturasCorrentesPorConta.get(conta.account_id)
                    : null
                }
                faturaAberta={
                  conta.account_id
                    ? faturasAbertasPorConta.get(conta.account_id)
                    : null
                }
                contasOrigem={contasOrigem}
              />
            ))}
          </div>
        )}
      </section>

      {/* Seção de Faturas de Cartão */}
      <SecaoFaturas faturas={faturas} contasOrigem={contasOrigem} />
    </main>
  )
}
