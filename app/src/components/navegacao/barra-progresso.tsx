'use client'

import * as React from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

export function BarraProgresso() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [ativo, setAtivo] = React.useState(false)
  const [progresso, setProgresso] = React.useState(0)
  const [visivel, setVisivel] = React.useState(false)
  const timerRef = React.useRef<NodeJS.Timeout | null>(null)
  const urlAtualRef = React.useRef<string>('')

  // Inicia a animação da barra de progresso
  const iniciar = React.useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    setVisivel(true)
    setAtivo(true)
    setProgresso(25)

    // Incrementa suavemente até 85% esperando a página carregar
    timerRef.current = setInterval(() => {
      setProgresso((ant) => {
        if (ant < 65) return ant + 15
        if (ant < 85) return ant + 5
        return ant
      })
    }, 180)
  }, [])

  // Conclui a barra de progresso
  const concluir = React.useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    setProgresso(100)
    const timeoutConclusao = setTimeout(() => {
      setVisivel(false)
      const timeoutReset = setTimeout(() => {
        setProgresso(0)
        setAtivo(false)
      }, 200)
      return () => clearTimeout(timeoutReset)
    }, 200)
    return () => clearTimeout(timeoutConclusao)
  }, [])

  // Quando pathname ou searchParams mudam, a navegação concluiu
  React.useEffect(() => {
    const urlAtual = `${pathname}${searchParams ? `?${searchParams.toString()}` : ''}`
    if (urlAtualRef.current && urlAtualRef.current !== urlAtual) {
      concluir()
    }
    urlAtualRef.current = urlAtual
  }, [pathname, searchParams, concluir])

  // Intercepta cliques de links no documento para resposta visual instantânea de 0ms
  React.useEffect(() => {
    function tratarClique(e: MouseEvent) {
      const link = (e.target as HTMLElement)?.closest('a')
      if (!link) return

      const href = link.getAttribute('href')
      if (!href) return

      // Ignora links externos, abas novas ou âncoras locais
      if (
        link.target === '_blank' ||
        link.hasAttribute('download') ||
        link.getAttribute('rel')?.includes('external') ||
        href.startsWith('mailto:') ||
        href.startsWith('tel:') ||
        href.startsWith('#')
      ) {
        return
      }

      // Se for para a mesma URL exata, não dispara
      const urlDestino = new URL(href, window.location.href)
      if (urlDestino.origin !== window.location.origin) return

      const rotaAtual = window.location.pathname + window.location.search
      const rotaDestino = urlDestino.pathname + urlDestino.search
      if (rotaAtual === rotaDestino) return

      iniciar()
    }

    document.addEventListener('click', tratarClique, { capture: true })
    return () => {
      document.removeEventListener('click', tratarClique, { capture: true })
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [iniciar])

  if (!visivel && progresso === 0) return null

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed top-0 inset-x-0 z-[99999] h-[3px] overflow-hidden"
      style={{
        opacity: visivel ? 1 : 0,
        transition: 'opacity 200ms ease-in-out',
      }}
    >
      <div
        className="h-full bg-primary shadow-xs transition-all ease-out"
        style={{
          width: `${progresso}%`,
          transitionDuration: progresso === 100 ? '150ms' : '250ms',
        }}
      />
    </div>
  )
}
