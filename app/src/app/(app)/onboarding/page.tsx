import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { FormCriarCasa } from '@/components/familia/form-criar-casa'
import { FormEntrarCasa } from '@/components/familia/form-entrar-casa'
import { ONBOARDING } from '@/features/familia/copy'
import { APP } from '@/features/comum/copy'

export const metadata: Metadata = { title: ONBOARDING.titulo }

/**
 * Rota bloqueante, de proposito.
 *
 * A tela inteira depende da sessao do pedido: quem nao tem familia ve o
 * formulario, quem ja tem e redirecionado. Nao existe casca util para
 * prerenderizar e streamar depois - mostrar "crie sua casa" para quem ja tem
 * casa, e corrigir meio segundo depois, seria pior que esperar.
 *
 * Por isso `instant = false` em vez de <Suspense>: aqui o conteudo dinamico
 * NAO e um pedaco da pagina, e a pagina toda.
 */
export const instant = false

/**
 * Onboarding: criar a casa ou entrar na casa do par.
 *
 * Server Component. Rota PRIVADA — o proxy nega por padrão, então aqui já
 * existe sessão. O que ainda não existe é a FAMÍLIA: é isso que esta tela
 * resolve.
 *
 * Quem já tem família não deve ver esta tela: seria possível tentar criar uma
 * segunda casa e tomar um erro do banco ("Você já faz parte de uma família").
 * Melhor não oferecer a ação do que explicar por que ela falhou.
 */
export default async function PaginaOnboarding() {
  // Esta rota depende da sessao do pedido, entao NAO pode ser prerenderizada.
  // Sem isto o Next tenta prerenderizar, o client do Supabase le o relogio ao
  // tratar o token, e sai o erro "unstable value Date.now()". connection()
  // declara a dependencia de request e trata a CAUSA, em vez de calar o aviso.
  // Fonte: a propria mensagem do Next e next/server.d.ts.
  await connection()

  const supabase = await createClient()

  // getUser valida o token no servidor de Auth. getSession leria só o cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // A RPC resolve o membro pelo auth.uid() — o cliente não informa quem é.
  const { data: memberId } = await supabase.rpc('get_user_member_id_self')

  if (memberId) redirect('/inicio')

  return (
    <main className="mx-auto flex w-full max-w-[32rem] flex-1 flex-col gap-[var(--esp-6)] px-[var(--esp-4)] py-[var(--esp-8)]">
      <header className="flex flex-col gap-[var(--esp-2)]">
        <p className="text-muted-foreground text-[length:var(--texto-apoio)] leading-[var(--texto-apoio-lh)]">
          {APP.nome}
        </p>
        <h1 className="text-[length:var(--texto-titulo)] leading-[var(--texto-titulo-lh)] font-semibold">
          {ONBOARDING.titulo}
        </h1>
        <p className="text-muted-foreground text-[length:var(--texto-corpo)] leading-[var(--texto-corpo-lh)]">
          {ONBOARDING.subtitulo}
        </p>
      </header>

      {/*
        Sem Tabs: as duas opções aparecem uma sob a outra, separadas por um
        divisor com rótulo. Numa tela que a pessoa vê UMA vez na vida, esconder
        metade atrás de uma aba cria a dúvida "cadê a outra opção?" — e o custo
        de rolar é menor que o de procurar.
      */}
      <section
        aria-labelledby="titulo-criar"
        className="flex flex-col gap-[var(--esp-4)]"
      >
        <div className="flex flex-col gap-[var(--esp-1)]">
          <h2
            id="titulo-criar"
            className="text-[length:var(--texto-subtitulo)] leading-[var(--texto-subtitulo-lh)] font-semibold"
          >
            {ONBOARDING.abaCriar}
          </h2>
        </div>
        <FormCriarCasa />
      </section>

      <div className="flex items-center gap-[var(--esp-3)]" role="presentation">
        {/* Régua decorativa: --border é o uso legítimo dela (C-4). */}
        <span className="h-px flex-1 bg-border" />
        <span className="text-muted-foreground text-[length:var(--texto-apoio)]">
          ou
        </span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <section
        aria-labelledby="titulo-entrar"
        className="flex flex-col gap-[var(--esp-4)]"
      >
        <div className="flex flex-col gap-[var(--esp-1)]">
          <h2
            id="titulo-entrar"
            className="text-[length:var(--texto-subtitulo)] leading-[var(--texto-subtitulo-lh)] font-semibold"
          >
            {ONBOARDING.abaEntrar}
          </h2>
        </div>
        <FormEntrarCasa />
      </section>
    </main>
  )
}
