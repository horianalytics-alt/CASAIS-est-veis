'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Bell, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { rotuloDoMes } from '@/lib/hoje'
import { tocarSomSucesso } from '@/features/sons/sons'

export interface OuvinteRealtimeProps {
  familyId: string
  mesExibido: string
  idsIniciais: string[]
}

interface AvisoOutroMes {
  mes: string
  rotulo: string
  descricao?: string
  noMesmoMes?: boolean
}

export function OuvinteRealtime({
  familyId,
  mesExibido,
  idsIniciais,
}: OuvinteRealtimeProps) {
  const router = useRouter()
  const idsConhecidos = React.useRef(new Set<string>(idsIniciais))
  const [aviso, setAviso] = React.useState<AvisoOutroMes | null>(null)

  // Atualiza conjunto com IDs da página renderizada
  React.useEffect(() => {
    for (const id of idsIniciais) {
      idsConhecidos.current.add(id)
    }
  }, [idsIniciais])

  // Fecha aviso do mesmo mês após 5 segundos
  React.useEffect(() => {
    if (aviso?.noMesmoMes) {
      const timer = setTimeout(() => setAviso(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [aviso])

  React.useEffect(() => {
    if (!familyId) return

    const supabase = createClient()
    const topico = `family:${familyId}`

    const canal = supabase
      .channel(topico)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transactions',
          filter: `family_id=eq.${familyId}`,
        },
        (payload) => {
          const nova = payload.new as { id?: string; date?: string; description?: string } | undefined
          const antiga = payload.old as { id?: string } | undefined
          const id = nova?.id ?? antiga?.id

          // Desduplicação obrigatória (se o próprio usuário lançou e revalidou)
          if (payload.eventType === 'INSERT') {
            if (id && idsConhecidos.current.has(id)) {
              return
            }

            // Transação criada pelo parceiro! Toca som de notificação
            tocarSomSucesso()
          }

          const dataTx = nova?.date
          const mesTx = dataTx ? dataTx.slice(0, 7) : null

          // Se a transação for de outro mês, avisa e dá o link
          if (mesTx && mesTx !== mesExibido) {
            setAviso({
              mes: mesTx,
              rotulo: rotuloDoMes(mesTx),
              descricao: nova?.description,
              noMesmoMes: false,
            })
            return
          }

          // Se for do mês exibido
          if (id) {
            idsConhecidos.current.add(id)
          }

          if (payload.eventType === 'INSERT') {
            setAviso({
              mes: mesExibido,
              rotulo: rotuloDoMes(mesExibido),
              descricao: nova?.description,
              noMesmoMes: true,
            })
          }

          router.refresh()
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(canal)
    }
  }, [familyId, mesExibido, router])

  if (!aviso) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-20 right-4 z-50 flex max-w-sm items-center gap-3 rounded-xl border border-border/80 bg-card p-3.5 shadow-lg lg:bottom-6 animate-in fade-in slide-in-from-bottom-3 duration-200"
    >
      <div className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-lg">
        <Bell className="size-4" aria-hidden="true" />
      </div>
      <div className="flex flex-col text-xs">
        <span className="text-foreground font-medium">
          {aviso.noMesmoMes ? 'Novo lançamento sincronizado!' : 'Novo lançamento registrado'}
        </span>
        <span className="text-muted-foreground truncate max-w-[190px]">
          {aviso.descricao ? <strong>{aviso.descricao}</strong> : null}
          {!aviso.noMesmoMes && ` em ${aviso.rotulo}`}
        </span>
      </div>
      {!aviso.noMesmoMes && (
        <Link
          href={`/inicio?mes=${aviso.mes}`}
          onClick={() => setAviso(null)}
          className="ml-auto text-primary hover:underline text-xs font-semibold whitespace-nowrap"
        >
          Ver mês
        </Link>
      )}
      <button
        type="button"
        onClick={() => setAviso(null)}
        aria-label="Fechar aviso"
        className="ml-auto text-muted-foreground hover:text-foreground p-1"
      >
        <X className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  )
}
