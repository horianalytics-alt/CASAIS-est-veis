import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { GerenciadorCategorias } from '@/components/ajustes/gerenciador-categorias'
import { GerenciadorGrupos } from '@/components/ajustes/gerenciador-grupos'
import { AJUSTES_CATEGORIAS } from '@/features/ajustes/copy'

export const metadata: Metadata = {
  title: AJUSTES_CATEGORIAS.titulo,
  description: AJUSTES_CATEGORIAS.subtitulo,
}

export default async function PaginaAjustesCategorias() {
  await connection()

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: memberId } = await supabase.rpc('get_user_member_id_self')
  if (!memberId) redirect('/onboarding')

  const [{ data: categorias }, { data: grupos }] = await Promise.all([
    supabase
      .from('categories')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),
    supabase
      .from('category_groups')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),
  ])

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-6">
      <div className="flex flex-col gap-3">
        <Button asChild variant="ghost" size="toque" className="w-fit -ml-2 text-muted-foreground">
          <Link href="/ajustes">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Voltar aos Ajustes
          </Link>
        </Button>
        <div>
          <h1 className="text-foreground text-2xl font-bold tracking-tight">
            {AJUSTES_CATEGORIAS.titulo}
          </h1>
          <p className="text-muted-foreground text-sm">
            {AJUSTES_CATEGORIAS.subtitulo}
          </p>
        </div>
      </div>

      <GerenciadorGrupos gruposIniciais={grupos ?? []} />

      <GerenciadorCategorias
        categoriasIniciais={categorias ?? []}
        grupos={grupos ?? []}
      />
    </main>
  )
}