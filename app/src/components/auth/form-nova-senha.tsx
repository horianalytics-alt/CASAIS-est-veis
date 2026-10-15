'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
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

/**
 * `conferindo`: ainda não sabemos se o link vale (estado do primeiro render,
 * igual no servidor e no cliente, para não haver diferença de hidratação).
 * `pronto`: pode trocar a senha. `invalido`: o link não serve.
 */
type SituacaoLink = 'conferindo' | 'pronto' | 'invalido'

/**
 * Tira credencial e código da barra de endereço e do histórico.
 *
 * O estado vai `null` de propósito: o Next só sincroniza o roteador com um
 * replaceState externo quando o estado NÃO traz a marca interna dele (`__NA`).
 * Repassar `window.history.state` deixaria o roteador com a URL antiga, e ele a
 * reescreveria na barra no próximo envio do formulário.
 */
function limparUrl() {
  window.history.replaceState(null, '', window.location.pathname)
}

/** Espera os efeitos do pai rodarem — entre eles, o patch de history do Next. */
function proximaVolta() {
  return new Promise<void>((resolver) => setTimeout(resolver, 0))
}

export function FormNovaSenha() {
  const [concluido, setConcluido] = useState(false)
  const [situacao, setSituacao] = useState<SituacaoLink>('conferindo')

  /*
   * Segurança (M-1, Sentinela R5): esta página NUNCA instala sessão a partir de
   * `#access_token`/`#refresh_token`. Esses tokens não estão presos ao
   * navegador de quem abre o link — quem os tiver (inclusive os de recuperação
   * da PRÓPRIA conta do atacante, com `type=recovery` legítimo) conseguiria
   * logar a vítima na conta dele. `type` vem do texto da URL e não prova nada.
   *
   * O único link aceito é o PKCE `?code=`, que o pedido de recuperação gera
   * (o client do @supabase/ssr usa flowType 'pkce'). Quem faz a troca é o
   * próprio client, ao iniciar (detectSessionInUrl), e ela só funciona com o
   * code_verifier guardado no cookie DESTE navegador — o que pediu a
   * recuperação. O verifier de recuperação é gravado com a marca `/recovery`;
   * só com ela o client emite o evento PASSWORD_RECOVERY. É esse evento, e não
   * nada que venha na URL, que libera o formulário. O client recusa o fluxo de
   * hash por conta própria ("Not a valid PKCE flow url").
   */
  // A URL é lida UMA vez por instância: em Strict Mode o efeito roda duas
  // vezes, e a primeira passada já limpou a barra de endereço.
  const urlDeEntrada = useRef<string | null>(null)

  useEffect(() => {
    let cancelado = false
    urlDeEntrada.current ??= window.location.href
    const url = new URL(urlDeEntrada.current)
    const hash = new URLSearchParams(url.hash.replace(/^#/, ''))
    const temErro = (p: URLSearchParams) =>
      p.has('error') || p.has('error_code') || p.has('error_description')
    const veioTokenNoHash = hash.has('access_token') || hash.has('refresh_token')
    const veioErroNoLink = temErro(hash) || temErro(url.searchParams)
    const code = url.searchParams.get('code')
    const linkRecusado = veioTokenNoHash || veioErroNoLink

    // Assina ANTES de a inicialização do client terminar, para não perder o
    // aviso de recuperação (ele sai depois da troca do code).
    let recuperacaoConfirmada = false
    const assinatura =
      code && !linkRecusado
        ? createClient().auth.onAuthStateChange((evento) => {
            if (evento === 'PASSWORD_RECOVERY') recuperacaoConfirmada = true
          }).data.subscription
        : null

    async function conferir() {
      await proximaVolta()
      if (cancelado) return

      if (linkRecusado) {
        limparUrl()
        setSituacao('invalido')
        return
      }

      if (!code) {
        // Sem link: quem já está logado pode trocar a própria senha; quem não
        // está recebe o aviso de link expirado no envio (definirNovaSenha).
        setSituacao('pronto')
        return
      }

      // getSession() espera a inicialização do client, que é quando ele tenta
      // a troca do ?code=. O aviso PASSWORD_RECOVERY sai num setTimeout da
      // própria inicialização, enfileirado antes do nosso: uma volta a mais
      // garante que ele já chegou. Sem verifier neste navegador (link aberto
      // em outro aparelho, ou forjado), a troca nem é tentada e o aviso não vem.
      await createClient().auth.getSession()
      await proximaVolta()
      if (cancelado) return
      limparUrl()
      setSituacao(recuperacaoConfirmada ? 'pronto' : 'invalido')
    }

    void conferir()
    return () => {
      cancelado = true
      assinatura?.unsubscribe()
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

  if (situacao === 'invalido') {
    return (
      <div className="flex flex-col gap-[var(--esp-5)]">
        <Alert variant="destructive">
          <AlertDescription className="flex flex-col gap-2">
            <span>{NOVA_SENHA.linkInvalido}</span>
            <Link
              href="/recuperar-senha"
              className="inline-block py-[10px] font-medium underline underline-offset-4"
            >
              {NOVA_SENHA.pedirNovoLink}
            </Link>
          </AlertDescription>
        </Alert>
        <p className="text-muted-foreground text-[length:var(--texto-apoio)] leading-[var(--texto-apoio-lh)]">
          <Link
            href="/login"
            className="text-primary inline-block py-[14px] underline underline-offset-4"
          >
            {NOVA_SENHA.irParaLogin}
          </Link>
        </p>
      </div>
    )
  }

  const conferindo = situacao === 'conferindo'
  const bloqueado = pendente || conferindo
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

      <Button type="submit" size="toque" disabled={bloqueado}>
        {conferindo
          ? NOVA_SENHA.conferindoLink
          : pendente
            ? NOVA_SENHA.enviando
            : NOVA_SENHA.enviar}
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
