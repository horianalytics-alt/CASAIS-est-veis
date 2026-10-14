'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, CheckCircle2, Handshake } from 'lucide-react'
import { registrarAcerto } from '@/actions/acerto'
import { todayISO } from '@/lib/format'
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
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ValorMonetario } from '@/components/financeiro/valor-monetario'
import { DIALOGO_ACERTO } from '@/features/acerto/copy'

export interface DialogoAcertarProps {
  devedorId: string
  devedorNome: string
  credorId: string
  credorNome: string
  valor: number
  gatilho?: React.ReactNode
}

export function DialogoAcertar({
  devedorId,
  devedorNome,
  credorId,
  credorNome,
  valor,
  gatilho,
}: DialogoAcertarProps) {
  const router = useRouter()
  const [aberto, setAberto] = React.useState(false)
  const [dataAcerto, setDataAcerto] = React.useState<string>(todayISO())
  const [pendente, setPendente] = React.useState(false)
  const [erro, setErro] = React.useState<string | null>(null)
  const [sucesso, setSucesso] = React.useState(false)

  const aoEnviar = async (e: React.FormEvent) => {
    e.preventDefault()
    setPendente(true)
    setErro(null)

    const resposta = await registrarAcerto({
      deMembroId: devedorId,
      paraMembroId: credorId,
      valor,
      data: dataAcerto,
    })

    if (!resposta.ok) {
      setErro(resposta.erro ?? 'Erro ao registrar o acerto de contas.')
      setPendente(false)
      return
    }

    setSucesso(true)
    setPendente(false)
    setTimeout(() => {
      setAberto(false)
      setSucesso(false)
      router.refresh()
    }, 1000)
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        {gatilho ?? (
          <Button variant="default" size="toque" className="gap-2">
            <Handshake className="size-4" aria-hidden="true" />
            {DIALOGO_ACERTO.botaoConfirmar}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{DIALOGO_ACERTO.titulo}</DialogTitle>
          <DialogDescription>{DIALOGO_ACERTO.subtitulo}</DialogDescription>
        </DialogHeader>

        {sucesso ? (
          <div className="flex flex-col items-center justify-center gap-3 py-6 text-center">
            <CheckCircle2 className="text-receita size-12" aria-hidden="true" />
            <p className="text-[length:var(--texto-corpo)] font-medium">
              {DIALOGO_ACERTO.sucesso}
            </p>
          </div>
        ) : (
          <form onSubmit={aoEnviar} className="flex flex-col gap-4">
            {erro && (
              <Alert variant="destructive">
                <AlertDescription>{erro}</AlertDescription>
              </Alert>
            )}

            <div className="bg-muted/50 border-input flex flex-col gap-3 rounded-xl border p-4">
              <div className="flex items-center justify-between text-sm">
                <div className="flex flex-col">
                  <span className="text-muted-foreground text-xs">
                    {DIALOGO_ACERTO.devedor}
                  </span>
                  <span className="font-semibold">{devedorNome}</span>
                </div>
                <ArrowRight className="text-muted-foreground size-4" aria-hidden="true" />
                <div className="flex flex-col text-right">
                  <span className="text-muted-foreground text-xs">
                    {DIALOGO_ACERTO.credor}
                  </span>
                  <span className="font-semibold">{credorNome}</span>
                </div>
              </div>

              <div className="border-border/60 flex items-center justify-between border-t pt-2">
                <span className="text-muted-foreground text-xs">
                  {DIALOGO_ACERTO.valor}:
                </span>
                <ValorMonetario
                  valor={valor}
                  tipo="transferencia"
                  tamanho="destaque"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="data-acerto">{DIALOGO_ACERTO.data}</Label>
              <Input
                id="data-acerto"
                type="date"
                value={dataAcerto}
                onChange={(e) => setDataAcerto(e.target.value)}
                required
                className="min-h-[44px]"
              />
              <p className="text-muted-foreground text-xs">
                {DIALOGO_ACERTO.avisoTransferencia}
              </p>
            </div>

            <DialogFooter className="mt-2">
              <Button
                type="button"
                variant="outline"
                size="toque"
                onClick={() => setAberto(false)}
                disabled={pendente}
              >
                {DIALOGO_ACERTO.botaoCancelar}
              </Button>
              <Button
                type="submit"
                variant="default"
                size="toque"
                disabled={pendente}
              >
                {pendente ? DIALOGO_ACERTO.processando : DIALOGO_ACERTO.botaoConfirmar}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
