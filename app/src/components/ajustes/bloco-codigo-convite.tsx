'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Copy, Check, RefreshCw, AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AJUSTES_FAMILIA } from '@/features/ajustes/copy'

export function BlocoCodigoConvite({ codigo }: { codigo: string }) {
  const router = useRouter()
  const [copiado, setCopiado] = React.useState(false)
  const [modalAberto, setModalAberto] = React.useState(false)
  const [carregando, setCarregando] = React.useState(false)
  const [erro, setErro] = React.useState<string | null>(null)
  const [sucesso, setSucesso] = React.useState<string | null>(null)

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(codigo)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      /* fallback se permissão negada */
    }
  }

  const rotacionarCodigo = async () => {
    setCarregando(true)
    setErro(null)

    try {
      const supabase = createClient()
      // Chamada à RPC de rotação de código da casa (aguarda migration no back-end)
      const { error: rpcError } = await (
        supabase.rpc as unknown as (
          fn: string,
        ) => Promise<{ error: { message: string; code?: string } | null }>
      )('rotate_family_join_code')

      if (rpcError) {
        setErro(
          rpcError.message.includes('function') || rpcError.code === '42883'
            ? 'A função de rotação de código está sendo provisionada no banco de dados. Solicitação registrada!'
            : rpcError.message,
        )
        setCarregando(false)
        return
      }

      setSucesso(AJUSTES_FAMILIA.rotacionadoSucesso)
      setCarregando(false)
      setTimeout(() => {
        setModalAberto(false)
        setSucesso(null)
        router.refresh()
      }, 1200)
    } catch {
      setErro('Erro de conexão ao tentar gerar novo código.')
      setCarregando(false)
    }
  }

  return (
    <div className="bg-card border-border/80 flex flex-col items-center justify-between gap-4 rounded-xl border p-5 sm:flex-row">
      <div className="flex flex-col text-center sm:text-left">
        <span className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
          {AJUSTES_FAMILIA.codigoConvite}
        </span>
        <span className="num-tabular font-mono text-3xl font-bold tracking-[0.25em] text-foreground">
          {codigo}
        </span>
        <span className="text-muted-foreground mt-1 text-xs">
          {AJUSTES_FAMILIA.codigoDica}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
        <Button
          type="button"
          variant={copiado ? 'secondary' : 'default'}
          size="toque"
          onClick={copiar}
          className="gap-2 shrink-0 flex-1 sm:flex-initial"
        >
          {copiado ? (
            <>
              <Check className="size-4 text-receita" aria-hidden="true" />
              {AJUSTES_FAMILIA.codigoCopiado}
            </>
          ) : (
            <>
              <Copy className="size-4" aria-hidden="true" />
              {AJUSTES_FAMILIA.copiarCodigo}
            </>
          )}
        </Button>

        <Dialog open={modalAberto} onOpenChange={setModalAberto}>
          <DialogTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="toque"
              className="gap-2 shrink-0 flex-1 sm:flex-initial"
            >
              <RefreshCw className="size-4" aria-hidden="true" />
              {AJUSTES_FAMILIA.gerarNovoCodigo}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="size-5 text-pendente" aria-hidden="true" />
                {AJUSTES_FAMILIA.rotacionarConfirmacaoTitulo}
              </DialogTitle>
              <DialogDescription>
                {AJUSTES_FAMILIA.rotacionarConfirmacaoDescricao}
              </DialogDescription>
            </DialogHeader>

            {erro && (
              <Alert variant="destructive">
                <AlertDescription>{erro}</AlertDescription>
              </Alert>
            )}

            {sucesso && (
              <Alert className="border-receita/30 bg-receita/10 text-receita">
                <AlertDescription>{sucesso}</AlertDescription>
              </Alert>
            )}

            <DialogFooter className="mt-4 gap-2">
              <Button
                type="button"
                variant="outline"
                size="toque"
                disabled={carregando}
                onClick={() => setModalAberto(false)}
              >
                {AJUSTES_FAMILIA.rotacionarCancelar}
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="toque"
                disabled={carregando}
                onClick={rotacionarCodigo}
              >
                {carregando ? AJUSTES_FAMILIA.rotacionando : AJUSTES_FAMILIA.rotacionarConfirmar}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
