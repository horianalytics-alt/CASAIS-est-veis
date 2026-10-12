import type { Metadata } from 'next'
import { Suspense } from 'react'
import { FormLogin } from '@/components/auth/form-login'
import { LOGIN } from '@/features/auth/copy'
import { caminhoInternoSeguro } from '@/features/auth/destino'
import { Skeleton } from '@/components/ui/skeleton'

export const metadata: Metadata = { title: LOGIN.titulo }

/**
 * Server Component. O cabeçalho é estático e prerenderiza; só o formulário
 * depende de `searchParams` e por isso fica dentro de <Suspense>.
 */
export default function PaginaLogin({
  searchParams,
}: {
  searchParams: Promise<{ proximo?: string | string[] }>
}) {
  return (
    <section className="flex flex-col gap-[var(--esp-5)]">
      <div className="flex flex-col gap-[var(--esp-1)]">
        <h2 className="text-[length:var(--texto-subtitulo)] leading-[var(--texto-subtitulo-lh)] font-semibold">
          {LOGIN.titulo}
        </h2>
        <p className="text-muted-foreground text-[length:var(--texto-apoio)] leading-[var(--texto-apoio-lh)]">
          {LOGIN.subtitulo}
        </p>
      </div>

      {/*
        Ler `searchParams` fora de <Suspense> impede o prerender da rota
        inteira (Next 16 acusa "runtime data during prerendering"). Com a
        fronteira aqui, a casca da página é estática e só o formulário espera
        pelo parâmetro. O fallback tem a mesma altura do formulário para a
        página não pular quando ele chega.
      */}
      <Suspense fallback={<EsqueletoDoFormulario />}>
        <FormularioComDestino searchParams={searchParams} />
      </Suspense>
    </section>
  )
}

async function FormularioComDestino({
  searchParams,
}: {
  searchParams: Promise<{ proximo?: string | string[] }>
}) {
  const { proximo } = await searchParams
  return <FormLogin proximo={caminhoInternoSeguro(proximo)} />
}

function EsqueletoDoFormulario() {
  return (
    <div className="flex flex-col gap-[var(--esp-5)]" aria-busy="true">
      <div className="flex flex-col gap-[var(--esp-2)]">
        <Skeleton className="h-[18px] w-16" />
        <Skeleton className="h-[44px] w-full" />
      </div>
      <div className="flex flex-col gap-[var(--esp-2)]">
        <Skeleton className="h-[18px] w-16" />
        <Skeleton className="h-[44px] w-full" />
      </div>
      <Skeleton className="h-[44px] w-full" />
      <Skeleton className="h-[18px] w-48" />
    </div>
  )
}

// `caminhoInternoSeguro` vive em @/features/auth/destino e é aplicada nos DOIS
// lados (aqui no servidor e em FormLogin antes do router.replace). A versão
// anterior, local e baseada em texto, era contornável por caractere de controle
// — ver o comentário do módulo.
