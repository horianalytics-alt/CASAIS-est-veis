import type { Metadata } from 'next'
import { FormLogin } from '@/components/auth/form-login'
import { LOGIN } from '@/features/auth/copy'

export const metadata: Metadata = { title: LOGIN.titulo }

/**
 * Server Component. `searchParams` é assíncrono no Next 16 (decisão de
 * plataforma do PLANO.md): tipar como Promise e await.
 */
export default async function PaginaLogin({
  searchParams,
}: {
  searchParams: Promise<{ proximo?: string | string[] }>
}) {
  const { proximo } = await searchParams

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

      <FormLogin proximo={caminhoInternoSeguro(proximo)} />
    </section>
  )
}

/**
 * Só aceita caminho INTERNO.
 *
 * O proxy grava o `?proximo=` e já se limita a caminho interno; esta função
 * é a segunda barreira, porque o parâmetro chega pela URL e qualquer um pode
 * editá-lo. Sem isto, `?proximo=https://site-falso` faria o login empurrar o
 * usuário para fora do app depois de autenticar (redirect aberto).
 *
 * Recusa: valor ausente, lista, que não comece com '/', e '//' ou '/\' que o
 * navegador interpreta como URL protocolo-relativa para outro host.
 */
function caminhoInternoSeguro(valor: string | string[] | undefined) {
  if (typeof valor !== 'string') return undefined
  if (!valor.startsWith('/')) return undefined
  if (valor.startsWith('//') || valor.startsWith('/\\')) return undefined
  return valor
}
