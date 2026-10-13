'use client'

// 'use client' porque este componente tem estado de envio (useActionState) e
// precisa do resultado da action para pintar erro sem recarregar a página.
// É folha: a page que o renderiza continua Server Component.

import { useActionState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { entrar } from '@/actions/auth'
import type { ResultadoAction } from '@/actions/resultado'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { CampoErro } from '@/components/ui/campo-erro'
import { LOGIN } from '@/features/auth/copy'
import { caminhoInternoSeguro } from '@/features/auth/destino'

export interface FormLoginProps {
  /**
   * Caminho interno para onde voltar após entrar, vindo do `?proximo=` que o
   * proxy grava. Já validado pela page como caminho interno.
   */
  proximo?: string
}

type Estado = ResultadoAction<void> | null

export function FormLogin({ proximo }: FormLoginProps) {
  const router = useRouter()

  // ADAPTADOR DE ARIDADE: `entrar` é (formData) => Promise<ResultadoAction>,
  // um argumento só. O useActionState chama (estadoAnterior, payload). Passar
  // `entrar` direto não compila. O adaptador vive aqui, no client, e não
  // reimplementa nada da action.
  const [estado, enviar, pendente] = useActionState<Estado, FormData>(
    async (_anterior, formData) => {
      const resultado = await entrar(formData)
      if (resultado.ok) {
        // SEGUNDA barreira contra redirect aberto: a page já validou o
        // `?proximo=` no servidor, e revalidamos aqui porque é esta linha que
        // navega. Defesa em profundidade — se o destino passar a ser montado
        // por outro caminho, esta checagem continua valendo.
        const destino = caminhoInternoSeguro(proximo) ?? '/inicio'
        // A sessão nasce num cookie escrito pela action. O refresh faz o
        // Server Component do destino ler a sessão nova; sem ele a navegação
        // poderia renderizar com o estado antigo.
        router.replace(destino)
        router.refresh()
      }
      return resultado
    },
    null,
  )

  const falhou = estado !== null && !estado.ok
  const campos = falhou ? estado.camposComErro : undefined

  return (
    <form action={enviar} className="flex flex-col gap-[var(--esp-5)]" noValidate>
      {/* Erro geral (credencial errada, rede). Erro de campo fica no campo. */}
      {falhou && !campos ? (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-[var(--esp-2)]">
        <Label htmlFor="email">{LOGIN.emailLabel}</Label>
        <Input
          id="email"
          // O name casa com o schema Zod da action: 'email', em português
          // quando o campo é em português. Errar o name faz o Zod acusar
          // campo vazio com o formulário visivelmente preenchido.
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          placeholder={LOGIN.emailPlaceholder}
          aria-invalid={campos?.email ? true : undefined}
          aria-describedby={campos?.email ? 'erro-email' : undefined}
          disabled={pendente}
        />
        <CampoErro id="erro-email" mensagens={campos?.email} />
      </div>

      <div className="flex flex-col gap-[var(--esp-2)]">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="senha">{LOGIN.senhaLabel}</Label>
          <Link
            href="/recuperar-senha"
            className="text-primary inline-block py-[14px] text-[length:var(--texto-apoio)] leading-[var(--texto-apoio-lh)] underline underline-offset-4"
          >
            {LOGIN.esqueciSenha}
          </Link>
        </div>
        <Input
          id="senha"
          name="senha"
          type="password"
          autoComplete="current-password"
          aria-invalid={campos?.senha ? true : undefined}
          aria-describedby={campos?.senha ? 'erro-senha' : undefined}
          disabled={pendente}
        />
        <CampoErro id="erro-senha" mensagens={campos?.senha} />
      </div>

      {/* size="toque" = min-h-44px (A-1): nenhuma variante padrão do shadcn
          chega a 44px e este app é instalado no celular. */}
      <Button type="submit" size="toque" disabled={pendente}>
        {pendente ? LOGIN.enviando : LOGIN.enviar}
      </Button>

      {/* A-1 / WCAG 2.5.5: medido com getBoundingClientRect, este link dava
          66x16px e reprovava. `inline-block` + py-[14px] leva a caixa a 44px
          sem empurrar o texto ao redor — a linha continua lendo como frase.
          min-h-[44px] não serviria: em elemento inline ele é ignorado. */}
      <p className="text-muted-foreground text-[length:var(--texto-apoio)] leading-[var(--texto-apoio-lh)]">
        {LOGIN.semConta}{' '}
        <Link
          href="/cadastro"
          className="text-primary inline-block py-[14px] underline underline-offset-4"
        >
          {LOGIN.irParaCadastro}
        </Link>
      </p>
    </form>
  )
}
