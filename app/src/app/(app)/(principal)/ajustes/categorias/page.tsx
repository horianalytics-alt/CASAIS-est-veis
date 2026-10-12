import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import Link from 'next/link'
import { ArrowLeft, Tag } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AJUSTES } from '@/features/ajustes/copy'

export const metadata: Metadata = {
  title: 'Categorias',
  description: 'Categorias de despesas e receitas',
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

  const { data: categorias } = await supabase
    .from('categories')
    .select('*')
    .order('sort_order', { ascending: true })

  const lista = categorias ?? []

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
            Categorias
          </h1>
          <p className="text-muted-foreground text-sm">
            Categorias utilizadas na classificação de despesas e receitas da casa
          </p>
        </div>
      </div>

      <div className="bg-card border-border/80 divide-border flex flex-col divide-y rounded-xl border shadow-xs overflow-hidden">
        {lista.map((cat) => (
          <div key={cat.id} className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <div className="bg-muted text-foreground flex size-8 items-center justify-center rounded-lg border border-border">
                <Tag className="size-4" aria-hidden="true" />
              </div>
              <span className="text-foreground text-sm font-semibold">
                {cat.name}
              </span>
            </div>
            <Badge variant="outline" className="text-xs uppercase">
              {cat.type}
            </Badge>
          </div>
        ))}
      </div>
    </main>
  )
}
