import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import Link from 'next/link'
import { ArrowLeft, CreditCard, Landmark, PiggyBank, UtensilsCrossed, Edit2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { formatBRL } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DialogoConta } from '@/components/ajustes/dialogo-conta'
import { BotaoArquivarConta } from '@/components/carteira/botao-arquivar-conta'
import { AJUSTES_CONTAS } from '@/features/ajustes/copy'
import { TIPOS_DE_CONTA } from '@/features/transacoes/copy'
import type { Database } from '@/types/database'

export const metadata: Metadata = {
  title: AJUSTES_CONTAS.titulo,
  description: AJUSTES_CONTAS.subtitulo,
}

type Conta = Database['public']['Tables']['accounts']['Row']

function iconeDoTipo(tipo: string | null) {
  switch (tipo) {
    case 'cartao':
      return CreditCard
    case 'investimento':
      return PiggyBank
    case 'beneficio':
      return UtensilsCrossed
    default:
      return Landmark
  }
}

export default async function PaginaAjustesContas() {
  await connection()

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: memberId } = await supabase.rpc('get_user_member_id_self')
  if (!memberId) redirect('/onboarding')

  const { data: familiaId } = await supabase.rpc('get_user_family_id_self')
  if (!familiaId) redirect('/onboarding')

  const { data: contas } = await supabase
    .from('accounts')
    .select('*')
    .order('created_at', { ascending: true })

  const listaContas = (contas ?? []) as Conta[]

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-6">
      <div className="flex flex-col gap-3">
        <Button asChild variant="ghost" size="toque" className="w-fit -ml-2 text-muted-foreground">
          <Link href="/ajustes">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Voltar aos Ajustes
          </Link>
        </Button>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-foreground text-2xl font-bold tracking-tight">
              {AJUSTES_CONTAS.titulo}
            </h1>
            <p className="text-muted-foreground text-sm">
              {AJUSTES_CONTAS.subtitulo}
            </p>
          </div>

          <DialogoConta familiaId={familiaId} />
        </div>
      </div>

      <div className="bg-card border-border/80 divide-border flex flex-col divide-y rounded-xl border shadow-xs overflow-hidden">
        {listaContas.map((conta) => {
          const Icone = iconeDoTipo(conta.type)
          const arquivada = Boolean(conta.archived_at)

          return (
            <div
              key={conta.id}
              className="flex items-center justify-between p-4 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="bg-muted text-foreground flex size-9 items-center justify-center rounded-lg border border-border">
                  <Icone className="size-4.5" aria-hidden="true" />
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className="text-foreground text-sm font-semibold">
                      {conta.name}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {TIPOS_DE_CONTA[conta.type] ?? conta.type}
                    </Badge>
                    {arquivada && (
                      <Badge variant="secondary" className="text-xs">
                        Arquivada
                      </Badge>
                    )}
                  </div>
                  <div className="text-muted-foreground flex flex-wrap items-center gap-3 text-xs mt-0.5">
                    <span>Inicial: {formatBRL(conta.initial_balance)}</span>
                    {conta.type === 'cartao' && conta.closing_day && conta.due_day && (
                      <span>
                        Fecha dia {conta.closing_day} · Vence dia {conta.due_day}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <DialogoConta
                  familiaId={familiaId}
                  contaParaEditar={conta}
                  gatilho={
                    <Button variant="ghost" size="icone-toque" aria-label="Editar conta">
                      <Edit2 className="size-4" aria-hidden="true" />
                    </Button>
                  }
                />
                <BotaoArquivarConta
                  contaId={conta.id}
                  estaArquivada={arquivada}
                />
              </div>
            </div>
          )
        })}
      </div>
    </main>
  )
}
