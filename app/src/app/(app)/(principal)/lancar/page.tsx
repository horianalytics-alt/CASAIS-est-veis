import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import { FormLancamento } from '@/components/transacoes/form-lancamento'
import { ScrollReveal } from '@/components/ui/scroll-reveal'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { buttonVariants } from '@/components/ui/button'
import { EstadoVazio } from '@/components/ui/estado-vazio'
import { LANCAR } from '@/features/transacoes/copy'
import { hojeEmSaoPaulo } from '@/lib/hoje'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: LANCAR.titulo }

/**
 * Novo lançamento (receita ou despesa simples).
 *
 * Server Component: lê contas e categorias com a sessão do usuário (RLS) e
 * entrega ao formulário só objetos planos. O `loading.tsx` ao lado é a
 * fronteira de <Suspense> que mantém a casca estática.
 */
export default async function PaginaLancar() {
  // Mesma razão do início: dependência de request declarada antes do relógio.
  await connection()

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: idDoMembro } = await supabase.rpc('get_user_member_id_self')
  if (!idDoMembro) redirect('/onboarding')

  const [contas, categorias, grupos, membros, formasDePagamento] = await Promise.all([
    supabase
      .from('accounts')
      .select('id, name, type, closing_day, due_day')
      .is('archived_at', null)
      .order('sort_order', { ascending: true }),
    supabase
      .from('categories')
      .select('id, name, type, group_id')
      .is('archived_at', null)
      .order('sort_order', { ascending: true }),
    supabase
      .from('category_groups')
      .select('id, name, sort_order')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),
    supabase
      .from('family_members')
      .select('id, display_name')
      .order('display_name', { ascending: true }),
    supabase
      .from('payment_methods')
      .select('id, name')
      .is('archived_at', null)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),
  ])

  const listaDeContas = (contas.data ?? [])
    .filter((c) => c.type !== 'investimento')
    .map((c) => ({
      id: c.id,
      nome: c.name,
      tipo: c.type,
      closing_day: c.closing_day,
      due_day: c.due_day,
    }))
  const listaDeCategorias = (categorias.data ?? []).map((c) => ({
    id: c.id,
    nome: c.name,
    tipo: c.type,
    grupoId: c.group_id,
  }))
  const listaDeGrupos = (grupos.data ?? []).map((g) => ({
    id: g.id,
    nome: g.name,
  }))
  const listaDeMembros = (membros.data ?? []).map((m) => ({
    id: m.id,
    nome: m.display_name,
  }))
  const listaDeFormas = (formasDePagamento.data ?? []).map((f) => ({
    id: f.id,
    nome: f.name,
  }))

  return (
    <main className="mx-auto flex w-full max-w-[32rem] flex-1 flex-col gap-[var(--esp-6)] px-[var(--esp-4)] py-[var(--esp-6)]">
      <h1 className="text-[length:var(--texto-titulo)] leading-[var(--texto-titulo-lh)] font-semibold">
        {LANCAR.titulo}
      </h1>

      {contas.error ? (
        <Alert variant="destructive">
          <AlertDescription>{LANCAR.erroDeLeitura}</AlertDescription>
        </Alert>
      ) : listaDeContas.length === 0 ? (
        // Não deixa o formulário inválido de propósito: sem conta, salvar sempre falharia.
        <EstadoVazio
          titulo={LANCAR.semContasTitulo}
          descricao={LANCAR.semContasDescricao}
          acao={
            <Link href="/inicio" className={buttonVariants({ variant: 'outline', size: 'toque' })}>
              {LANCAR.voltarAoInicio}
            </Link>
          }
        />
      ) : (
        <ScrollReveal triggerOnce={false} replayOnScroll>
          <FormLancamento
            contas={listaDeContas}
            categorias={listaDeCategorias}
            grupos={listaDeGrupos}
            membros={listaDeMembros}
            membroAtualId={idDoMembro ?? undefined}
            formasDePagamento={listaDeFormas}
            hoje={hojeEmSaoPaulo()}
          />
        </ScrollReveal>
      )}
    </main>
  )
}
