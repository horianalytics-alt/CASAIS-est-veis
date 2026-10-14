'use client'

import * as React from 'react'
import { Bell, BellOff, BellRing, Loader2 } from 'lucide-react'
import { salvarInscricaoPush, removerInscricaoPush } from '@/actions/push'
import { suportaPush, urlBase64ToUint8Array } from '@/lib/push-cliente'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'

type Estado = 'carregando' | 'sem-suporte' | 'nao-inscrito' | 'inscrito' | 'pendente'

export function BotaoNotificacoes() {
  const [estado, setEstado] = React.useState<Estado>('carregando')
  const [mensagem, setMensagem] = React.useState<string | null>(null)
  const [inscricaoAtual, setInscricaoAtual] = React.useState<PushSubscription | null>(null)

  // Verifica se já existe inscrição ativa ao montar
  React.useEffect(() => {
    if (!suportaPush()) {
      setEstado('sem-suporte')
      return
    }

    navigator.serviceWorker.ready
      .then((registro) => registro.pushManager.getSubscription())
      .then((inscricao) => {
        if (inscricao) {
          setInscricaoAtual(inscricao)
          setEstado('inscrito')
        } else {
          setEstado('nao-inscrito')
        }
      })
      .catch(() => setEstado('nao-inscrito'))
  }, [])

  const ativar = async () => {
    setEstado('pendente')
    setMensagem(null)

    try {
      const permissao = await Notification.requestPermission()
      if (permissao !== 'granted') {
        setMensagem(
          permissao === 'denied'
            ? 'Permissão negada. Habilite as notificações nas configurações do navegador.'
            : 'Permissão não concedida.',
        )
        setEstado('nao-inscrito')
        return
      }

      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!vapidKey) {
        setMensagem('Configuração de notificações ausente. Contate o suporte.')
        setEstado('nao-inscrito')
        return
      }

      const registro = await navigator.serviceWorker.ready
      const inscricao = await registro.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      })

      const json = inscricao.toJSON() as {
        endpoint: string
        keys: { p256dh: string; auth: string }
        expirationTime?: number | null
      }

      const resposta = await salvarInscricaoPush(json)
      if (!resposta.ok) {
        setMensagem(resposta.erro ?? 'Não foi possível salvar a inscrição.')
        await inscricao.unsubscribe()
        setEstado('nao-inscrito')
        return
      }

      setInscricaoAtual(inscricao)
      setEstado('inscrito')
    } catch (err) {
      setMensagem('Erro ao ativar notificações. Tente novamente.')
      setEstado('nao-inscrito')
      console.error('[push] Erro ao inscrever:', err)
    }
  }

  const desativar = async () => {
    if (!inscricaoAtual) return
    setEstado('pendente')
    setMensagem(null)

    try {
      await inscricaoAtual.unsubscribe()
      const resposta = await removerInscricaoPush({ endpoint: inscricaoAtual.endpoint })
      if (!resposta.ok) {
        setMensagem(resposta.erro ?? 'Não foi possível remover a inscrição.')
      }
      setInscricaoAtual(null)
      setEstado('nao-inscrito')
    } catch {
      setMensagem('Erro ao desativar notificações.')
      setEstado('inscrito')
    }
  }

  if (estado === 'carregando') {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm py-1">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        <span>Verificando...</span>
      </div>
    )
  }

  if (estado === 'sem-suporte') {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm py-1">
        <BellOff className="size-4 shrink-0" aria-hidden="true" />
        <span>Seu navegador não suporta notificações push.</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {mensagem && (
        <Alert variant="destructive">
          <AlertDescription>{mensagem}</AlertDescription>
        </Alert>
      )}

      {estado === 'inscrito' ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm">
            <BellRing className="size-4 text-receita shrink-0" aria-hidden="true" />
            <span className="text-foreground font-medium">Notificações ativadas</span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="toque"
            onClick={desativar}
            disabled={estado !== 'inscrito'}
            className="gap-2"
          >
            <BellOff className="size-4" aria-hidden="true" />
            Desativar
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Bell className="size-4 shrink-0" aria-hidden="true" />
            <span>Receba avisos quando seu parceiro fizer lançamentos.</span>
          </div>
          <Button
            type="button"
            variant="default"
            size="toque"
            onClick={ativar}
            disabled={estado === 'pendente'}
            className="gap-2 shrink-0"
          >
            {estado === 'pendente' ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Ativando…
              </>
            ) : (
              <>
                <Bell className="size-4" aria-hidden="true" />
                Ativar notificações
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  )
}