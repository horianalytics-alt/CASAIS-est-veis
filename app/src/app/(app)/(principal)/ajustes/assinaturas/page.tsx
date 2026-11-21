import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import Link from 'next/link'
import { ArrowLeft, Repeat } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { hojeEmSaoPaulo } from '@/lib/hoje'
import { listarRecorrencias } from '@/lib/queries/recorrencias'
import { ListaAssinaturas } from '@/components/recorrencia/lista-assinaturas'
import { AJUSTES_ASSINATURAS } from '@/features/ajustes/copy'
import { Alert, AlertDescription } from '@/components/ui/alert'

export const metadata: Metadata = {
  title: AJUSTES_ASSINATURAS.titulo,
  description: AJUSTES_ASSINATURAS.subtitulo,
}

export default async function PaginaAssinaturas() {
  await connection()

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: memberId } = await supabase.rpc('get_user_member_id_self')
  if (!memberId) redirect('/onboarding')

  const { data: familyId } = await supabase.rpc('get_user_family_id_self')
  if (!familyId) redirect('/onboarding')

  const mesAtual = hojeEmSaoPaulo().slice(0, 7)

  const [resultadoRecorrencias, contasRes] = await Promise.all([
    listarRecorrencias(supabase, familyId, mesAtual),
    supabase
      .from('accounts')
      .select('id, name, type, archived_at')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),
  ])

  const contas = (contasRes.data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    archived_at: c.archived_at,
  }))

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-6">
      {/* Voltar e Título */}
      <div className="flex flex-col gap-2">
        <Link
          href="/ajustes"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs font-medium transition-colors"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Voltar para Ajustes
        </Link>
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 text-primary flex size-9 items-center justify-center rounded-lg border border-primary/20">
            <Repeat className="size-4.5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-foreground text-2xl font-bold tracking-tight">
              {AJUSTES_ASSINATURAS.titulo}
            </h1>
            <p className="text-muted-foreground text-xs">
              {AJUSTES_ASSINATURAS.subtitulo}
            </p>
          </div>
        </div>
      </div>

      {!resultadoRecorrencias.ok ? (
        <Alert variant="destructive">
          <AlertDescription>
            Não foi possível carregar as assinaturas. Tente de novo em instantes.
          </AlertDescription>
        </Alert>
      ) : (
        <ListaAssinaturas
          ativas={resultadoRecorrencias.ativas}
          encerradas={resultadoRecorrencias.encerradas}
          contas={contas}
          mesAtual={mesAtual}
        />
      )}
    </main>
  )
}
