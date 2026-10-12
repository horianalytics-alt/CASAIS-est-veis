import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import Link from 'next/link'
import { ArrowLeft, User, Calendar, DollarSign } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { formatBRL, isoToBR } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { BlocoCodigoConvite } from '@/components/ajustes/bloco-codigo-convite'
import { FormRegraDivisao } from '@/components/ajustes/form-regra-divisao'
import { AJUSTES_FAMILIA } from '@/features/ajustes/copy'

export const metadata: Metadata = {
  title: AJUSTES_FAMILIA.titulo,
  description: AJUSTES_FAMILIA.subtitulo,
}

export default async function PaginaAjustesFamilia() {
  await connection()

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: memberId } = await supabase.rpc('get_user_member_id_self')
  if (!memberId) redirect('/onboarding')

  const [resFamilia, resMembros] = await Promise.all([
    supabase.from('families').select('*').single(),
    supabase.from('family_members').select('*').order('joined_at', { ascending: true }),
  ])

  const familia = resFamilia.data
  const membros = resMembros.data ?? []

  if (!familia) redirect('/onboarding')

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-6">
      {/* Botão Voltar e Cabeçalho */}
      <div className="flex flex-col gap-3">
        <Button asChild variant="ghost" size="toque" className="w-fit -ml-2 text-muted-foreground">
          <Link href="/ajustes">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Voltar aos Ajustes
          </Link>
        </Button>
        <div>
          <h1 className="text-foreground text-2xl font-bold tracking-tight">
            {AJUSTES_FAMILIA.titulo}
          </h1>
          <p className="text-muted-foreground text-sm">
            Casa: <strong>{familia.name}</strong>
          </p>
        </div>
      </div>

      {/* Código de Convite */}
      <BlocoCodigoConvite codigo={familia.join_code} />

      {/* Lista de Membros */}
      <section aria-labelledby="titulo-membros" className="flex flex-col gap-3">
        <h2 id="titulo-membros" className="text-foreground text-lg font-semibold">
          {AJUSTES_FAMILIA.membrosTitulo} ({membros.length})
        </h2>

        <div className="bg-card border-border/80 divide-border flex flex-col divide-y rounded-xl border shadow-xs overflow-hidden">
          {membros.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between p-4"
            >
              <div className="flex items-center gap-3">
                <div className="bg-muted text-foreground flex size-9 items-center justify-center rounded-full border border-border">
                  <User className="size-4.5" aria-hidden="true" />
                </div>
                <div className="flex flex-col">
                  <span className="text-foreground text-sm font-semibold">
                    {m.display_name}
                  </span>
                  <div className="text-muted-foreground flex flex-wrap items-center gap-3 text-xs">
                    {m.monthly_income !== null && m.monthly_income > 0 && (
                      <span className="flex items-center gap-1">
                        <DollarSign className="size-3" aria-hidden="true" />
                        Renda: {formatBRL(m.monthly_income)}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Calendar className="size-3" aria-hidden="true" />
                      Entrou em: {isoToBR(m.joined_at.slice(0, 10))}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Regra de Divisão */}
      <section aria-labelledby="titulo-regra" className="bg-card border-border/80 flex flex-col gap-4 rounded-xl border p-5 shadow-xs">
        <h2 id="titulo-regra" className="text-foreground text-base font-semibold">
          {AJUSTES_FAMILIA.regraTitulo}
        </h2>
        <FormRegraDivisao
          familiaId={familia.id}
          regraAtual={familia.split_rule}
        />
      </section>
    </main>
  )
}
