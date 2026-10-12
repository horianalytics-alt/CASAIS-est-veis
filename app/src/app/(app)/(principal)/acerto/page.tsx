import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveTransfer, type SettlementBalance } from '@/lib/settlement'
import { ResumoAcerto } from '@/components/acerto/resumo-acerto'
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

  // Busca dados de acerto e regra da família em paralelo
  const [resAcerto, resFamilia] = await Promise.all([
    supabase.from('v_settlement').select('*'),
    supabase.from('families').select('split_rule, name').single(),
  ])

  const linhas = (resAcerto.data ?? []) as LinhaAcerto[]
  const regra = resFamilia.data?.split_rule ?? 'equal'

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

      <ResumoAcerto
        linhas={linhas}
        regra={regra}
        transferencia={transferencia}
      />
    </main>
  )
}
