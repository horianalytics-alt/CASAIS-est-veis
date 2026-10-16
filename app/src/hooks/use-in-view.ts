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
function estaVisivelNoViewport(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) return false
  const windowHeight = window.innerHeight || document.documentElement.clientHeight
  const windowWidth = window.innerWidth || document.documentElement.clientWidth

  return rect.top < windowHeight && rect.bottom > 0 && rect.left < windowWidth && rect.right > 0
}

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

    // Re-checagem ativa de visibilidade quando o elemento ganha layout (ex: transição de display:none em abas)
    const checarVisibilidade = () => {
      if (!elemento) return
      if (estaVisivelNoViewport(elemento)) {
        setInView(true)
        hasTriggeredRef.current = true
        if (triggerOnce) {
          observer.unobserve(elemento)
        }
      }
    }

    // 1. Checagem em rAF para elementos que já nascem visíveis no primeiro paint
    const rafId = requestAnimationFrame(() => {
      checarVisibilidade()
    })

    // 2. ResizeObserver: detecta quando o elemento ou pai sai de display:none (0x0) para display ativo (>0)
    let resizeObserver: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        checarVisibilidade()
      })
      resizeObserver.observe(elemento)
    }

    // 3. MutationObserver no tabpanel ancestral mais próximo: reavalia quando a aba ativa muda
    let mutationObserver: MutationObserver | null = null
    const tabPanel = elemento.closest('[data-slot="tabs-content"], [role="tabpanel"]')
    if (typeof MutationObserver !== 'undefined' && tabPanel) {
      mutationObserver = new MutationObserver(() => {
        checarVisibilidade()
      })
      mutationObserver.observe(tabPanel, {
        attributes: true,
        attributeFilter: ['data-state', 'hidden', 'style', 'class'],
      })
    }

    return () => {
      cancelAnimationFrame(rafId)
      observer.disconnect()
      resizeObserver?.disconnect()
      mutationObserver?.disconnect()
    }
  }, [threshold, rootMargin, replayOnScroll, triggerOnce])

  return { ref, inView }
}
