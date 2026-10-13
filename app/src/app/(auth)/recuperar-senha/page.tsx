import type { Metadata } from 'next'
import { FormRecuperarSenha } from '@/components/auth/form-recuperar-senha'
import { RECUPERAR_SENHA } from '@/features/auth/copy'

export const metadata: Metadata = { title: RECUPERAR_SENHA.titulo }

export default function PaginaRecuperarSenha() {
  return (
    <section className="flex flex-col gap-[var(--esp-5)]">
      <div className="flex flex-col gap-[var(--esp-1)]">
        <h2 className="text-[length:var(--texto-subtitulo)] leading-[var(--texto-subtitulo-lh)] font-semibold">
          {RECUPERAR_SENHA.titulo}
        </h2>
        <p className="text-muted-foreground text-[length:var(--texto-apoio)] leading-[var(--texto-apoio-lh)]">
          {RECUPERAR_SENHA.subtitulo}
        </p>
      </div>

      <FormRecuperarSenha />
    </section>
  )
}
