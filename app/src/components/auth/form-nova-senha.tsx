'use client'

import { useActionState, useEffect, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2 } from 'lucide-react'
import { definirNovaSenha } from '@/actions/auth'
import type { ResultadoAction } from '@/actions/resultado'
import { createClient } from '@/lib/supabase/client'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button, buttonVariants } from '@/components/ui/button'
import { CampoErro } from '@/components/ui/campo-erro'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NOVA_SENHA } from '@/features/auth/copy'
import { cn } from '@/lib/utils'

type Estado = ResultadoAction<void> | null

export function FormNovaSenha() {
  const [concluido, setConcluido] = useState(false)

  // Troca ?code= (PKCE) ou #access_token= (hash) pelo cookie de sessão
  useEffect(() => {
    const supabase = createClient()

    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    if (code) {
      supabase.auth.exchangeCodeForSession(code).catch(() => {
        /* se o código já foi trocado ou expirou, a action acusará no submit */
      })
    }

    const hash = window.location.hash
    if (hash && hash.includes('access_token')) {
      const hashParams = new URLSearchParams(hash.replace(/^#/, ''))
      const accessToken = hashParams.get('access_token')
      const refreshToken = hashParams.get('refresh_token')
      if (accessToken && refreshToken) {
        supabase.auth
          .setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          })
          .catch(() => {})
      }
    }
  }, [])

  const [estado, enviar, pendente] = useActionState<Estado, FormData>(
    async (_anterior, formData) => {
      const resultado = await definirNovaSenha(formData)
      if (resultado.ok) {
        setConcluido(true)
      }
      return resultado
    },
    null,
  )

  if (concluido) {
    return (
      <div className="border-border-input flex flex-col items-center gap-[var(--esp-4)] rounded-xl border bg-card p-[var(--esp-6)] text-center">
        <div className="bg-receita/10 text-receita flex size-12 items-center justify-center rounded-full">
          <CheckCircle2 className="size-6" aria-hidden="true" />
        </div>
        <div className="flex flex-col gap-[var(--esp-2)]">
          <h3 className="text-[length:var(--texto-subtitulo)] leading-[var(--texto-subtitulo-lh)] font-semibold">
            {NOVA_SENHA.sucessoTitulo}
          </h3>
          <p className="text-muted-foreground text-[length:var(--texto-apoio)] leading-[var(--texto-apoio-lh)]">
            {NOVA_SENHA.sucessoDescricao}
          </p>
        </div>
        <Link
          href="/inicio"
          className={cn(buttonVariants({ variant: 'default', size: 'toque' }), 'w-full')}
        >
          {NOVA_SENHA.irParaInicio}
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
          <AlertDescription className="flex flex-col gap-2">
            <span>{estado.erro}</span>
            <Link
              href="/recuperar-senha"
              className="inline-block py-[10px] font-medium underline underline-offset-4"
            >
              {NOVA_SENHA.pedirNovoLink}
            </Link>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-[var(--esp-2)]">
        <Label htmlFor="senha">{NOVA_SENHA.senhaLabel}</Label>
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
          {NOVA_SENHA.senhaApoio}
        </p>
        <CampoErro id="erro-senha" mensagens={campos?.senha} />
      </div>

      <div className="flex flex-col gap-[var(--esp-2)]">
        <Label htmlFor="confirmacao">{NOVA_SENHA.confirmacaoLabel}</Label>
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
        {pendente ? NOVA_SENHA.enviando : NOVA_SENHA.enviar}
      </Button>

      <p className="text-muted-foreground text-[length:var(--texto-apoio)] leading-[var(--texto-apoio-lh)]">
        <Link
          href="/login"
          className="text-primary inline-block py-[14px] underline underline-offset-4"
        >
          {NOVA_SENHA.irParaLogin}
        </Link>
      </p>
    </form>
  )
}
