import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveTransfer, type SettlementBalance } from '@/lib/settlement'
import { buscarTransacoesAcerto, mapearRegistrosAcerto } from '@/lib/queries/acerto'
import { ResumoAcerto } from '@/components/acerto/resumo-acerto'
import { ScrollReveal } from '@/components/ui/scroll-reveal'
import { ACERTO } from '@/features/acerto/copy'
import type { Database } from '@/types/database'

export const metadata: Metadata = {
  title: ACERTO.titulo,
  description: ACERTO.subtitulo,
}

type LinhaAcerto = Database['public']['Views']['v_settlement']['Row']

export default async function PaginaAcerto() {
  await connection()

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: memberId } = await supabase.rpc('get_user_member_id_self')
  if (!memberId) redirect('/onboarding')

  // Busca dados de acerto, regra da família, membros e histórico em paralelo
  const [resAcerto, resFamilia, resMembros, transacoesAcerto] = await Promise.all([
    supabase.from('v_settlement').select('*'),
    supabase.from('families').select('split_rule, name').single(),
    supabase.from('family_members').select('id, display_name'),
    buscarTransacoesAcerto(supabase),
  ])

  const linhas = (resAcerto.data ?? []) as LinhaAcerto[]
  const regra = resFamilia.data?.split_rule ?? 'equal'

  const mapaNomes = new Map<string, string>()
  for (const m of resMembros.data ?? []) {
    if (m.id && m.display_name) mapaNomes.set(m.id, m.display_name)
  }
  for (const l of linhas) {
    if (l.member_id && l.display_name && !mapaNomes.has(l.member_id)) {
      mapaNomes.set(l.member_id, l.display_name)
    }
  }

  const historico = mapearRegistrosAcerto(transacoesAcerto, mapaNomes)

  // Transforma para o formato esperado pelo algoritmo testado em settlement.ts
  const saldosParaResolver: SettlementBalance[] = linhas
    .filter((l) => Boolean(l.member_id))
    .map((l) => ({
      member_id: l.member_id!,
      balance: l.balance ?? 0,
    }))

  const transferencia = resolveTransfer(saldosParaResolver)

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-6">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-1">
        <h1 className="text-foreground text-2xl font-bold tracking-tight">
          {ACERTO.titulo}
        </h1>
        <p className="text-muted-foreground text-sm">
          {ACERTO.subtitulo}
        </p>
      </div>

      <ScrollReveal replayOnScroll>
        <ResumoAcerto
          linhas={linhas}
          regra={regra}
          transferencia={transferencia}
          historico={historico}
        />
      </ScrollReveal>
    </main>
  )
}
