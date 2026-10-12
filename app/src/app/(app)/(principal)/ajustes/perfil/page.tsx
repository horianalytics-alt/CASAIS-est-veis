import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { FormPerfil } from '@/components/ajustes/form-perfil'
import { AJUSTES_PERFIL } from '@/features/ajustes/copy'

export const metadata: Metadata = {
  title: AJUSTES_PERFIL.titulo,
  description: AJUSTES_PERFIL.subtitulo,
}

export default async function PaginaAjustesPerfil() {
  await connection()

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: memberId } = await supabase.rpc('get_user_member_id_self')
  if (!memberId) redirect('/onboarding')

  const { data: membro } = await supabase
    .from('family_members')
    .select('*')
    .eq('id', memberId)
    .single()

  if (!membro) redirect('/onboarding')

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-6">
      <div className="flex flex-col gap-3">
        <Button asChild variant="ghost" size="toque" className="w-fit -ml-2 text-muted-foreground">
          <Link href="/ajustes">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Voltar aos Ajustes
          </Link>
        </Button>
        <div>
          <h1 className="text-foreground text-2xl font-bold tracking-tight">
            {AJUSTES_PERFIL.titulo}
          </h1>
          <p className="text-muted-foreground text-sm">
            {AJUSTES_PERFIL.subtitulo}
          </p>
        </div>
      </div>

      <div className="bg-card border-border/80 rounded-xl border p-5 shadow-xs">
        <FormPerfil
          membroId={membro.id}
          nomeInicial={membro.display_name}
          rendaInicial={membro.monthly_income}
        />
      </div>
    </main>
  )
}
