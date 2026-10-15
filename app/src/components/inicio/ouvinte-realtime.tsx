'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Bell, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { rotuloDoMes } from '@/lib/hoje'
import { formatBRL } from '@/lib/format'
import { useOcultarValores } from '@/components/providers/ocultar-valores-provider'
import { tocarSomSucesso } from '@/features/sons/sons'

export interface OuvinteRealtimeProps {
  familyId: string
  mesExibido: string
  idsIniciais: string[]
  membros?: { id: string; display_name: string }[]
  meuId?: string | null
}

interface AvisoOutroMes {
  mes: string
  rotulo: string
  titulo: string
  descricao?: string
  noMesmoMes?: boolean
}

export function OuvinteRealtime({
  familyId,
  mesExibido,
  idsIniciais,
  membros = [],
  meuId,
}: OuvinteRealtimeProps) {
  const router = useRouter()
  const { oculto } = useOcultarValores()
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
          const nova = payload.new as {
            id?: string
            date?: string
            description?: string
            amount?: number
            paid_by_member_id?: string
          } | undefined
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

          // Monta dados do toast com nome do autor e respeito ao Modo Privacidade
          const autor = membros.find((m) => m.id === nova?.paid_by_member_id)
          const nomeAutor = autor ? autor.display_name : 'Seu parceiro'
          const valorFormatado =
            !oculto && typeof nova?.amount === 'number'
              ? ` (${formatBRL(nova.amount)})`
              : ''
          const textoDescricao = `${nova?.description || 'Lançamento'}${valorFormatado}`
          const titulo = `${nomeAutor} acabou de lançar`

          // Se a transação for de outro mês, avisa e dá o link
          if (mesTx && mesTx !== mesExibido) {
            setAviso({
              mes: mesTx,
              rotulo: rotuloDoMes(mesTx),
              titulo,
              descricao: textoDescricao,
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
              titulo,
              descricao: textoDescricao,
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
  }, [familyId, mesExibido, router, membros, oculto])

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
        <span className="text-foreground font-semibold">
          {aviso.titulo}
        </span>
        <span className="text-muted-foreground truncate max-w-[210px]">
          {aviso.descricao}
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
