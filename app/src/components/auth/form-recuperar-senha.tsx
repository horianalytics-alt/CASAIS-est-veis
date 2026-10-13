'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { MailCheck } from 'lucide-react'
import { pedirRecuperacaoDeSenha } from '@/actions/auth'
import type { ResultadoAction } from '@/actions/resultado'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button, buttonVariants } from '@/components/ui/button'
import { CampoErro } from '@/components/ui/campo-erro'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RECUPERAR_SENHA } from '@/features/auth/copy'
import { cn } from '@/lib/utils'

type Estado = ResultadoAction<void> | null

export function FormRecuperarSenha() {
  const [enviado, setEnviado] = useState(false)

  const [estado, enviar, pendente] = useActionState<Estado, FormData>(
    async (_anterior, formData) => {
      const resultado = await pedirRecuperacaoDeSenha(formData)
      if (resultado.ok) {
        setEnviado(true)
      }
      return resultado
    },
    null,
  )

  if (enviado) {
    return (
      <div className="border-border-input flex flex-col items-center gap-[var(--esp-4)] rounded-xl border bg-card p-[var(--esp-6)] text-center">
        <div className="bg-primary/10 text-primary flex size-12 items-center justify-center rounded-full">
          <MailCheck className="size-6" aria-hidden="true" />
        </div>
        <div className="flex flex-col gap-[var(--esp-2)]">
          <h3 className="text-[length:var(--texto-subtitulo)] leading-[var(--texto-subtitulo-lh)] font-semibold">
            {RECUPERAR_SENHA.confirmacaoTitulo}
          </h3>
          <p className="text-muted-foreground text-[length:var(--texto-apoio)] leading-[var(--texto-apoio-lh)]">
            {RECUPERAR_SENHA.confirmacaoDescricao}
          </p>
        </div>
        <Link
          href="/login"
          className={cn(buttonVariants({ variant: 'default', size: 'toque' }), 'w-full')}
        >
          {RECUPERAR_SENHA.voltarLogin}
        </Link>
      </div>
    )
  }

  const falhou = estado !== null && !estado.ok
  const campos = falhou ? estado.camposComErro : undefined

  return (
    <form action={enviar} className="flex flex-col gap-[var(--esp-5)]" noValidate>
      {falhou && !campos ? (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-[var(--esp-2)]">
        <Label htmlFor="email">{RECUPERAR_SENHA.emailLabel}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          placeholder={RECUPERAR_SENHA.emailPlaceholder}
          aria-invalid={campos?.email ? true : undefined}
          aria-describedby={campos?.email ? 'erro-email' : undefined}
          disabled={pendente}
        />
        <CampoErro id="erro-email" mensagens={campos?.email} />
      </div>

      <Button type="submit" size="toque" disabled={pendente}>
        {pendente ? RECUPERAR_SENHA.enviando : RECUPERAR_SENHA.enviar}
      </Button>

      <p className="text-muted-foreground text-[length:var(--texto-apoio)] leading-[var(--texto-apoio-lh)]">
        <Link
          href="/login"
          className="text-primary inline-block py-[14px] underline underline-offset-4"
        >
          {RECUPERAR_SENHA.voltarLogin}
        </Link>
      </p>
    </form>
  )
}
