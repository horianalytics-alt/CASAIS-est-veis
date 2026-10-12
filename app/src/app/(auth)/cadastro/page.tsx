import type { Metadata } from 'next'
import { FormCadastro } from '@/components/auth/form-cadastro'
import { CADASTRO } from '@/features/auth/copy'

export const metadata: Metadata = { title: CADASTRO.titulo }

export default function PaginaCadastro() {
  return (
    <section className="flex flex-col gap-[var(--esp-5)]">
      <div className="flex flex-col gap-[var(--esp-1)]">
        <h2 className="text-[length:var(--texto-subtitulo)] leading-[var(--texto-subtitulo-lh)] font-semibold">
          {CADASTRO.titulo}
        </h2>
        <p className="text-muted-foreground text-[length:var(--texto-apoio)] leading-[var(--texto-apoio-lh)]">
          {CADASTRO.subtitulo}
        </p>
      </div>

      <FormCadastro />
    </section>
  )
}
