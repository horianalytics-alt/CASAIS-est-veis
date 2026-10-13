import type { Metadata } from 'next'
import { FormNovaSenha } from '@/components/auth/form-nova-senha'
import { NOVA_SENHA } from '@/features/auth/copy'

export const metadata: Metadata = { title: NOVA_SENHA.titulo }

export default function PaginaNovaSenha() {
  return (
    <section className="flex flex-col gap-[var(--esp-5)]">
      <div className="flex flex-col gap-[var(--esp-1)]">
        <h2 className="text-[length:var(--texto-subtitulo)] leading-[var(--texto-subtitulo-lh)] font-semibold">
          {NOVA_SENHA.titulo}
        </h2>
        <p className="text-muted-foreground text-[length:var(--texto-apoio)] leading-[var(--texto-apoio-lh)]">
          {NOVA_SENHA.subtitulo}
        </p>
      </div>

      <FormNovaSenha />
    </section>
  )
}
