'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { MailCheck } from 'lucide-react'
import { cadastrar } from '@/actions/auth'
import type { ResultadoAction } from '@/actions/resultado'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button, buttonVariants } from '@/components/ui/button'
import { CampoErro } from '@/components/ui/campo-erro'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CADASTRO } from '@/features/auth/copy'
import { cn } from '@/lib/utils'

type Estado = ResultadoAction<{ precisaConfirmarEmail: boolean }> | null

export function FormCadastro() {
  const router = useRouter()
  const [precisaConfirmar, setPrecisaConfirmar] = useState(false)

  const [estado, enviar, pendente] = useActionState<Estado, FormData>(
    async (_anterior, formData) => {
      const resultado = await cadastrar(formData)
      if (resultado.ok) {
        if (resultado.dados.precisaConfirmarEmail) {
          setPrecisaConfirmar(true)
        } else {
          router.replace('/onboarding')
          router.refresh()
        }
      }
      return resultado
    },
    null,
  )

  if (precisaConfirmar) {
    return (
      <div className="border-border-input flex flex-col items-center gap-[var(--esp-4)] rounded-xl border bg-card p-[var(--esp-6)] text-center">
        <div className="bg-primary/10 text-primary flex size-12 items-center justify-center rounded-full">
          <MailCheck className="size-6" aria-hidden="true" />
        </div>
        <div className="flex flex-col gap-[var(--esp-2)]">
          <h3 className="text-[length:var(--texto-subtitulo)] leading-[var(--texto-subtitulo-lh)] font-semibold">
            {CADASTRO.confirmeTitulo}
          </h3>
          <p className="text-muted-foreground text-[length:var(--texto-apoio)] leading-[var(--texto-apoio-lh)]">
            {CADASTRO.confirmeDescricao}
          </p>
        </div>
        <Link
          href="/login"
          className={cn(buttonVariants({ variant: 'default', size: 'toque' }), 'w-full')}
        >
          {CADASTRO.irParaLogin}
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
        <Label htmlFor="email">{CADASTRO.emailLabel}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          placeholder={CADASTRO.emailPlaceholder}
          aria-invalid={campos?.email ? true : undefined}
          aria-describedby={campos?.email ? 'erro-email' : undefined}
          disabled={pendente}
        />
        <CampoErro id="erro-email" mensagens={campos?.email} />
      </div>

      <div className="flex flex-col gap-[var(--esp-2)]">
        <Label htmlFor="senha">{CADASTRO.senhaLabel}</Label>
        <Input
          id="senha"
          name="senha"
          type="password"
          autoComplete="new-password"
          aria-invalid={campos?.senha ? true : undefined}
          aria-describedby={cn('apoio-senha', campos?.senha && 'erro-senha')}
          disabled={pendente}
        />
        <p
          id="apoio-senha"
          className="text-muted-foreground text-[length:var(--texto-apoio)] leading-[var(--texto-apoio-lh)]"
        >
          {CADASTRO.senhaApoio}
        </p>
        <CampoErro id="erro-senha" mensagens={campos?.senha} />
      </div>

      <div className="flex flex-col gap-[var(--esp-2)]">
        <Label htmlFor="confirmacao">{CADASTRO.confirmacaoLabel}</Label>
        <Input
          id="confirmacao"
          name="confirmacao"
          type="password"
          autoComplete="new-password"
          aria-invalid={campos?.confirmacao ? true : undefined}
          aria-describedby={campos?.confirmacao ? 'erro-confirmacao' : undefined}
          disabled={pendente}
        />
        <CampoErro id="erro-confirmacao" mensagens={campos?.confirmacao} />
      </div>

      <Button type="submit" size="toque" disabled={pendente}>
        {pendente ? CADASTRO.enviando : CADASTRO.enviar}
      </Button>

      <p className="text-muted-foreground text-[length:var(--texto-apoio)] leading-[var(--texto-apoio-lh)]">
        {CADASTRO.temConta}{' '}
        <Link
          href="/login"
          className="text-primary inline-block py-[14px] underline underline-offset-4"
        >
          {CADASTRO.irParaLogin}
        </Link>
      </p>
    </form>
  )
}
