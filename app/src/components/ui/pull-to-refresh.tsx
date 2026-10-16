'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { RotateCw } from 'lucide-react'
import { hapticFeedback } from '@/lib/haptics'
import { cn } from '@/lib/utils'

export interface PullToRefreshProps {
  children: React.ReactNode
  onRefresh?: () => Promise<void> | void
  className?: string
}

const LIMITE_DISPARO = 58

export function PullToRefresh({
  children,
  onRefresh,
  className,
}: PullToRefreshProps) {
  const router = useRouter()
  const [distanciaPuxada, setDistanciaPuxada] = React.useState(0)
  const [atualizando, setAtualizando] = React.useState(false)
  const toqueInicioY = React.useRef<number | null>(null)
  const ativoRef = React.useRef(false)

  const handleTouchStart = (e: React.TouchEvent) => {
    // Apenas se o scroll estiver no topo
    if (typeof window !== 'undefined' && window.scrollY <= 0 && !atualizando) {
      toqueInicioY.current = e.touches[0].clientY
      ativoRef.current = true
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!ativoRef.current || toqueInicioY.current === null || atualizando) return

    const atualY = e.touches[0].clientY
    const deltaY = atualY - toqueInicioY.current

    if (deltaY > 0 && typeof window !== 'undefined' && window.scrollY <= 0) {
      // Amortecimento elástico (estilo iOS)
      const amortecido = Math.min(Math.pow(deltaY, 0.82) * 2, 75)
      setDistanciaPuxada(amortecido)

      // Se passou o limite de disparo pela primeira vez nesta puxada
      if (amortecido >= LIMITE_DISPARO && distanciaPuxada < LIMITE_DISPARO) {
        hapticFeedback.light()
      }
    } else {
      setDistanciaPuxada(0)
      ativoRef.current = false
    }
  }

  const handleTouchEnd = async () => {
    if (!ativoRef.current) return
    ativoRef.current = false
    toqueInicioY.current = null

    if (distanciaPuxada >= LIMITE_DISPARO && !atualizando) {
      setAtualizando(true)
      setDistanciaPuxada(44)
      hapticFeedback.medium()

      try {
        if (onRefresh) {
          await onRefresh()
        } else {
          router.refresh()
        }
      } catch {
        // Ignora erros de rede na atualização
      } finally {
        setTimeout(() => {
          setAtualizando(false)
          setDistanciaPuxada(0)
        }, 550)
      }
    } else {
      setDistanciaPuxada(0)
    }
  }

  const progresso = Math.min(distanciaPuxada / LIMITE_DISPARO, 1)

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className={cn('relative min-h-screen', className)}
    >
      {/* Indicador de puxada flutuante */}
      {(distanciaPuxada > 0 || atualizando) && (
        <div
          className="pointer-events-none fixed left-1/2 -translate-x-1/2 z-40 transition-transform duration-200"
          style={{
            top: `calc(env(safe-area-inset-top, 0px) + ${distanciaPuxada}px)`,
          }}
        >
          <div
            className={cn(
              'flex size-9 items-center justify-center rounded-full bg-card/95 text-primary shadow-lg border border-border/80 backdrop-blur-md transition-all',
              distanciaPuxada >= LIMITE_DISPARO && 'ring-2 ring-primary/40',
            )}
            style={{
              transform: `scale(${0.6 + progresso * 0.4})`,
              opacity: Math.max(0.2, progresso),
            }}
          >
            <RotateCw
              className={cn(
                'size-4 text-primary transition-transform',
                atualizando && 'animate-spin',
              )}
              style={
                !atualizando
                  ? { transform: `rotate(${distanciaPuxada * 4}deg)` }
                  : undefined
              }
            />
          </div>
        </div>
      )}

      {/* Conteúdo deslocado suavemente se estiver puxando */}
      <div
        style={{
          transform: distanciaPuxada > 0 ? `translateY(${distanciaPuxada * 0.25}px)` : undefined,
          transition: distanciaPuxada === 0 ? 'transform 250ms cubic-bezier(0.16, 1, 0.3, 1)' : undefined,
        }}
      >
        {children}
      </div>
    </div>
  )
}
