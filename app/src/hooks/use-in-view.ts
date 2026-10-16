'use client'

import * as React from 'react'

export interface UseInViewOptions {
  /** Fração do elemento que precisa estar visível para disparar (0.0 a 1.0). Padrão: 0.15 */
  threshold?: number | number[]
  /** Margem ao redor do root/viewport. Padrão: '0px 0px -40px 0px' (dispara um pouco antes da borda inferior) */
  rootMargin?: string
  /** Se deve re-animar toda vez que o elemento sair e re-entrar na tela. Padrão: true */
  replayOnScroll?: boolean
  /** Se deve disparar apenas uma vez na vida útil do componente. Padrão: false */
  triggerOnce?: boolean
}

/**
 * Hook de alta performance que monitora se um elemento está visível no viewport do usuário.
 * Utiliza IntersectionObserver nativo sem dependências externas, respeitando `prefers-reduced-motion`.
 */
export function useInView<T extends HTMLElement = HTMLDivElement>({
  threshold = 0.15,
  rootMargin = '0px 0px -40px 0px',
  replayOnScroll = true,
  triggerOnce = false,
}: UseInViewOptions = {}) {
  const ref = React.useRef<T | null>(null)
  const [inView, setInView] = React.useState(false)
  const hasTriggeredRef = React.useRef(false)

  React.useEffect(() => {
    const elemento = ref.current
    if (!elemento || typeof window === 'undefined') return

    // Respeita a preferência do sistema operacional para redução de movimento
    const prefereReducaoMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefereReducaoMovimento) {
      setInView(true)
      return
    }

    if (!('IntersectionObserver' in window)) {
      setInView(true)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries
        if (!entry) return

        if (entry.isIntersecting) {
          setInView(true)
          hasTriggeredRef.current = true
          if (triggerOnce) {
            observer.unobserve(elemento)
          }
        } else {
          // Se replayOnScroll for true, reseta para falso ao sair da tela, permitindo que re-anime ao voltar
          if (replayOnScroll && !triggerOnce) {
            setInView(false)
          }
        }
      },
      {
        threshold,
        rootMargin,
      },
    )

    observer.observe(elemento)

    return () => {
      observer.disconnect()
    }
  }, [threshold, rootMargin, replayOnScroll, triggerOnce])

  return { ref, inView }
}
