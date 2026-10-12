import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import Link from 'next/link'
import {
  ChevronRight,
  CreditCard,
  Palette,
  Tags,
  User,
  Users,
  WalletCards,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { SeletorTema } from '@/components/ajustes/seletor-tema'
import { AJUSTES } from '@/features/ajustes/copy'

export const metadata: Metadata = {
  title: AJUSTES.titulo,
  description: AJUSTES.subtitulo,
}

export default async function PaginaAjustes() {
  await connection()

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: memberId } = await supabase.rpc('get_user_member_id_self')
  if (!memberId) redirect('/onboarding')

  // Busca dados rápidos da família para exibir cabeçalho
  const { data: familia } = await supabase
    .from('families')
    .select('name')
    .single()

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-6">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-1">
        <h1 className="text-foreground text-2xl font-bold tracking-tight">
          {AJUSTES.titulo}
        </h1>
        <p className="text-muted-foreground text-sm">
          {familia ? `Casa: ${familia.name}` : AJUSTES.subtitulo}
        </p>
      </div>

      {/* Seção de Aparência */}
      <section
        aria-labelledby="titulo-aparencia"
        className="bg-card border-border/80 flex flex-col gap-4 rounded-xl border p-5 shadow-xs"
      >
        <div className="flex items-center gap-2">
          <Palette className="text-muted-foreground size-5" aria-hidden="true" />
          <div>
            <h2 id="titulo-aparencia" className="text-foreground text-base font-semibold">
              {AJUSTES.secaoAparencia}
            </h2>
            <p className="text-muted-foreground text-xs">
              {AJUSTES.secaoAparenciaDica}
            </p>
          </div>
        </div>

        <div className="border-border/60 border-t pt-4">
          <SeletorTema />
        </div>
      </section>

      {/* Seção Casa e Membros */}
      <section aria-labelledby="titulo-familia" className="flex flex-col gap-3">
        <h2 id="titulo-familia" className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
          {AJUSTES.secaoFamilia}
        </h2>

        <div className="bg-card border-border/80 divide-border flex flex-col divide-y rounded-xl border shadow-xs overflow-hidden">
          <Link
            href="/ajustes/familia"
            className="hover:bg-muted/40 flex min-h-[56px] items-center justify-between p-4 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="bg-muted text-foreground flex size-9 items-center justify-center rounded-lg border border-border">
                <Users className="size-4.5" aria-hidden="true" />
              </div>
              <div className="flex flex-col">
                <span className="text-foreground text-sm font-semibold">
                  {AJUSTES.linkFamilia}
                </span>
                <span className="text-muted-foreground text-xs">
                  {AJUSTES.linkFamiliaDica}
                </span>
              </div>
            </div>
            <ChevronRight className="text-muted-foreground size-4" aria-hidden="true" />
          </Link>

          <Link
            href="/ajustes/perfil"
            className="hover:bg-muted/40 flex min-h-[56px] items-center justify-between p-4 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="bg-muted text-foreground flex size-9 items-center justify-center rounded-lg border border-border">
                <User className="size-4.5" aria-hidden="true" />
              </div>
              <div className="flex flex-col">
                <span className="text-foreground text-sm font-semibold">
                  {AJUSTES.linkPerfil}
                </span>
                <span className="text-muted-foreground text-xs">
                  {AJUSTES.linkPerfilDica}
                </span>
              </div>
            </div>
            <ChevronRight className="text-muted-foreground size-4" aria-hidden="true" />
          </Link>
        </div>
      </section>

      {/* Seção Estrutura Financeira */}
      <section aria-labelledby="titulo-financeiro" className="flex flex-col gap-3">
        <h2 id="titulo-financeiro" className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
          {AJUSTES.secaoFinanceiro}
        </h2>

        <div className="bg-card border-border/80 divide-border flex flex-col divide-y rounded-xl border shadow-xs overflow-hidden">
          <Link
            href="/ajustes/contas"
            className="hover:bg-muted/40 flex min-h-[56px] items-center justify-between p-4 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="bg-muted text-foreground flex size-9 items-center justify-center rounded-lg border border-border">
                <WalletCards className="size-4.5" aria-hidden="true" />
              </div>
              <div className="flex flex-col">
                <span className="text-foreground text-sm font-semibold">
                  {AJUSTES.linkContas}
                </span>
                <span className="text-muted-foreground text-xs">
                  {AJUSTES.linkContasDica}
                </span>
              </div>
            </div>
            <ChevronRight className="text-muted-foreground size-4" aria-hidden="true" />
          </Link>

          <Link
            href="/ajustes/categorias"
            className="hover:bg-muted/40 flex min-h-[56px] items-center justify-between p-4 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="bg-muted text-foreground flex size-9 items-center justify-center rounded-lg border border-border">
                <Tags className="size-4.5" aria-hidden="true" />
              </div>
              <div className="flex flex-col">
                <span className="text-foreground text-sm font-semibold">
                  {AJUSTES.linkCategorias}
                </span>
                <span className="text-muted-foreground text-xs">
                  {AJUSTES.linkCategoriasDica}
                </span>
              </div>
            </div>
            <ChevronRight className="text-muted-foreground size-4" aria-hidden="true" />
          </Link>

          <Link
            href="/ajustes/formas-pagamento"
            className="hover:bg-muted/40 flex min-h-[56px] items-center justify-between p-4 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="bg-muted text-foreground flex size-9 items-center justify-center rounded-lg border border-border">
                <CreditCard className="size-4.5" aria-hidden="true" />
              </div>
              <div className="flex flex-col">
                <span className="text-foreground text-sm font-semibold">
                  {AJUSTES.linkFormasPagamento}
                </span>
                <span className="text-muted-foreground text-xs">
                  {AJUSTES.linkFormasPagamentoDica}
                </span>
              </div>
            </div>
            <ChevronRight className="text-muted-foreground size-4" aria-hidden="true" />
          </Link>
        </div>
      </section>
    </main>
  )
}
