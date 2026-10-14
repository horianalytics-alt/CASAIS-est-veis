'use client'

import * as React from 'react'
import { Mail, MailCheck, Loader2 } from 'lucide-react'
import { pedirRecuperacaoDeSenha } from '@/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { CampoErro } from '@/components/ui/campo-erro'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { RECUPERAR_SENHA } from '@/features/auth/copy'

export interface DialogoRecuperarSenhaProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  emailInicial?: string
}

export function DialogoRecuperarSenha({
  aberto,
  onOpenChange,
  emailInicial = '',
}: DialogoRecuperarSenhaProps) {
  const [email, setEmail] = React.useState(emailInicial)
  const [pendente, setPendente] = React.useState(false)
  const [enviado, setEnviado] = React.useState(false)
  const [erro, setErro] = React.useState<string | null>(null)
  const [erroCampo, setErroCampo] = React.useState<string[] | undefined>()

  React.useEffect(() => {
    if (aberto) {
      setEmail(emailInicial)
      setEnviado(false)
      setErro(null)
      setErroCampo(undefined)
    }
  }, [aberto, emailInicial])

  const aoEnviar = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro(null)
    setErroCampo(undefined)

    if (!email.trim()) {
      setErroCampo(['Informe o seu e-mail.'])
      return
    }

    setPendente(true)
    const resposta = await pedirRecuperacaoDeSenha({ email: email.trim() })
    setPendente(false)

    if (!resposta.ok) {
      setErro(resposta.erro ?? 'Não foi possível enviar o e-mail. Tente novamente.')
      if (resposta.camposComErro?.email) {
        setErroCampo(resposta.camposComErro.email)
      }
      return
    }

    setEnviado(true)
  }

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="size-5 text-primary" aria-hidden="true" />
            {RECUPERAR_SENHA.titulo}
          </DialogTitle>
          <DialogDescription>
            {RECUPERAR_SENHA.subtitulo}
          </DialogDescription>
        </DialogHeader>

        {enviado ? (
          <div className="flex flex-col items-center gap-4 py-4 text-center">
            <div className="bg-primary/10 text-primary flex size-12 items-center justify-center rounded-full">
              <MailCheck className="size-6" aria-hidden="true" />
            </div>
            <div className="flex flex-col gap-1.5">
              <h3 className="text-base font-semibold text-foreground">
                {RECUPERAR_SENHA.confirmacaoTitulo}
              </h3>
              <p className="text-sm text-muted-foreground">
                {RECUPERAR_SENHA.confirmacaoDescricao} Verifique também sua pasta de spam ou lixo eletrônico.
              </p>
            </div>
            <DialogFooter className="w-full mt-2">
              <Button
                type="button"
                variant="default"
                size="toque"
                onClick={() => onOpenChange(false)}
                className="w-full cursor-pointer"
              >
                Entendido
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={aoEnviar} className="flex flex-col gap-4 pt-2" noValidate>
            {erro && (
              <Alert variant="destructive">
                <AlertDescription>{erro}</AlertDescription>
              </Alert>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="recuperar-dialogo-email">{RECUPERAR_SENHA.emailLabel}</Label>
              <Input
                id="recuperar-dialogo-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  setErroCampo(undefined)
                }}
                placeholder={RECUPERAR_SENHA.emailPlaceholder}
                disabled={pendente}
                required
                className="min-h-[44px]"
                autoFocus
              />
              <CampoErro id="erro-recuperar-email" mensagens={erroCampo} />
            </div>

            <DialogFooter className="mt-2 flex-col sm:flex-row gap-2">
              <Button
                type="button"
                variant="outline"
                size="toque"
                onClick={() => onOpenChange(false)}
                disabled={pendente}
                className="cursor-pointer"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                size="toque"
                disabled={pendente}
                className="cursor-pointer"
              >
                {pendente ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    {RECUPERAR_SENHA.enviando}
                  </>
                ) : (
                  RECUPERAR_SENHA.enviar
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}